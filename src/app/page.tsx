"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Clock,
  FolderOpen,
  Infinity as InfinityIcon,
  Play,
  Repeat2,
  Route as RouteIcon,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button, SectionHeader, Spinner, StatusPill } from "@/components/ui/kit";
import { usePlans } from "@/components/PlanSelect";
import PlanCard from "@/components/plan/PlanCard";
import type { AiStatus, ConceptDTO, ReviewItemDTO, SessionSummary, TodayPlan } from "@/lib/types";

interface HomeData {
  ai: AiStatus;
  todayPlan: TodayPlan;
  sessions: SessionSummary[];
  review: ReviewItemDTO[];
  weak: ConceptDTO[];
}

export default function HomePage() {
  const router = useRouter();
  const { plans } = usePlans();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [infiniteText, setInfiniteText] = useState("");
  const [goalText, setGoalText] = useState("");
  const [sending, setSending] = useState<"infinite" | "goal" | null>(null);
  const [todayBusy, setTodayBusy] = useState(false);
  const infiniteRef = useRef<HTMLTextAreaElement>(null);
  const goalRef = useRef<HTMLTextAreaElement>(null);
  // 计划页的「设定新目标」会带着 ?mode=goal 回来；这里必须真的响应它，
  // 否则用户点完只看到一张没变化的首页，会以为按钮坏了。
  const [goalFocus, setGoalFocus] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") !== "goal") return;
    setGoalFocus(true);
    const focusTimer = setTimeout(() => {
      goalRef.current?.focus({ preventScroll: true });
      goalRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 140);
    const clearTimer = setTimeout(() => setGoalFocus(false), 2800);
    // 参数只用于聚焦一次，去掉以免刷新时反复抢焦点
    const url = new URL(window.location.href);
    url.searchParams.delete("mode");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    return () => {
      clearTimeout(focusTimer);
      clearTimeout(clearTimer);
    };
  }, []);

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
    const onChange = () => void load();
    window.addEventListener("sessions:changed", onChange);
    window.addEventListener("plans:changed", onChange);
    return () => {
      window.removeEventListener("sessions:changed", onChange);
      window.removeEventListener("plans:changed", onChange);
    };
  }, [load]);

  const start = async (mode: "infinite" | "goal") => {
    const content = (mode === "infinite" ? infiniteText : goalText).trim();
    if (!content || sending) return;
    setSending(mode);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          title: mode === "goal" ? `规划：${content.slice(0, 24)}` : "新的学习",
        }),
      });
      const payload = (await res.json()) as { session?: { id: string }; error?: string };
      if (!res.ok || !payload.session) throw new Error(payload.error ?? "创建学习会话失败");
      const q =
        mode === "goal"
          ? `我想系统学习：${content}。请先帮我生成一份待确认的学习计划草稿（按「课程 → 知识点」组织），不要直接开始教学，生成后告诉我去哪里确认和修改。`
          : content;
      router.push(`/s/${payload.session.id}?q=${encodeURIComponent(q)}`);
    } catch (e) {
      toast.error((e as Error).message);
      setSending(null);
    }
  };

  const infiniteSessions = useMemo(
    () => (data?.sessions ?? []).filter((s) => s.mode === "infinite" && s.messageCount > 0),
    [data?.sessions],
  );
  const continueInfinite = infiniteSessions[0] ?? null;
  const activePlans = useMemo(
    () =>
      plans
        .filter((p) => p.status !== "draft")
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3),
    [plans],
  );
  const draftCount = plans.filter((p) => p.status === "draft").length;
  const today = data?.todayPlan;
  const todayFallbackPlan = today && today.kind === "empty" ? activePlans[0] : null;
  const showToday = Boolean(data) && (Boolean(today && today.kind !== "empty") || Boolean(todayFallbackPlan));

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

  const startTodayPlan = async () => {
    if (todayBusy) return;
    const today = data?.todayPlan;
    if (!today || today.kind === "empty") {
      const fallback = activePlans[0];
      if (fallback) router.push(`/plan/${fallback.id}`);
      return;
    }
    if (today.kind === "continue") {
      if (today.sessionId) router.push(`/s/${today.sessionId}`);
      else router.push("/history");
      return;
    }
    if (!today.conceptId) {
      router.push("/review");
      return;
    }
    setTodayBusy(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "review",
          focusConceptId: today.conceptId,
          reviewItemId: today.reviewItemId ?? undefined,
          planId: today.planId ?? undefined,
          title: today.title,
        }),
      });
      const payload = (await res.json()) as { session?: { id: string }; error?: string };
      if (!res.ok || !payload.session) throw new Error(payload.error ?? "创建学习会话失败");
      router.push(`/s/${payload.session.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setTodayBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-6 md:px-8 md:pt-12">
      <section className="mb-7">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-accentsoft">
            <Sparkles className="size-3.5 text-accent" />
          </span>
          <span className="text-[12px] uppercase tracking-[0.14em] text-ink3">AI 学习工作台</span>
        </div>
        <h1 className="max-w-2xl font-serif text-[30px] leading-[1.22] tracking-tight text-ink text-balance md:text-[38px]">
          今天想怎么学？
        </h1>
        <p className="mt-2.5 max-w-xl text-[14px] leading-relaxed text-ink2">
          直接开聊，或者先定一个目标。
        </p>
      </section>

      {data?.ai && !data.ai.configured ? (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-warn/30 bg-warnsoft/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            {data.ai.reason}。请先到
            <Link href="/settings" className="mx-1 underline">
              设置
            </Link>
            配置模型，之后才能真正开始教学。
          </span>
        </div>
      ) : null}

      {data?.ai?.configured && data.ai.lastError ? (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-bad/30 bg-badsoft/40 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" />
          <span>
            模型上次调用失败：{data.ai.lastError}。可以先到
            <Link href="/settings" className="mx-1 underline">
              设置
            </Link>
            里点「测试」；如果是欠费或额度问题，需要到模型服务商处理。
          </span>
        </div>
      ) : null}

      {showToday ? (
        <section className="mb-3">
          <button
            type="button"
            onClick={() => void startTodayPlan()}
            disabled={todayBusy}
            className="group flex w-full items-center gap-3 rounded-2xl border border-accent/35 bg-accentsoft/35 px-4 py-3.5 text-left shadow-[var(--shadow)] transition-colors hover:border-accent/60 disabled:opacity-60"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              {today && (today.kind === "review" || today.kind === "weak") ? (
                <Repeat2 className="size-5" />
              ) : (
                <Play className="size-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.12em] text-accentink">
                <Clock className="size-3" /> 今天 · {today?.minutes ?? 10} 分钟
              </span>
              <span className="mt-0.5 block truncate font-serif text-[17px] text-ink">
                {today && today.kind !== "empty"
                  ? today.title
                  : todayFallbackPlan
                    ? `开始计划：${todayFallbackPlan.title}`
                    : ""}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-relaxed text-ink2">
                {today && today.kind !== "empty"
                  ? today.reason
                  : "从第一课开始，先学 10 分钟"}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-accentink">
              {todayBusy
                ? "准备中…"
                : today?.kind === "continue"
                  ? "继续"
                  : today?.kind === "review"
                    ? "复习"
                    : today?.kind === "weak"
                      ? "练一练"
                      : "开始"}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </section>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-2">
        {/* 无限学习 */}
        <div className="flex min-w-0 flex-col rounded-2xl border border-accent/25 bg-panel p-4 shadow-[var(--shadow)]">
          <div className="flex items-start gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accentsoft">
              <InfinityIcon className="size-5 text-accent" />
            </span>
            <div>
              <h2 className="font-serif text-[18px] text-ink">无限学习</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
                直接提问、换讲法、要练习；不生成正式进度。
              </p>
            </div>
          </div>
          <textarea
            ref={infiniteRef}
            value={infiniteText}
            onChange={(e) => setInfiniteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void start("infinite");
              }
            }}
            rows={3}
            placeholder="想学什么？比如「从零讲讲什么是机会成本」"
            className="mt-3 w-full resize-none rounded-xl border border-line bg-panel2/30 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink3 focus:border-accent"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12px] text-ink3">可随时暂停，历史里能接着聊</span>
            <Button
              size="sm"
              loading={sending === "infinite"}
              disabled={!infiniteText.trim()}
              icon={<ArrowUp className="size-3.5" />}
              onClick={() => void start("infinite")}
            >
              开始对话
            </Button>
          </div>
          {continueInfinite ? (
            <Link
              href={`/s/${continueInfinite.id}`}
              className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-panel2/30 px-3 py-2 text-[12px] text-ink2 transition-colors hover:border-accent/40"
            >
              <BookOpen className="size-3.5 shrink-0 text-ink3" />
              <span className="min-w-0 flex-1 truncate">继续：{continueInfinite.title}</span>
              <ArrowRight className="size-3.5 shrink-0 text-ink3" />
            </Link>
          ) : null}
        </div>

        {/* 目标学习 */}
        <div
          className={`flex min-w-0 flex-col rounded-2xl border bg-panel p-4 transition-all duration-300 ${
            goalFocus ? "border-accent ring-2 ring-accent/25 shadow-[var(--shadow)]" : "border-line"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-panel2">
              <RouteIcon className="size-5 text-ink2" />
            </span>
            <div>
              <h2 className="font-serif text-[18px] text-ink">目标学习</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
                AI 先出「计划 → 课程 → 知识点」草稿，你确认后再学。
              </p>
            </div>
          </div>
          <textarea
            ref={goalRef}
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void start("goal");
              }
            }}
            rows={3}
            placeholder="比如「从零系统学习 K 线基础与技术分析」"
            className="mt-3 w-full resize-none rounded-xl border border-line bg-panel2/30 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink3 focus:border-accent"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={sending === "goal"}
              disabled={!goalText.trim()}
              icon={<ArrowRight className="size-3.5" />}
              onClick={() => void start("goal")}
            >
              生成计划草稿
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-panel2/30 px-3 py-2 text-[12px] text-ink2">
            <span>
              {activePlans.length > 0 ? "已有目标计划" : "还没有正式计划"}
              {draftCount > 0 ? ` · ${draftCount} 份草稿待确认` : ""}
            </span>
            <Link href="/plan" className="text-accentink hover:underline">
              查看计划
            </Link>
          </div>
        </div>
      </section>

      {/* 目标计划 */}
      {activePlans.length > 0 || draftCount > 0 ? (
        <section className="mt-8">
          <SectionHeader
            title="目标学习计划"
            hint={draftCount > 0 ? `${draftCount} 份草稿待确认` : undefined}
            action={
              <Link href="/plan" className="text-[12px] text-accentink">
                全部计划
              </Link>
            }
          />
          <div className="grid gap-2.5">
            {plans
              .filter((p) => p.status === "draft")
              .slice(0, 2)
              .map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            {activePlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </section>
      ) : null}

      {/* 待复习与最近无限学习 */}
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionHeader
            title="需要复习"
            hint={data?.review.length ? `${data.review.length} 条` : "来自真实作答证据"}
            action={
              data?.review.length ? (
                <Link href="/review" className="text-[12px] text-accentink">
                  全部
                </Link>
              ) : undefined
            }
          />
          {data?.review.length ? (
            <div className="flex flex-col gap-1.5">
              {data.review.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  onClick={() => void startReview(item)}
                  className="group flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-left transition-colors hover:border-accent/40"
                >
                  <Repeat2 className="size-3.5 shrink-0 text-ink3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{item.conceptName}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-ink3">
                      {item.planTitle ? `${item.planTitle} · ` : ""}
                      {item.courseName ? `${item.courseName} · ` : ""}
                      {item.reason}
                    </span>
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-ink3 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line px-3 py-4 text-[12px] leading-relaxed text-ink3">
              做完练习后，这里会出现该复习的内容。
            </p>
          )}
        </section>

        <section className="min-w-0">
          <SectionHeader
            title="最近无限学习"
            action={
              infiniteSessions.length ? (
                <Link href="/history" className="text-[12px] text-accentink">
                  全部历史
                </Link>
              ) : undefined
            }
          />
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-[12px] text-ink3">
              <Spinner /> 读取中…
            </div>
          ) : infiniteSessions.length ? (
            <div className="flex flex-col gap-1">
              {infiniteSessions.slice(0, 4).map((session) => (
                <Link
                  key={session.id}
                  href={`/s/${session.id}`}
                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors hover:bg-panel2/60"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-line-strong" />
                  <span className="min-w-0 flex-1 truncate text-[12.8px] text-ink">{session.title}</span>
                  <span className="shrink-0 text-[12px] text-ink3">
                    {new Date(session.updatedAt).toLocaleDateString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line px-3 py-4 text-[12px] leading-relaxed text-ink3">
              提第一个问题，就会出现在这里。
            </p>
          )}
        </section>
      </div>

      {data?.weak.length ? (
        <section className="mt-7">
          <SectionHeader title="待巩固" hint={`${data.weak.length} 个知识点`} />
          <div className="flex flex-wrap gap-1.5">
            {data.weak.map((concept) => (
              <Link
                key={concept.id}
                href={`/library?c=${concept.id}`}
                className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-[12px] text-ink2 hover:border-accent/40"
              >
                {concept.name}
                <StatusPill
                  status={concept.status}
                  displayStatus={concept.displayStatus}
                  introduced={Boolean(concept.introducedAt)}
                />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { href: "/library", label: "学习档案", icon: BookOpen, hint: "按课程看知识点" },
          { href: "/review", label: "复习", icon: Repeat2, hint: "按证据排期" },
          { href: "/plan", label: "目标学习", icon: RouteIcon, hint: "计划与课程" },
          { href: "/materials", label: "学习材料", icon: FolderOpen, hint: "上传与解析" },
        ].map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="group rounded-xl border border-line bg-panel px-3 py-3 transition-all hover:border-accent/40"
          >
            <q.icon className="size-4 text-ink3 transition-colors group-hover:text-accent" />
            <p className="mt-2 text-[13px] text-ink">{q.label}</p>
            <p className="text-[12px] text-ink3">{q.hint}</p>
          </Link>
        ))}
      </section>

      {!loading && data && data.sessions.length === 0 ? (
        <p className="mt-8 text-center text-[12px] text-ink3">
          这里不会显示假的学习时长和掌握率——所有数字都来自真实作答记录。
        </p>
      ) : null}
    </div>
  );
}
