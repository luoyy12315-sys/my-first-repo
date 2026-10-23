"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Clock,
  FolderOpen,
  Repeat2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, SectionHeader, Spinner, StatusPill, cx } from "@/components/ui/kit";
import { PlanSelect, usePlans } from "@/components/PlanSelect";
import type { AiStatus, ConceptDTO, ReviewItemDTO, SessionSummary, TodayPlan } from "@/lib/types";

interface HomeData {
  ai: AiStatus;
  todayPlan?: TodayPlan;
  sessions: SessionSummary[];
  continueSession: SessionSummary | null;
  topics: { id: string; name: string; concept_count: number; solid_count: number }[];
  weak: ConceptDTO[];
  review: ReviewItemDTO[];
  materials: { id: string; name: string; status: string }[];
  stats: {
    concepts: number;
    withEvidence: number;
    mastered: number;
    initial: number;
    needsWork: number;
    sessions: number;
  };
}

export default function HomePage() {
  const router = useRouter();
  const { plans } = usePlans();
  const [planId, setPlanId] = useState("");
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"free" | "goal">("free");
  const [minutes, setMinutes] = useState(20);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/home", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as HomeData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    // 计划页「设定新目标」会带 mode=goal 过来：直接切到目标模式，
    // 不让用户到了首页还得自己再点一次模式。
    if (params.get("mode") === "goal") setMode("goal");
    if (params.get("new") === "1" || params.get("mode") === "goal") {
      setTimeout(() => ref.current?.focus(), 120);
    }
  }, [load]);

  const start = async (value?: string) => {
    const content = (value ?? text).trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          title: "新的学习",
          planId: planId || null,
        }),
      });
      if (!res.ok) throw new Error("创建会话失败");
      const { session } = (await res.json()) as { session: { id: string } };
      const extra = mode === "goal" ? `&minutes=${minutes}` : "";
      router.push(`/s/${session.id}?q=${encodeURIComponent(content)}${extra}`);
    } catch (e) {
      toast.error((e as Error).message);
      setSending(false);
    }
  };

  const hasHistory = (data?.stats.sessions ?? 0) > 0;
  // “今天”卡已经消费了第一条复习建议，列表里不能再原样出现一次
  const otherReview = (data?.review ?? [])
    .filter((r) => r.id !== data?.todayPlan?.reviewItemId)
    .slice(0, 3);

  const startToday = async () => {
    const plan = data?.todayPlan;
    if (!plan || plan.kind === "empty") return;
    if (plan.kind === "continue" && plan.sessionId) {
      router.push(`/s/${plan.sessionId}`);
      return;
    }
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "review",
        focusConceptId: plan.conceptId,
        reviewItemId: plan.reviewItemId,
        planId: plan.planId,
        title: plan.title,
      }),
    });
    if (!res.ok) {
      toast.error("创建复习会话失败");
      return;
    }
    const { session } = (await res.json()) as { session: { id: string } };
    router.push(`/s/${session.id}`);
  };

  const startReview = async (item: ReviewItemDTO) => {
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
      toast.error("创建复习会话失败");
      return;
    }
    const { session } = (await res.json()) as { session: { id: string } };
    router.push(`/s/${session.id}`);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-6 md:px-8 md:pt-12">
      {/* 主视觉 */}
      <section className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-accentsoft">
            <Sparkles className="size-3.5 text-accent" />
          </span>
          <span className="text-[11.5px] uppercase tracking-[0.14em] text-ink3">AI 学习工作台</span>
        </div>
        <h1 className="max-w-2xl font-serif text-[30px] leading-[1.22] tracking-tight text-ink text-balance md:text-[38px]">
          把不会的，变成<span className="text-accentink">会的</span>。
        </h1>
        <p className="mt-2.5 max-w-xl text-[14px] leading-relaxed text-ink2">
          它会根据你的回答调整讲法：讲不明白就换表征，理解了就出题验证。每一步作答都会变成可追溯的学习证据。
        </p>
      </section>

      {/* 输入 */}
      <div className="rounded-2xl border border-line bg-panel shadow-[var(--shadow)]">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void start();
            }
          }}
          rows={3}
          placeholder="想学什么？可以直接说「从零开始教我复式记账」，或者「继续上次的导数」。"
          className="w-full resize-none bg-transparent px-4 pt-4 text-[15.5px] leading-relaxed text-ink outline-none placeholder:text-ink3"
        />
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
          <div className="flex rounded-full border border-line bg-panel2/50 p-0.5">
            {(
              [
                { v: "free", label: "自由学习" },
                { v: "goal", label: "目标学习" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => setMode(o.v)}
                className={cx(
                  "rounded-full px-3 py-1 text-[12px] transition-colors",
                  mode === o.v ? "bg-panel text-ink shadow-sm" : "text-ink3 hover:text-ink2",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {mode === "goal" ? (
            <div className="flex items-center gap-1 text-[11.5px] text-ink3">
              <Clock className="size-3.5" />
              {[10, 20, 30, 45].map((m) => (
                <button
                  key={m}
                  onClick={() => setMinutes(m)}
                  className={cx(
                    "rounded-full px-2 py-0.5 transition-colors",
                    minutes === m ? "bg-accentsoft text-accentink" : "hover:text-ink2",
                  )}
                >
                  {m}分
                </button>
              ))}
            </div>
          ) : null}
          {plans.length > 0 ? (
            <label className="flex items-center gap-1 text-[11.5px] text-ink3">
              <FolderOpen className="size-3.5" />
              计划
              <PlanSelect
                plans={plans}
                value={planId}
                onChange={setPlanId}
                className="max-w-[170px] rounded-full border border-line bg-panel px-2 py-1 text-[11.5px] text-ink2 outline-none hover:border-linestrong"
                ariaLabel="本次学习归入哪个计划"
              />
            </label>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/materials"
              className="flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-ink3 hover:text-ink"
            >
              <FolderOpen className="size-3.5" />
              材料
            </Link>
            <button
              onClick={() => void start()}
              disabled={!text.trim() || sending}
              className="flex size-9 items-center justify-center rounded-full bg-accent text-white transition-all hover:brightness-110 disabled:opacity-35"
              title="开始"
            >
              {sending ? <Spinner className="text-white" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
        </div>
      </div>

      {data?.ai && !data.ai.configured ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-warn/30 bg-warnsoft/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            {data.ai.reason}。请先到
            <Link href="/settings" className="mx-1 underline">
              设置
            </Link>
            配置模型，之后才能真正开始教学（支持 DeepSeek / 通义 / Kimi / Ollama 等 OpenAI 兼容端点）。
          </span>
        </div>
      ) : null}

      {/* 今天：给一个确定的下一步，而不是一堆选项 */}
      {data?.todayPlan && data.todayPlan.kind !== "empty" ? (
        <section className="mt-7">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/25 bg-accentsoft/40 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-accentink">
                今天 · 约 {data.todayPlan.minutes} 分钟
              </p>
              <p className="mt-0.5 truncate font-serif text-[17px] text-ink">{data.todayPlan.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink2">
                {data.todayPlan.planTitle ? `${data.todayPlan.planTitle} · ` : ""}
                {data.todayPlan.reason}
              </p>
            </div>
            <Button size="sm" onClick={startToday}>
              开始
            </Button>
          </div>
        </section>
      ) : null}

      {/* 继续学习 */}
      {data?.continueSession ? (
        <section className="mt-7">
          <SectionHeader title="继续上次" hint="从断掉的地方接着走" />
          <Link
            href={`/s/${data.continueSession.id}`}
            className="group flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5 transition-all hover:border-accent/40"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accentsoft">
              <BookOpen className="size-4 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">{data.continueSession.title}</p>
              <p className="mt-0.5 truncate text-[12px] text-ink3">
                {data.continueSession.resumeHint ||
                  data.continueSession.summary ||
                  `${data.continueSession.messageCount} 条消息 · ${new Date(data.continueSession.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
              </p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-ink3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
          </Link>
        </section>
      ) : null}

      {/* 待巩固 / 复习 */}
      {hasHistory && (data!.weak.length > 0 || data!.review.length > 0) ? (
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {data!.weak.length > 0 ? (
            <section>
              <SectionHeader title="待巩固" hint={`${data!.stats.needsWork} 个知识点`} />
              <div className="flex flex-col gap-2">
                {data!.weak.map((c) => (
                  <Link
                    key={c.id}
                    href={`/library?c=${c.id}`}
                    className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 transition-colors hover:border-linestrong"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-ink">{c.name}</p>
                      <p className="text-[11px] text-ink3">
                        {c.topicName} · 连续错误 {c.wrongStreak} · p={c.pMastery.toFixed(2)}
                      </p>
                    </div>
                    <StatusPill status={c.status} introduced={Boolean(c.introducedAt)} />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          {otherReview.length > 0 ? (
            <section>
              <SectionHeader
                title={data?.todayPlan?.kind === "review" ? "其他复习" : "复习建议"}
                hint={
                  data?.todayPlan?.kind === "review"
                    ? "今天那张卡已经包含上面这条"
                    : "来自真实作答记录"
                }
                action={<Link href="/review" className="text-[12px] text-accentink">全部</Link>}
              />
              <div className="flex flex-col gap-2">
                {otherReview.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => void startReview(r)}
                    className="group flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-left transition-colors hover:border-accent/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-ink">{r.conceptName}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-relaxed text-ink3">
                        {r.planTitle ? `${r.planTitle} · ` : ""}
                        {r.reason}
                      </span>
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-ink3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                  </button>
                ))}
              </div>
            </section>
          ) : data?.todayPlan?.kind === "review" ? (
            <section>
              <SectionHeader title="复习" hint="来自真实作答记录" />
              <p className="rounded-xl border border-line bg-panel px-3 py-2.5 text-[12px] leading-relaxed text-ink3">
                今天只有这一件，做完就收工。
              </p>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* 最近会话 */}
      {loading || (data && data.sessions.length > 0) ? (
        <section className="mt-8">
          <SectionHeader
            title="最近学习"
            hint={data ? `${data.stats.concepts} 个知识点 · ${data.stats.withEvidence} 个有作答证据` : undefined}
            action={
              data && data.sessions.length > 0 ? (
                <Link href="/history" className="text-[12px] text-accentink">
                  全部历史
                </Link>
              ) : undefined
            }
          />
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-[13px] text-ink3">
              <Spinner /> 读取中…
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data!.sessions.slice(0, 5).map((s) => (
                <Link
                  key={s.id}
                  href={`/s/${s.id}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-panel2/60"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-line-strong" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{s.title}</span>
                  {s.topics.slice(0, 2).map((t) => (
                    <Badge key={t.id} tone="neutral" className="hidden sm:inline-flex">
                      {t.name}
                    </Badge>
                  ))}
                  {s.planTitle ? (
                    <span className="hidden max-w-[140px] shrink-0 truncate text-[11px] text-ink3 sm:inline">
                      {s.planTitle}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[11px] text-ink3">
                    {new Date(s.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* 数据概览（仅有真实数据时展示） */}
      {data && data.stats.withEvidence > 0 ? (
        <section className="mt-8">
          <Card className="grid grid-cols-2 divide-line p-0 sm:grid-cols-4 sm:divide-x">
            {[
              { label: "有证据的知识点", value: data.stats.withEvidence },
              { label: "初步掌握", value: data.stats.initial },
              { label: "暂时掌握", value: data.stats.mastered, tone: "ok" as const },
              { label: "需要巩固", value: data.stats.needsWork, tone: "warn" as const },
            ].map((s) => (
              <div key={s.label} className="px-4 py-3.5">
                <p
                  className={cx(
                    "font-serif text-[22px] tabular-nums",
                    s.tone === "ok" ? "text-ok" : s.tone === "warn" ? "text-warn" : "text-ink",
                  )}
                >
                  {s.value}
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink3">{s.label}</p>
              </div>
            ))}
          </Card>
          <p className="mt-2 text-[11px] text-ink3">
            掌握度由作答证据推导（BKT 知识追踪），不是模型自评。可在「学习档案」中查看依据并手动更正。
          </p>
        </section>
      ) : null}

      {/* 快捷入口 */}
      <section className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { href: "/library", label: "学习档案", icon: BookOpen, hint: "知识点与证据" },
          { href: "/review", label: "复习", icon: Repeat2, hint: "按证据排期" },
          { href: "/plan", label: "学习计划", icon: ArrowRight, hint: "可调整路线" },
          { href: "/materials", label: "学习材料", icon: FolderOpen, hint: "上传与解析" },
        ].map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="group rounded-xl border border-line bg-panel px-3 py-3 transition-all hover:border-accent/40"
          >
            <q.icon className="size-4 text-ink3 transition-colors group-hover:text-accent" />
            <p className="mt-2 text-[13px] text-ink">{q.label}</p>
            <p className="text-[11px] text-ink3">{q.hint}</p>
          </Link>
        ))}
      </section>

      {!loading && data && data.stats.sessions === 0 ? (
        <p className="mt-8 text-center text-[11.5px] text-ink3">
          这里不会显示假的学习时长和掌握率——所有数字都来自你真实的作答记录。
        </p>
      ) : null}
    </div>
  );
}
