"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Route as RouteIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, Modal, PageHeader, Spinner } from "@/components/ui/kit";
import PlanCard from "@/components/plan/PlanCard";
import type { PlanDTO } from "@/lib/types";

export default function PlanPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanDTO[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PlanDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/plans", { cache: "no-store" });
      if (res.ok) setPlans(((await res.json()) as { plans: PlanDTO[] }).plans);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener("plans:changed", onChange);
    return () => window.removeEventListener("plans:changed", onChange);
  }, [load]);

  const drafts = plans.filter((p) => p.status === "draft");
  const formal = plans.filter((p) => p.status !== "draft");
  // 确认框里要写清楚会连带删掉多少知识点（课程里已归入的知识点）
  const conceptsToDelete = (pendingDelete?.items ?? []).reduce(
    (n, item) => n + item.concepts.length,
    0,
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title="学习计划"
        action={
          <Button variant="secondary" size="sm" onClick={() => router.push("/new?mode=goal")}>
            设定新目标
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-[13px] text-ink3">
          <Spinner /> 读取计划…
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<RouteIcon className="size-6" />}
          title="还没有学习计划"
          description="描述一个目标，AI 先给课程与知识点草稿，确认后才开始。"
          action={
            <Button variant="secondary" onClick={() => router.push("/new?mode=goal")}>
              去设定目标
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {drafts.length > 0 ? (
            <section>
              <h2 className="mb-2 text-[12px] font-medium text-ink3">待确认草稿</h2>
              <div className="flex flex-col gap-2.5">
                {drafts.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} onDelete={() => setPendingDelete(plan)} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            {drafts.length > 0 ? (
              <h2 className="mb-2 text-[12px] font-medium text-ink3">正式计划</h2>
            ) : null}
            {formal.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-ink3">
                还没有已确认的计划。
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {formal.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} onDelete={() => setPendingDelete(plan)} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="删除这个学习计划？"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deleting}
              onClick={async () => {
                if (!pendingDelete) return;
                setDeleting(true);
                try {
                  const res = await fetch(`/api/plans/${pendingDelete.id}`, { method: "DELETE" });
                  const data = (await res.json()) as {
                    plans?: PlanDTO[];
                    error?: string;
                    concepts?: number;
                  };
                  if (!res.ok) throw new Error(data.error ?? "删除失败");
                  setPlans(data.plans ?? []);
                  setPendingDelete(null);
                  window.dispatchEvent(new Event("sessions:changed"));
                  window.dispatchEvent(new Event("plans:changed"));
                  toast.success(
                    data.concepts
                      ? `计划已删除，同时移除 ${data.concepts} 个知识点`
                      : "计划已删除",
                  );
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              确认删除
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink2">
          「{pendingDelete?.title}」的 {pendingDelete?.items.length ?? 0} 门课程会一起删除。
        </p>
        {conceptsToDelete > 0 ? (
          <p className="mt-2 rounded-xl border border-line bg-badsoft/40 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink2">
            这 {conceptsToDelete} 个知识点、以及它们上面的作答记录与掌握度证据会
            <span className="font-medium text-bad">一起删除</span>，无法撤销。
          </p>
        ) : null}
        <p className="mt-2 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink2">
          对话历史会保留（不再计入这个计划）；仍被其它计划使用的知识点只会解除本计划的归属，
          不会被删除。
        </p>
      </Modal>
    </div>
  );
}

