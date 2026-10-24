"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, CircleDot, History as HistoryIcon, Network, Search, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, EmptyState, Modal, SectionHeader, Spinner, StatusPill, cx } from "@/components/ui/kit";
import { PlanSelect, usePlans } from "@/components/PlanSelect";
import {
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_ORDER,
  ERROR_LABEL,
  STATUS_LABEL,
  type ConceptDisplayStatus,
  type ConceptDTO,
  type ConceptStatus,
  type ErrorType,
  type EvidenceDTO,
} from "@/lib/types";
import { stripInlineMarkdown } from "@/lib/text";

interface ConceptDetail {
  concept: ConceptDTO;
  evidence: EvidenceDTO[];
  errorProfile: {
    top: { error_type: string; n: number }[];
    recent: { errorType: string | null; answer: string; prompt: string; type: string; createdAt: number }[];
  };
  history: {
    events: { id: string; from_status: string | null; to_status: string | null; reason: string; created_at: number; actor: string }[];
    snapshots: { p_mastery: number; status: string; recorded_at: number }[];
    evidence: { id: string; correct: number | null; independent: number; hint_used: number; note: string | null; created_at: number; session_id: string | null }[];
    attempts: { id: string; is_correct: number | null; used_hint: number; created_at: number; type: string; prompt: string; session_id: string }[];
  };
}

