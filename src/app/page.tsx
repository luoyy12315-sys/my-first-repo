"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  Repeat2,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import StudyTimeChart from "@/components/study/StudyTimeChart";
import { Button, PageHeader, Spinner, cx } from "@/components/ui/kit";
import type { StudyOverview, TodayPlan } from "@/lib/types";

function actionFor(plan: TodayPlan) {
  if (plan.kind === "continue" && plan.sessionId) return { href: `/s/${plan.sessionId}`, label: "继续" };
  if (plan.kind === "review") return { href: "/review", label: "去复习" };
  if (plan.kind === "weak") {
    return plan.planId ? { href: `/plan/${plan.planId}`, label: "练一练" } : { href: "/review", label: "练一练" };
  }
  return { href: "/new", label: "开始提问" };
}

function TodayIcon({ kind }: { kind: TodayPlan["kind"] }) {
  const Icon = kind === "review" || kind === "weak" ? Repeat2 : kind === "continue" ? Clock : Sparkles;
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accentsoft text-accent">
      <Icon className="size-4" />
    </span>
  );
}

export default function StudyPage() {
  const router = useRouter();
  const [data, setData] = useState<StudyOverview | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/study", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as StudyOverview);
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("sessions:changed", onChange);
    window.addEventListener("plans:changed", onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("sessions:changed", onChange);
      window.removeEventListener("plans:changed", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  if (!data) {
    return (
      <div className="mx-auto grid w-full max-w-3xl place-items-center px-4 py-24 md:px-6">
        <Spinner />
      </div>
    );
  }

  const today = data.todayPlan;
  const action = actionFor(today);
  const weakReviews = data.weak.filter((w) => w.kind === "review").length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-2 md:px-6">
      <PageHeader
        title="学习"
        action={
          <Button variant="secondary" size="sm" onClick={() => router.push("/new")}>
            新对话
          </Button>
        }
      />

      {data.ai && !data.ai.configured ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-warnsoft/60 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            {data.ai.reason ?? "还没有配置模型"}。
            <Link href="/settings" className="mx-1 underline">
              去设置
            </Link>
            配置后才能开始学习。
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 今天该学什么：整行，作为"现在该干什么"的主卡片 */}
        <section className="rounded-2xl border border-line bg-panel p-5 lg:col-span-2">
          <h2 className="mb-3 text-[13px] font-medium text-ink">今天该学什么</h2>
          <div className="flex items-start gap-3">
            <TodayIcon kind={today.kind} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-serif text-[19px] tracking-tight text-ink">{today.title}</h2>
              <p className="mt-1 max-w-[58ch] text-[13px] leading-relaxed text-ink2">{today.reason}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => router.push(action.href)}>
                  {action.label}
                  <ArrowRight className="size-3.5" />
                </Button>
                {today.planTitle && today.planId ? (
                  <Link
                    href={`/plan/${today.planId}`}
                    className="truncate text-[12px] text-ink3 transition-colors hover:text-ink2"
                  >
                    {today.planTitle}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <StudyTimeChart time={data.time} />

        {/* 目标进度 */}
        <section className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-medium text-ink">目标进度</h2>
            <Link href="/plan" className="text-[12px] text-ink3 transition-colors hover:text-ink2">
              全部计划
            </Link>
          </div>
          {data.plans.length ? (
            <ul className="mt-2 flex flex-col">
              {data.plans.map((p) => {
                const pct = p.total ? Math.round((p.mastered / p.total) * 100) : 0;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/plan/${p.id}`}
                      className="group flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-panel2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13.5px] text-ink">{p.title}</span>
                          <span className="shrink-0 text-[11.5px] text-ink3">
                            {p.mastered}/{p.total}
                          </span>
                        </span>
                        <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-line">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="mt-1 block truncate text-[11.5px] text-ink3">
                          {p.currentCourseTitle ? `下一门：${p.currentCourseTitle}` : "课程都学完了"}
                        </span>
                      </span>
                      <ArrowUpRight className="size-3.5 shrink-0 text-ink3 transition-colors group-hover:text-ink" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-dashed border-line px-3 py-2.5">
              <p className="text-[12.5px] text-ink3">还没有进行中的计划</p>
              <Button variant="secondary" size="sm" onClick={() => router.push("/new?mode=goal")}>
                <Target className="size-3.5" />
                定个学习目标
              </Button>
            </div>
          )}
        </section>

        {/* 需要再练：整行 */}
        <section className="rounded-2xl border border-line bg-panel p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-medium text-ink">需要再练</h2>
            {weakReviews ? (
              <Link href="/review" className="text-[12px] text-ink3 transition-colors hover:text-ink2">
                去复习
              </Link>
            ) : null}
          </div>
          {data.weak.length ? (
            <ul className="mt-2 flex flex-col">
              {data.weak.map((w) => (
                <li key={`${w.kind}-${w.conceptId}`}>
                  <Link
                    href={w.kind === "review" ? "/review" : `/archive?tab=concepts&c=${w.conceptId}`}
                    className="group flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-panel2"
                  >
                    <span
                      className={cx(
                        "size-1.5 shrink-0 rounded-full",
                        w.kind === "review" ? "bg-warn" : "bg-bad",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink">{w.name}</span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-ink3">
                        {w.kind === "review" ? "到期复习" : "薄弱点"} · {w.reason}
                        {w.courseTitle ? ` · ${w.courseTitle}` : ""}
                      </span>
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-ink3 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-[12.5px] text-ink3">
              暂时没有要补的，做过练习、有真实证据后这里会自动出现
            </p>
          )}
        </section>
      </div>
    </div>
  );
}