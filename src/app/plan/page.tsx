"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleDashed, Route as RouteIcon, SkipForward, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, EmptyState, Modal, Progress, Spinner, cx } from "@/components/ui/kit";
import type { ConceptDTO, PlanDTO } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "未开始",
  in_progress: "进行中",
  done: "已完成",
  skipped: "已跳过",
};

export default function PlanPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanDTO[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PlanDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<ConceptDTO[]>([]);
  const [binding, setBinding] = useState<{
    plan: PlanDTO;
    item: PlanDTO["items"][number];
  } | null>(null);
  const [bindDraft, setBindDraft] = useState("");
  const [bindingBusy, setBindingBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [res, conceptRes] = await Promise.all([
        fetch("/api/plans", { cache: "no-store" }),
        fetch("/api/concepts", { cache: "no-store" }),
      ]);
      if (res.ok) setPlans(((await res.json()) as { plans: PlanDTO[] }).plans);
      if (conceptRes.ok) {
        const data = (await conceptRes.json()) as { concepts: ConceptDTO[] };
        setConcepts(data.concepts);
      }
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

  const setStatus = async (planId: string, itemId: string, status: string) => {
    setBusy(itemId);
    try {
      const res = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, status }),
      });
      if (res.ok) {
        const { plan } = (await res.json()) as { plan: PlanDTO };
        setPlans((ps) => ps.map((p) => (p.id === plan.id ? plan : p)));
      }
    } finally {
      setBusy(null);
    }
  };

  const openBind = (plan: PlanDTO, item: PlanDTO["items"][number]) => {
    setBinding({ plan, item });
    setBindDraft(item.conceptId ?? "");
  };

  const saveBind = async () => {
    if (!binding || bindingBusy) return;
    setBindingBusy(true);
    try {
      const res = await fetch(`/api/plans/${binding.plan.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: binding.item.id, conceptId: bindDraft || null }),
      });
      const data = (await res.json()) as { plan?: PlanDTO; error?: string };
      if (!res.ok || !data.plan) throw new Error(data.error ?? "改绑失败");
      setPlans((ps) => ps.map((p) => (p.id === data.plan!.id ? data.plan! : p)));
      setBinding(null);
      window.dispatchEvent(new Event("plans:changed"));
      toast.success(bindDraft ? "已改绑本步知识点" : "已解除本步知识点绑定");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBindingBusy(false);
    }
  };

  const startItem = async (plan: PlanDTO, item: PlanDTO["items"][number]) => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "goal",
        planId: plan.id,
        planItemId: item.id,
        ...(item.conceptId ? { focusConceptId: item.conceptId } : {}),
      }),
    });
    if (!res.ok) {
      toast.error("创建会话失败");
      return;
    }
    const { session } = (await res.json()) as { session: { id: string } };
    await setStatus(plan.id, item.id, "in_progress");
    const focusText = item.conceptName ? `聚焦知识点「${item.conceptName}」。` : "";
    const q = `按我的学习路线「${plan.title}」，现在学这一步：${item.title}。${focusText}${item.rationale ?? ""} 先讲清楚再出题检验。`;
    router.push(`/s/${session.id}?q=${encodeURIComponent(q)}&minutes=20`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11.5px] uppercase tracking-[0.14em] text-ink3">
            <RouteIcon className="size-3.5" /> 学习计划
          </div>
          <h1 className="font-serif text-[26px] tracking-tight text-ink">可调整的路线图</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink2">
            每条路线就是一个学习目标：它的会话、材料和到期复习都归在这条路线下。步骤完成由证据判定：本步至少有 3
            个不同知识点独立答对（未看解析、未用提示）就会自动完成。你也可以在计划页手动调整状态。
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push("/?new=1&mode=goal")}>
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
          title="还没有学习路线"
          description="说明你的目标（例如「两周内搞定期末线代」），AI 会生成一条路线；你可以逐步标记完成或跳过。"
          action={
            <Button variant="secondary" onClick={() => router.push("/?new=1&mode=goal")}>
              去设定目标
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {plans.map((plan) => (
            <section key={plan.id} className="rounded-2xl border border-line bg-panel p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-serif text-[16px] text-ink">{plan.title}</h2>
                  {plan.note ? <p className="mt-0.5 text-[12px] text-ink3">{plan.note}</p> : null}
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink3">
                    <Link href={`/history?plan=${plan.id}`} className="hover:text-accentink hover:underline">
                      {plan.counts.sessions} 个会话
                    </Link>
                    <span>·</span>
                    <Link href={`/materials?plan=${plan.id}`} className="hover:text-accentink hover:underline">
                      {plan.counts.materials} 份材料
                    </Link>
                    <span>·</span>
                    <Link href={`/review?plan=${plan.id}`} className="hover:text-accentink hover:underline">
                      {plan.counts.reviews} 条待复习
                    </Link>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={plan.progress.done === plan.progress.total ? "ok" : "accent"}>
                    {plan.progress.done}/{plan.progress.total}
                  </Badge>
                  <button
                    onClick={() => setPendingDelete(plan)}
                    className="rounded-full p-1.5 text-ink3 transition-colors hover:bg-badsoft hover:text-bad"
                    title="删除这条路线"
                    aria-label="删除这条路线"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <Progress value={plan.progress.done} max={Math.max(1, plan.progress.total)} className="mb-3" />
              <div className="flex flex-col gap-1">
                {plan.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className={cx(
                      "flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors",
                      item.status === "done" ? "opacity-60" : "hover:bg-panel2/50",
                    )}
                  >
                    <button
                      onClick={() => void setStatus(plan.id, item.id, item.status === "done" ? "pending" : "done")}
                      disabled={busy === item.id}
                      aria-label={item.status === "done" ? "标记为未完成" : "手动标记完成"}
                      className={cx(
                        "mt-0.5 flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[11px] transition-colors",
                        item.status === "done"
                          ? "border-ok/40 bg-oksoft text-ok"
                          : "border-line text-ink3 hover:border-accent hover:text-accentink",
                      )}
                      title={
                        item.status === "done"
                          ? "标记为未完成"
                          : "手动标记完成（不会补足知识点证据）"
                      }
                    >
                      <span
                        className={cx(
                          "flex size-5 items-center justify-center rounded-full border",
                          item.status === "done" ? "border-ok bg-ok text-white" : "border-line",
                        )}
                      >
                        {item.status === "done" ? (
                          <Check className="size-3" />
                        ) : (
                          <span className="text-[10px]">{idx + 1}</span>
                        )}
                      </span>
                      {item.status === "done" ? "已完成" : "手动完成"}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cx("text-[13.5px] text-ink", item.status === "done" && "line-through")}>
                        {item.title}
                      </p>
                      {item.rationale ? <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink3">{item.rationale}</p> : null}
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {item.conceptId && item.conceptName ? (
                          <Link
                            href={`/library?c=${item.conceptId}`}
                            className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-panel2 px-2 py-0.5 text-[10.5px] text-ink3 transition-colors hover:text-accentink"
                            title={`查看学习档案：${item.conceptName}`}
                          >
                            档案 · {item.conceptName}
                          </Link>
                        ) : (
                          <span className="rounded-full border border-dashed border-line px-2 py-0.5 text-[10.5px] text-ink3">
                            未绑定概念
                          </span>
                        )}
                        <button
                          onClick={() => openBind(plan, item)}
                          className="rounded-full px-1.5 py-0.5 text-[10.5px] text-ink3 transition-colors hover:bg-panel2 hover:text-accentink"
                        >
                          改绑
                        </button>
                      </div>
                      <p
                        className="mt-0.5 line-clamp-1 text-[11px] text-ink3"
                        title={(item.verifiedConceptNames ?? []).join("、")}
                      >
                        {STATUS_LABEL[item.status]} · 验证 {item.verifiedConcepts ?? 0}/
                        {item.requiredConcepts ?? 3}
                        {(item.verifiedConceptNames ?? []).length
                          ? ` · ${(item.verifiedConceptNames ?? []).join("、")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => void startItem(plan, item)}
                        className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-ink2 hover:border-accent hover:text-accentink"
                      >
                        学这一步
                      </button>
                      <button
                        onClick={() => void setStatus(plan.id, item.id, item.status === "skipped" ? "pending" : "skipped")}
                        className="rounded-full p-1.5 text-ink3 hover:bg-panel2 hover:text-ink"
                        title="跳过"
                      >
                        {item.status === "skipped" ? <CircleDashed className="size-3.5" /> : <SkipForward className="size-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(binding)}
        onClose={() => setBinding(null)}
        title="改绑本步知识点"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setBinding(null)}>
              取消
            </Button>
            <Button size="sm" loading={bindingBusy} onClick={() => void saveBind()}>
              保存改绑
            </Button>
          </div>
        }
      >
        {binding ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] leading-relaxed text-ink2">
              当前步骤：<span className="text-ink">{binding.item.title}</span>
            </p>
            <label className="flex flex-col gap-1.5 text-[12px] text-ink2">
              本步聚焦知识点
              <select
                value={bindDraft}
                onChange={(e) => setBindDraft(e.target.value)}
                className="rounded-xl border border-line bg-panel px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
              >
                <option value="">不绑定</option>
                {concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.topicName} · {c.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink3">
              改绑只影响之后「学这一步」的聚焦概念和展示，不会改动已有作答证据或步骤验证进度。
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="删除这条学习路线？"
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
                  toast.success("路线已删除");
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
          「{pendingDelete?.title}」的 {pendingDelete?.items.length ?? 0} 个步骤会一起删除。
        </p>
        <p className="mt-2 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink2">
          知识点、作答记录和掌握度证据<span className="font-medium text-ink">不会</span>被删除——
          路线只是“打算怎么学”，档案记录的是“实际学成了什么”。
        </p>
      </Modal>
    </div>
  );
}