export default function LibraryPage() {
  const router = useRouter();
  const { plans } = usePlans();
  const [concepts, setConcepts] = useState<ConceptDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ConceptDisplayStatus | "all">("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  /** 知识点一多，靠滚动找是不现实的 */
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [duplicateConcepts, setDuplicateConcepts] = useState(0);
  const [emptyCount, setEmptyCount] = useState(0);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [confirmDeleteConcept, setConfirmDeleteConcept] = useState(false);
  const [pendingMerge, setPendingMerge] = useState<ConceptDTO | null>(null);
  const [manualMergeBusy, setManualMergeBusy] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/concepts", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          concepts: ConceptDTO[];
          duplicateConcepts?: number;
          empty?: number;
        };
        setConcepts(data.concepts);
        setDuplicateConcepts(data.duplicateConcepts ?? 0);
        setEmptyCount(data.empty ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) setOpenId(c);
  }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/concepts/${id}`, { cache: "no-store" });
      if (res.ok) setDetail((await res.json()) as ConceptDetail);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (openId) void loadDetail(openId);
    else setDetail(null);
  }, [openId, loadDetail]);

  const evidenceStats = useMemo(() => {
    const all = detail?.evidence ?? [];
    return {
      valid: all.filter((e) => !e.voided && e.weight > 0),
      excluded: all.filter((e) => !e.voided && e.weight <= 0),
      voided: all.filter((e) => e.voided),
    };
  }, [detail]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return concepts.filter(
      (c) =>
        (statusFilter === "all" || c.displayStatus === statusFilter) &&
        (planFilter === "all"
          ? true
          : planFilter === "none"
            ? !c.planId && !c.courseId
            : c.planId === planFilter) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          (c.courseTitle ?? "").toLowerCase().includes(q) ||
          (c.planTitle ?? "").toLowerCase().includes(q)),
    );
  }, [concepts, statusFilter, planFilter, query]);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        planTitle: string | null;
        courseId: string | null;
        courseTitle: string | null;
        items: ConceptDTO[];
      }
    >();
    for (const c of filtered) {
      const key = c.courseId ?? (c.planId ? `plan-${c.planId}` : "unassigned");
      const group = map.get(key) ?? {
        key,
        planTitle: c.planTitle ?? null,
        courseId: c.courseId ?? null,
        courseTitle: c.courseTitle ?? null,
        items: [],
      };
      group.items.push(c);
      map.set(key, group);
    }
    const groups = [...map.values()];
    return [
      ...groups.filter((g) => g.key !== "unassigned"),
      ...groups.filter((g) => g.key === "unassigned"),
    ];
  }, [filtered]);

  useEffect(() => {
    if (
      planFilter !== "all" &&
      planFilter !== "none" &&
      plans.length > 0 &&
      !plans.some((p) => p.id === planFilter)
    ) {
      setPlanFilter("all");
    }
  }, [plans, planFilter]);

  const correct = async (status: ConceptStatus) => {
    if (!detail) return;
    const res = await fetch(`/api/concepts/${detail.concept.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast.success("已更正，并记录了变更依据");
      await load();
      await loadDetail(detail.concept.id);
    } else toast.error("更正失败");
  };

  const mergeDuplicates = async () => {
    setMergeBusy(true);
    try {
      const res = await fetch("/api/concepts/merge-duplicates", { method: "POST" });
      const data = (await res.json()) as {
        merged?: number;
        concepts?: ConceptDTO[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "合并失败");
      applyConceptList(data);
      setDuplicateConcepts(0);
      setMergeOpen(false);
      setOpenId(null);
      toast.success(`已合并 ${data.merged ?? 0} 个重复知识点，并按全部证据重算`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMergeBusy(false);
    }
  };

  const applyConceptList = (data: { concepts?: ConceptDTO[] }) => {
    if (data.concepts) setConcepts(data.concepts);
  };

  const removeConcept = async (id: string) => {
    const res = await fetch(`/api/concepts/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { concepts?: ConceptDTO[]; error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "删除失败");
      return;
    }
    applyConceptList(data);
    setConfirmDeleteConcept(false);
    setOpenId(null);
    window.history.replaceState({}, "", "/library");
    toast.success("知识点已删除");
  };

  const cleanupEmpty = async () => {
    setCleanupBusy(true);
    try {
      const res = await fetch("/api/concepts/cleanup", { method: "POST" });
      const data = (await res.json()) as { removed?: number; concepts?: ConceptDTO[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "清理失败");
      applyConceptList(data);
      setCleanupOpen(false);
      toast.success(`已清理 ${data.removed ?? 0} 个未学习知识点`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCleanupBusy(false);
    }
  };

  const mergeInto = async (target: ConceptDTO) => {
    if (!detail || manualMergeBusy) return;
    setManualMergeBusy(true);
    try {
      const res = await fetch("/api/concepts/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          survivorId: target.id,
          duplicateIds: [detail.concept.id],
        }),
      });
      const data = (await res.json()) as {
        merged?: number;
        concepts?: ConceptDTO[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "合并失败");
      applyConceptList(data);
      setPendingMerge(null);
      setOpenId(null);
      window.history.replaceState({}, "", "/library");
      toast.success(`已合并到「${target.name}」，掌握度按全部证据重算`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setManualMergeBusy(false);
    }
  };

  const voidOne = async (evidenceId: string) => {
    const res = await fetch(`/api/evidence/${evidenceId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "用户在档案中判定这条作答不算" }),
    });
    if (!res.ok) {
      toast.error("作废失败");
      return;
    }
    setVoidingId(null);
    toast.success("已作废，掌握度按剩余证据重算");
    await load();
    if (openId) await loadDetail(openId);
  };

  const practice = async (concept: ConceptDTO) => {
    // 从档案进入也走结构化复习：服务端会按最近证据自动补上计划归属
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "review",
        focusConceptId: concept.id,
        title: `复习：${concept.name}`,
      }),
    });
    if (!res.ok) {
      toast.error("创建复习会话失败");
      return;
    }
    const { session } = (await res.json()) as { session: { id: string } };
    router.push(`/s/${session.id}`);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-ink3">
            <Network className="size-3.5" /> 学习档案
          </div>
          <h1 className="font-serif text-[26px] tracking-tight text-ink">知识点与把握依据</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink2">
            状态由证据推导，不是模型自评；p 值等指标在详情里。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {duplicateConcepts > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Network className="size-3.5" />}
              onClick={() => setMergeOpen(true)}
            >
              合并重复（{duplicateConcepts}）
            </Button>
          ) : null}
          {emptyCount > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => setCleanupOpen(true)}
            >
              清理未学习（{emptyCount}）
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索知识点、课程或计划…"
            aria-label="搜索知识点"
            className="w-full rounded-full border border-line bg-panel py-2 pl-9 pr-9 text-[13px] text-ink outline-none transition-colors placeholder:text-ink3 focus:border-accent"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              aria-label="清空搜索"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink3 hover:bg-panel2 hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...DISPLAY_STATUS_ORDER] as (ConceptDisplayStatus | "all")[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cx(
                "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                statusFilter === s
                  ? "border-accent/40 bg-accentsoft text-accentink"
                  : "border-line bg-panel text-ink2 hover:border-linestrong",
              )}
            >
              {s === "all" ? "全部" : DISPLAY_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-ink3">
          计划
          <PlanSelect
            plans={plans}
            mode="filter"
            value={planFilter}
            onChange={setPlanFilter}
            className="max-w-[220px] rounded-full border border-line bg-panel px-2.5 py-1 text-[12px] text-ink2 outline-none hover:border-linestrong"
            ariaLabel="按计划筛选知识点"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-[13px] text-ink3">
          <Spinner /> 读取档案…
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title={concepts.length === 0 ? "档案还是空的" : "没有符合条件的知识点"}
          description={
            concepts.length === 0
              ? "目标学习中，计划确认后创建的知识点会出现在这里；无限学习的普通对话不会自动写入档案。"
              : "换个筛选条件或搜索词试试。"
          }
          action={
            concepts.length === 0 ? (
              <Button variant="secondary" onClick={() => router.push("/")}>
                去学习
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map((group) => (
            <section key={group.key}>
              <SectionHeader
                title={group.courseTitle ?? "未归属课程"}
                hint={`${group.items.length} 个知识点${
                  group.planTitle && planFilter === "all" ? ` · ${group.planTitle}` : ""
                }`}
              />
              {group.key === "unassigned" ? (
                <p className="mb-1.5 text-[12px] text-warn">
                  这些知识点还没有明确课程归属，先保留原始记录，待整理。
                </p>
              ) : null}
              <div className="flex flex-col gap-1.5">
                {group.items.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setOpenId(c.id);
                      window.history.replaceState({}, "", `/library?c=${c.id}`);
                    }}
                    className="group flex items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-left transition-all hover:border-accent/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] text-ink">{c.name}</p>
                      <p className="mt-0.5 truncate text-[12px] text-ink3">
                        {c.definition ? stripInlineMarkdown(c.definition) : c.planTitle ?? "等待归属课程"}
                      </p>
                    </div>
                    <StatusPill
                      status={c.status}
                      displayStatus={c.displayStatus}
                      introduced={Boolean(c.introducedAt)}
                    />
                    <ArrowRight className="size-3.5 text-ink3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(openId)}
        onClose={() => {
          setOpenId(null);
          window.history.replaceState({}, "", "/library");
        }}
        title={detail?.concept.name ?? "知识点"}
        wide
      >
        {detailLoading && !detail ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-ink3">
            <Spinner /> 读取依据…
          </div>
        ) : detail ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                status={detail.concept.status}
                displayStatus={detail.concept.displayStatus}
                introduced={Boolean(detail.concept.introducedAt)}
              />
              {detail.concept.planTitle ? (
                <Badge tone="neutral">{detail.concept.planTitle}</Badge>
              ) : null}
              {detail.concept.courseTitle ? (
                <Badge tone="neutral">{detail.concept.courseTitle}</Badge>
              ) : (
                <Badge tone="warn">待整理 · 未归属课程</Badge>
              )}
              <span className="text-[12px] text-ink3">
                p(掌握) {detail.concept.pMastery.toFixed(3)}
              </span>
              {detail.concept.nextReviewAt ? (
                <span className="text-[12px] text-ink3">
                  · 下次复习 {new Date(detail.concept.nextReviewAt).toLocaleDateString("zh-CN")}
                </span>
              ) : null}
            </div>

            {detail.concept.definition ? (
              <p className="rounded-xl border border-line bg-panel2/40 px-3 py-2.5 text-[13px] leading-relaxed text-ink2">
                {detail.concept.definition}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { l: "有效证据", v: detail.concept.evidenceCount },
                { l: "独立答对", v: detail.concept.independentCorrect },
                { l: "有效提示", v: detail.concept.hintUses },
                { l: "不同题目", v: detail.concept.distinctExercises },
              ].map((s) => (
                <div key={s.l} className="rounded-xl border border-line px-3 py-2">
                  <p className="font-serif text-lg tabular-nums text-ink">{s.v}</p>
                  <p className="text-[12px] text-ink3">{s.l}</p>
                </div>
              ))}
            </div>

            {detail.history.snapshots.length > 1 ? (
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-ink">掌握度变化</p>
                <Sparkline points={detail.history.snapshots.map((s) => s.p_mastery)} />
                <p className="mt-1 text-[12px] text-ink3">
                  {detail.history.snapshots.length} 次快照 · 从 {detail.history.snapshots[0].p_mastery.toFixed(2)} 到{" "}
                  {detail.history.snapshots.at(-1)!.p_mastery.toFixed(2)}
                </p>
              </div>
            ) : null}

            <div>
              <p className="mb-1.5 text-[12px] font-medium text-ink">状态变更依据</p>
              {detail.history.events.length === 0 ? (
                <p className="text-[12px] text-ink3">还没有状态变更记录。</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {detail.history.events.slice(0, 6).map((e) => (
                    <div key={e.id} className="flex items-start gap-2 text-[12px] leading-relaxed">
                      <CircleDot className="mt-1 size-3 shrink-0 text-ink3" />
                      <div>
                        <span className="text-ink2">
                          {e.from_status ? `${STATUS_LABEL[e.from_status as ConceptStatus] ?? e.from_status} → ` : ""}
                          <span className="text-ink">{STATUS_LABEL[e.to_status as ConceptStatus] ?? e.to_status}</span>
                        </span>
                        <span className="ml-2 text-ink3">{e.reason}</span>
                        <span className="ml-2 text-ink3">
                          {new Date(e.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {detail.errorProfile?.top?.length ? (
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-ink">错因分布（只影响怎么教）</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.errorProfile.top.map((t) => (
                    <Badge key={t.error_type} tone="warn">
                      {ERROR_LABEL[t.error_type as ErrorType] ?? t.error_type} × {t.n}
                    </Badge>
                  ))}
                </div>
                {detail.errorProfile.recent?.[0] ? (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink3">
                    最近一次错答：{stripInlineMarkdown(detail.errorProfile.recent[0].prompt)} —— 写成了「
                    {detail.errorProfile.recent[0].answer}」
                  </p>
                ) : null}
              </div>
            ) : null}

            {detail.evidence?.length ? (
              <div>
                <p className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-ink">
                  <HistoryIcon className="size-3.5" />
                  作答证据（{evidenceStats.valid.length} 条有效
                  {evidenceStats.excluded.length
                    ? ` · ${evidenceStats.excluded.length} 条不计入`
                    : ""}
                  {evidenceStats.voided.length
                    ? ` · ${evidenceStats.voided.length} 条已作废`
                    : ""}
                  ）
                </p>
                {evidenceStats.excluded.length ? (
                  <p className="mb-1 text-[11.5px] leading-relaxed text-ink3">
                    查看了参考答案的作答会保留记录，但不再计入掌握度。
                  </p>
                ) : null}
                <div className="flex flex-col gap-1">
                  {detail.evidence.slice(0, 8).map((ev) => (
                    <div
                      key={ev.id}
                      className={cx(
                        "rounded-lg border px-2.5 py-1.5 text-[12px]",
                        ev.voided
                          ? "border-line/60 bg-panel2/40 opacity-60"
                          : ev.weight <= 0
                            ? "border-line/60 bg-panel2/30"
                            : "border-line",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={ev.correct ? "text-ok" : ev.correct === false ? "text-bad" : "text-ink3"}>
                          {ev.correct ? "✓" : ev.correct === false ? "✕" : "…"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-ink2">
                          {stripInlineMarkdown(ev.prompt ?? "（题目已不可用）")}
                        </span>
                        {!ev.voided && ev.weight <= 0 ? (
                          <Badge tone="neutral">不计入掌握度</Badge>
                        ) : null}
                        {!ev.voided && ev.hintUsed ? <Badge tone="warn">用提示</Badge> : null}
                        {ev.voided ? <Badge tone="neutral">已作废</Badge> : null}
                        <span className="shrink-0 text-ink3">
                          {new Date(ev.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                      </div>
                      {!ev.voided && ev.weight <= 0 && ev.note ? (
                        <p className="mt-1 text-[12px] leading-relaxed text-ink3">{ev.note}</p>
                      ) : null}
                      {!ev.voided ? (
                        voidingId === ev.id ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                            <span className="text-bad">作废后不再计入掌握度，审计仍保留。</span>
                            <button
                              onClick={() => void voidOne(ev.id)}
                              className="rounded-full bg-badsoft px-2 py-0.5 text-bad"
                            >
                              确认作废
                            </button>
                            <button onClick={() => setVoidingId(null)} className="text-ink3">
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setVoidingId(ev.id)}
                            className="mt-1 text-[12px] text-ink3 hover:text-bad"
                          >
                            标记作废
                          </button>
                        )
                      ) : (
                        <p className="mt-1 text-[12px] text-ink3">{ev.voidReason ?? "已作废"}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => practice(detail.concept)}>
                  针对它练一练
                </Button>
                <span className="text-[12px] text-ink3">用一道新题检验当前掌握度</span>
              </div>

              <div className="mt-3 grid gap-2.5 rounded-xl border border-line/70 bg-panel2/30 p-3">
                <label className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12.5px] text-ink2">手动更正状态</span>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) void correct(e.target.value as ConceptStatus);
                    }}
                    className="h-8 min-w-[8.5rem] rounded-lg border border-line bg-panel px-2.5 text-[12px] text-ink2 outline-none hover:border-linestrong"
                  >
                    <option value="">选择新状态…</option>
                    {(
                      [
                        ["untouched", "待学习"],
                        ["learning", "学习中"],
                        ["needs_work", "待复习"],
                        ["mastered", "已掌握"],
                      ] as [ConceptStatus, string][]
                    )
                      .filter(([value]) => value !== detail.concept.status)
                      .map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="-mt-1 text-[12px] text-ink3">人工更正会记录在变更依据中。</p>

                <label className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12.5px] text-ink2">合并到其他知识点</span>
                  <select
                    value=""
                    onChange={(e) => {
                      const target = concepts.find((c) => c.id === e.target.value);
                      if (target) setPendingMerge(target);
                    }}
                    className="h-8 max-w-[62%] min-w-[8.5rem] rounded-lg border border-line bg-panel px-2.5 text-[12px] text-ink2 outline-none hover:border-linestrong"
                    aria-label="把当前知识点合并到另一个知识点"
                  >
                    <option value="">选择目标…</option>
                    {concepts
                      .filter((c) => c.id !== detail.concept.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.courseTitle ?? c.planTitle ?? "未归属课程"} · {c.name}
                          {c.evidenceCount > 0 ? `（证据 ${c.evidenceCount}）` : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="-mt-1 text-[12px] text-ink3">合并后当前条目会删除，证据转给目标；不可撤销。</p>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => setConfirmDeleteConcept(true)}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] text-bad transition-colors hover:bg-badsoft"
                >
                  <Trash2 className="size-3.5" />
                  删除知识点
                </button>
              </div>
            </div>

            {pendingMerge ? (
              <div className="rounded-xl border border-warn/30 bg-warnsoft/40 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink">
                保留「{pendingMerge.name}」，把「{detail.concept.name}」的作答证据、题目和课程归属
                合并到它名下；当前条目会删除，不可撤销。
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    loading={manualMergeBusy}
                    onClick={() => void mergeInto(pendingMerge)}
                  >
                    确认合并
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendingMerge(null)}>
                    取消
                  </Button>
                </div>
              </div>
            ) : null}

            {confirmDeleteConcept ? (
              <div className="rounded-xl border border-bad/30 bg-badsoft/40 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink">
                删除「{detail.concept.name}」会一并删除它的
                <strong className="text-bad"> {detail.concept.evidenceCount} 条作答证据 </strong>
                与掌握度记录，且不可恢复。会话里的对话和题目不会被删。
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="danger" onClick={() => void removeConcept(detail.concept.id)}>
                    确认删除
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteConcept(false)}>
                    取消
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        title="合并重复知识点"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMergeOpen(false)}>
              取消
            </Button>
            <Button variant="danger" size="sm" loading={mergeBusy} onClick={mergeDuplicates}>
              合并 {duplicateConcepts} 个
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink2">
          发现 <strong className="text-ink">{duplicateConcepts}</strong> 个同名知识点分散在不同主题下。
          合并后会保留证据最多的那一个，把作答、题目、复习条目、课程归属和会话引用转移到它名下，再按全部证据重算掌握度。
        </p>
        <p className="mt-2 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink2">
          这个操作不可撤销。合并只影响重复档案，不删除你的作答记录。
        </p>
      </Modal>

      <Modal
        open={cleanupOpen}
        onClose={() => setCleanupOpen(false)}
        title="清理未学习知识点"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCleanupOpen(false)}>
              取消
            </Button>
            <Button variant="danger" size="sm" loading={cleanupBusy} onClick={cleanupEmpty}>
              清理 {emptyCount} 个
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink2">
          将删除 <strong className="text-ink">{emptyCount}</strong> 个「从未被讲解过、也没有任何作答证据」的知识点。
          通常是模型登记后从未真正接触过的空壳。
        </p>
        <p className="mt-2 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink2">
          已归属课程、已讲解、做过题（包括看了解析未计分）的知识点都会保留。会话记录、题目与你的对话同样不受影响。
        </p>
      </Modal>

      {concepts.length > 0 ? (
        <p className="mt-8 flex items-center gap-1.5 text-[12px] text-ink3">
          <Sparkles className="size-3" />
          判定规则：p≥0.85 且独立答对 ≥3 次、覆盖 ≥3 道不同题目且无连错，才标记「暂时掌握」；一旦出错立即降级待复测。
        </p>
      ) : null}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const W = 520;
  const H = 64;
  const max = Math.max(...points, 0.1);
  const step = points.length > 1 ? W / (points.length - 1) : W;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(H - (p / max) * (H - 8) - 4).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
