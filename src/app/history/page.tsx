"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, EmptyState, Modal, PageHeader, SectionHeader, Spinner } from "@/components/ui/kit";
import { PlanSelect, usePlans } from "@/components/PlanSelect";
import type { SessionSummary } from "@/lib/types";
import { groupByPlan } from "@/lib/utils";

export default function HistoryPage({ embedded = false }: { embedded?: boolean }) {
  const { plans } = usePlans();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(null);
  const [withEvidence, setWithEvidence] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      if (res.ok) setSessions(((await res.json()) as { sessions: SessionSummary[] }).sessions);
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
      sessions.filter(
        (s) =>
          (planFilter === "all" ? true : planFilter === "none" ? !s.planId : s.planId === planFilter) &&
          (!q.trim() || s.title.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [sessions, planFilter, q],
  );

  const infiniteSessions = useMemo(
    () => filtered.filter((s) => s.mode === "infinite"),
    [filtered],
  );
  const formalGroups = useMemo(
    () => groupByPlan(filtered.filter((s) => s.mode !== "infinite")),
    [filtered],
  );
  const hasResults = infiniteSessions.length > 0 || formalGroups.length > 0;

  const assign = async (sessionId: string, planId: string | null) => {
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    if (!res.ok) {
      toast.error("调整归属失败");
      return;
    }
    const planTitle = planId ? plans.find((p) => p.id === planId)?.title ?? null : null;
    setSessions((list) => list.map((s) => (s.id === sessionId ? { ...s, planId, planTitle } : s)));
    window.dispatchEvent(new Event("sessions:changed"));
    toast.success(planId ? `已归入「${planTitle}」` : "已移出计划");
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const res = await fetch(
      `/api/sessions/${pendingDelete.id}${withEvidence ? "?withEvidence=1" : ""}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      toast.success("已删除");
      setPendingDelete(null);
      setWithEvidence(false);
      window.dispatchEvent(new Event("sessions:changed"));
      await load();
    } else toast.error("删除失败");
  };

  const renderSession = (s: SessionSummary, showPlan: boolean) => (
    <div
      key={s.id}
      className="group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-panel px-3.5 py-2.5 transition-colors hover:border-accent/40"
    >
      <Link href={`/s/${s.id}`} className="min-w-0 flex-1 basis-full sm:basis-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13.5px] text-ink">{s.title}</p>
          <Badge tone={s.mode === "review" ? "warn" : s.mode === "goal" ? "accent" : "neutral"}>
            {s.mode === "infinite" ? "无限学习" : s.mode === "goal" ? "目标学习" : "复习"}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-ink3">
          {new Date(s.updatedAt).toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · {s.messageCount} 条消息
          {s.courseTitle ? ` · ${s.courseTitle}` : ""}
          {s.summary ? <span className="hidden sm:inline"> · {s.summary}</span> : null}
        </p>
      </Link>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {showPlan && plans.length > 0 ? (
          <PlanSelect
            plans={plans}
            mode="assign"
            value={s.planId ?? ""}
            onChange={(v) => void assign(s.id, v || null)}
            title={s.planTitle ? `当前归属：${s.planTitle}` : "未归类，点击更换"}
            className="max-w-[190px] shrink-0 rounded-full border border-line bg-panel px-2 py-1 text-[12px] text-ink2 outline-none hover:border-linestrong sm:max-w-[260px]"
            ariaLabel={`调整「${s.title}」所属计划`}
          />
        ) : null}
        <button
          onClick={() => setPendingDelete(s)}
          className="rounded-full p-1.5 text-ink3 opacity-100 transition-all hover:bg-badsoft hover:text-bad sm:opacity-0 sm:group-hover:opacity-100"
          title="删除会话"
          aria-label={`删除会话 ${s.title}`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10"}>
      {embedded ? null : <PageHeader title="学习历史" />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5">
          <Search className="size-3.5 text-ink3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="按标题搜索（不含消息内容）"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink3"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-ink3">
          计划
          <PlanSelect
            plans={plans}
            mode="filter"
            value={planFilter}
            onChange={setPlanFilter}
            className="max-w-[220px] rounded-full border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink2 outline-none hover:border-linestrong"
            ariaLabel="按计划筛选会话"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-[13px] text-ink3">
          <Spinner /> 读取中…
        </div>
      ) : !hasResults ? (
        <EmptyState
          title={sessions.length === 0 ? "还没有学习记录" : "没有找到匹配的会话"}
          description={
            sessions.length === 0
              ? "提第一个问题，历史就会开始积累。"
              : "换个搜索词或计划试试。"
          }
          action={
            <Link href="/">
              <Button variant="secondary">去学习</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {infiniteSessions.length > 0 ? (
            <section>
              <SectionHeader title="无限学习" />
              <div className="flex flex-col gap-1.5">
                {infiniteSessions.map((s) => renderSession(s, false))}
              </div>
            </section>
          ) : null}

          {formalGroups.map((g) => (
            <section key={g.planId ?? "ungrouped"}>
              <SectionHeader title={g.planId ? g.planTitle : "目标学习 · 未归计划"} />
              <div className="flex flex-col gap-1.5">
                {g.items.map((s) => renderSession(s, true))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="删除会话"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button variant="danger" size="sm" onClick={remove}>
              删除
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink2">
          将删除「{pendingDelete?.title}」的对话与组件状态。长期学习证据默认保留。
        </p>
        <label className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-panel2/40 p-3 text-[12.5px] text-ink2">
          <input
            type="checkbox"
            checked={withEvidence}
            onChange={(e) => setWithEvidence(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          同时删除本会话产生的作答证据
        </label>
      </Modal>
    </div>
  );
}


