"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Clock, Repeat2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, EmptyState, PageHeader, SectionHeader, Spinner, cx } from "@/components/ui/kit";
import { PlanSelect, usePlans } from "@/components/PlanSelect";
import type { ReviewItemDTO } from "@/lib/types";
import { groupByPlan } from "@/lib/utils";

export default function ReviewPage() {
  const router = useRouter();
  const { plans } = usePlans();
  const [items, setItems] = useState<ReviewItemDTO[]>([]);
  const [planFilter, setPlanFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/review", { cache: "no-store" });
      if (res.ok) setItems(((await res.json()) as { items: ReviewItemDTO[] }).items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // 计划页计数点进来时，预选对应计划
    const plan = new URLSearchParams(window.location.search).get("plan");
    if (plan) setPlanFilter(plan);
  }, [load]);

  useEffect(() => {
    if (planFilter !== "all" && planFilter !== "none" && plans.length > 0 && !plans.some((p) => p.id === planFilter)) {
      setPlanFilter("all");
    }
  }, [plans, planFilter]);

  const filtered = useMemo(
    () =>
      items.filter((it) =>
        planFilter === "all" ? true : planFilter === "none" ? !it.planId : it.planId === planFilter,
      ),
    [items, planFilter],
  );

  const groups = useMemo(() => groupByPlan(filtered), [filtered]);
  const selectedPlan =
    planFilter !== "all" && planFilter !== "none" ? plans.find((p) => p.id === planFilter) ?? null : null;

  const act = async (id: string, status: "accepted" | "dismissed" | "done") => {
    setBusy(id);
    try {
      const res = await fetch("/api/review", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) setItems(((await res.json()) as { items: ReviewItemDTO[] }).items);
    } finally {
      setBusy(null);
    }
  };

  const practice = async (item: ReviewItemDTO) => {
    // 结构化复习：把"聚焦哪个知识点 / 哪条复习"交给系统，而不是写进一句话里求模型配合
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "review",
        focusConceptId: item.conceptId,
        reviewItemId: item.id,
        planId: item.planId,
        title: `复习：${item.conceptName}`,
      }),
    });
    if (!res.ok) {
      toast.error("创建会话失败");
      return;
    }
    const { session, reused } = (await res.json()) as {
      session: { id: string };
      reused?: boolean;
    };
    if (reused) {
      toast.message("继续上次这条复习", {
        description: "上次还没作答，直接接着做，不会重复开新会话。",
      });
    }
    router.push(`/s/${session.id}`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader title="该回头看一眼的" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-ink3">
          计划
          <PlanSelect
            plans={plans}
            mode="filter"
            value={planFilter}
            onChange={setPlanFilter}
            className="max-w-[220px] rounded-full border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink2 outline-none hover:border-linestrong"
            ariaLabel="按计划筛选复习"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-[13px] text-ink3">
          <Spinner /> 正在根据证据计算…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CheckCheck className="size-6" />}
          title={
            items.length === 0
              ? "暂时没有需要复习的"
              : `「${selectedPlan?.title ?? "未归类"}」暂时没有需要复习的`
          }
          description={
            items.length === 0
              ? "做错、用提示、或到期时，这里会出现建议。"
              : "换个计划筛选看看，或先在这个计划下完成一次练习。"
          }
          action={
            <Button variant="secondary" onClick={() => router.push("/")}>
              继续学习
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.planId ?? "ungrouped"}>
              <SectionHeader title={g.planTitle} />
              <div className="flex flex-col gap-2">
                {g.items.map((it) => (
                  <div
                    key={it.id}
                    className={cx(
                      "rounded-xl border bg-panel px-4 py-3",
                      it.priority === 1 ? "border-warn/30" : "border-line",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[14px] font-medium text-ink">{it.conceptName}</p>
                          {it.courseName ? <Badge tone="neutral">{it.courseName}</Badge> : null}
                          {it.priority === 1 ? <Badge tone="warn">优先</Badge> : null}
                          {it.dueAt ? (
                            <span className="flex items-center gap-1 text-[12px] text-ink3">
                              <Clock className="size-3" />
                              {new Date(it.dueAt).toLocaleDateString("zh-CN")}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">{it.reason}</p>
                        <Link
                          href={`/library?c=${it.conceptId}`}
                          className="mt-1 inline-block text-[12px] text-ink3 underline-offset-2 hover:text-accentink hover:underline"
                        >
                          查看知识点依据
                        </Link>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        <Button size="sm" onClick={() => void practice(it)} loading={busy === it.id}>
                          练一练
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void act(it.id, "done")}
                          className="text-ink3"
                          title="标记为已复习"
                        >
                          <CheckCheck className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void act(it.id, "dismissed")}
                          className="text-ink3"
                          title="忽略这条建议"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

