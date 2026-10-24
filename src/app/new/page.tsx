"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowUp, Clock, Repeat2, Route as RouteIcon, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cx, Spinner } from "@/components/ui/kit";
import { usePlans } from "@/components/PlanSelect";
import type { AiStatus, SessionSummary, TodayPlan } from "@/lib/types";

type Mode = "infinite" | "goal";

const EXAMPLES = [
  { mode: "infinite" as Mode, label: "解释一个概念", text: "用一个生活里的例子解释贝叶斯定理。" },
  { mode: "infinite" as Mode, label: "出几道题", text: "给我 3 道二次函数的练习题，从易到难。" },
  { mode: "goal" as Mode, label: "定个学习目标", text: "我想在两周内学会 SQL 查询。" },
];

export default function NewChatPage() {
  const router = useRouter();
  const { plans } = usePlans();
  const [mode, setMode] = useState<Mode>("infinite");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [today, setToday] = useState<TodayPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/home", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          ai: AiStatus;
          sessions: SessionSummary[];
          todayPlan: TodayPlan;
        };
        setAi(data.ai);
        setSessions(data.sessions ?? []);
        setToday(data.todayPlan ?? null);
      }
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

  // /plan 的「设定新目标」会带 ?mode=goal 过来：切到目标模式并聚焦输入框
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") !== "goal") return;
    setMode("goal");
    const timer = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 140);
    const url = new URL(window.location.href);
    url.searchParams.delete("mode");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    return () => clearTimeout(timer);
  }, []);

  const grow = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    grow();
  }, [text, grow]);

  const start = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
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
      setSending(false);
    }
  };

  const continueItem = useMemo(() => {
    if (today && today.kind !== "empty") {
      const href =
        today.kind === "continue" && today.sessionId
          ? `/s/${today.sessionId}`
          : today.kind === "review" && today.conceptId
            ? "/review"
            : today.planId
              ? `/plan/${today.planId}`
              : "/review";
      return {
        href,
        title: today.title,
        meta: `${today.kind === "review" ? "复习" : today.kind === "weak" ? "练一练" : "继续"} · ${today.minutes} 分钟`,
        icon: today.kind === "review" || today.kind === "weak" ? Repeat2 : Clock,
      };
    }
    const last = sessions.find((s) => s.messageCount > 0);
    if (!last) return null;
    return {
      href: `/s/${last.id}`,
      title: last.title,
      meta: "继续上次",
      icon: Clock,
    };
  }, [today, sessions]);

  const draftCount = plans.filter((p) => p.status === "draft").length;
  const unavailable = Boolean(ai && !ai.configured);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-2xl flex-col justify-center px-4 pb-16 md:min-h-dvh md:px-6">
      <h1 className="mb-7 text-center font-serif text-[26px] leading-tight tracking-tight text-ink md:text-[30px]">
        想学什么？
      </h1>

      {unavailable ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-warnsoft/60 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            {ai?.reason ?? "还没有配置模型"}。
            <Link href="/settings" className="mx-1 underline">
              去设置
            </Link>
            配置后才能开始。
          </span>
        </div>
      ) : null}

      {ai?.configured && ai.lastError ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-badsoft/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" />
          <span>
            上次调用失败：{ai.lastError}。
            <Link href="/settings" className="mx-1 underline">
              去设置
            </Link>
            检查。
          </span>
        </div>
      ) : null}

      <div className="rounded-3xl border border-line bg-panel p-2 shadow-[var(--shadow)] transition-colors focus-within:border-accent/60">
        <textarea
          ref={inputRef}
          value={text}
          rows={2}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void start();
            }
          }}
          placeholder={mode === "goal" ? "想系统学什么？我给你排一份计划草稿…" : "问一个问题，或者贴一段看不懂的内容…"}
          className="max-h-[200px] w-full resize-none bg-transparent px-3.5 pt-2.5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink3"
        />
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
          <div className="flex items-center gap-0.5 rounded-full bg-panel2 p-0.5">
            {(["infinite", "goal"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  inputRef.current?.focus();
                }}
                className={cx(
                  "rounded-full px-3 py-1 text-[12px] transition-colors",
                  mode === m ? "bg-panel text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink3 hover:text-ink2",
                )}
              >
                {m === "goal" ? "定目标" : "直接问"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void start()}
            disabled={!text.trim() || sending || unavailable}
            aria-label="开始"
            title="开始（Enter）"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-all hover:brightness-110 disabled:opacity-35"
          >
            {sending ? <Spinner className="text-white" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => {
              setMode(ex.mode);
              setText(ex.text);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="rounded-full border border-line bg-panel px-3 py-1.5 text-[12px] text-ink2 transition-colors hover:border-linestrong hover:text-ink"
          >
            {ex.label}
          </button>
        ))}
      </div>

      {loading ? null : continueItem ? (
        <Link
          href={continueItem.href}
          className="group mt-8 flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 transition-colors hover:border-accent/40"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-panel2 text-ink2">
            <continueItem.icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] text-ink">{continueItem.title}</span>
            <span className="mt-0.5 block text-[12px] text-ink3">{continueItem.meta}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-ink3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}

      {draftCount > 0 ? (
        <Link
          href="/plan"
          className="mt-2 flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] text-accentink hover:bg-panel2"
        >
          <RouteIcon className="size-3.5" />
          {draftCount} 份计划草稿待确认
          <ArrowRight className="ml-auto size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}