"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Route as RouteIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, Modal, Spinner } from "@/components/ui/kit";
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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-ink3">
            <RouteIcon className="size-3.5" /> 目标学习
          </div>
          <h1 className="font-serif text-[26px] tracking-tight text-ink">学习计划</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink2">
            进度只算本课程内已掌握的知识点。
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push("/?mode=goal")}>
          设定新目标
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-[13px] text-ink3">
          <Spinner /> 读取计划…
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<RouteIcon className="size-6" />}
          title="还没有学习计划"
          description="描述一个想系统掌握的目标，AI 会先生成课程与知识点草稿；你确认后才会开始正式学习。"
          action={
            <Button variant="secondary" onClick={() => router.push("/?mode=goal")}>
              去设定目标
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {drafts.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[12px] font-medium uppercase tracking-wide text-ink3">
                  待确认草稿
                </h2>
                <span className="text-[12px] text-ink3">确认前不会产生学习进度</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {drafts.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} onDelete={() => setPendingDelete(plan)} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            {drafts.length > 0 ? (
              <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink3">
                正式计划
              </h2>
            ) : null}
            {formal.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-ink3">
                还没有已确认的计划。先确认上面的草稿，或在首页设定一个新目标。
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

      {plans.length > 0 ? (
        <p className="mt-6 text-[12px] leading-relaxed text-ink3">
          无限学习不会出现在这里。它的历史对话在
          <Link href="/history" className="mx-1 underline underline-offset-2">
            历史
          </Link>
          中单独归类。
        </p>
      ) : null}

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
                  const data = (await res.json()) as { plans?: PlanDTO[]; error?: string };
                  if (!res.ok) throw new Error(data.error ?? "删除失败");
                  setPlans(data.plans ?? []);
                  setPendingDelete(null);
                  window.dispatchEvent(new Event("sessions:changed"));
                  window.dispatchEvent(new Event("plans:changed"));
                  toast.success("计划已删除");
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
        <p className="mt-2 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink2">
          知识点、作答记录和掌握度证据<span className="font-medium text-ink">不会</span>被删除；
          知识点会回到「待整理」，可以在学习档案里重新归入其他课程。
        </p>
      </Modal>
    </div>
  );
}
