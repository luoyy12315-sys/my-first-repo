"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Play, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, EmptyState, Progress, Spinner, StatusPill } from "@/components/ui/kit";
import type { PlanDTO } from "@/lib/types";

const COURSE_LABEL: Record<string, string> = {
  pending: "待开始",
  in_progress: "进行中",
  done: "已完成",
  skipped: "已跳过",
  unconfigured: "未配置知识点",
};

export default function CoursePage() {
  const params = useParams<{ id: string; courseId: string }>();
  const planId = params?.id ?? "";
  const courseId = params?.courseId ?? "";
  const router = useRouter();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans/${planId}`, { cache: "no-store" });
      const data = (await res.json()) as { plan?: PlanDTO; error?: string };
      if (!res.ok || !data.plan) throw new Error(data.error ?? "计划不存在");
      setPlan(data.plan);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener("plans:changed", onChange);
    window.addEventListener("session:progress", onChange);
    return () => {
      window.removeEventListener("plans:changed", onChange);
      window.removeEventListener("session:progress", onChange);
    };
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-10 text-[13px] text-ink3 md:px-8">
        <Spinner /> 读取课程…
      </div>
    );
  }

  const course = plan?.items.find((item) => item.id === courseId) ?? null;
  if (error || !plan || !course) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <EmptyState
          title="课程不存在"
          description={error ?? "它可能已从计划中移除。"}
          action={
            <Link href={`/plan/${planId}`}>
              <Button variant="secondary">返回计划</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const done = course.status === "done";
  const canLearn =
    plan.status === "active" &&
    course.status !== "skipped" &&
    !course.unconfigured &&
    course.concepts.length > 0;

  const start = async () => {
    if (!canLearn || starting) return;
    setStarting(true);
    try {
      const focusId = course.nextConceptId ?? course.concepts[0]?.id ?? undefined;
      const focusName = course.nextConceptName ?? course.concepts[0]?.name ?? null;
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "goal",
          planId: plan.id,
          planItemId: course.id,
          focusConceptId: focusId,
          title: `课程：${course.title}`,
        }),
      });
      const data = (await res.json()) as { session?: { id: string }; error?: string };
      if (!res.ok || !data.session) throw new Error(data.error ?? "创建学习会话失败");
      const q = `我正在课程「${course.title}」里学习${
        focusName ? `，当前知识点是「${focusName}」` : ""
      }。请先讲清楚这个知识点，再出题检验；不要一次覆盖整门课。`;
      router.push(`/s/${data.session.id}?q=${encodeURIComponent(q)}`);
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-ink3">
        <Link href="/plan" className="flex items-center gap-1 hover:text-ink">
          <ArrowLeft className="size-3.5" /> 目标学习
        </Link>
        <span>/</span>
        <Link href={`/plan/${plan.id}`} className="max-w-[200px] truncate hover:text-ink">
          {plan.title}
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-[25px] leading-tight tracking-tight text-ink">
              {course.title}
            </h1>
            <Badge
              tone={
                done
                  ? "ok"
                  : course.status === "skipped"
                    ? "neutral"
                    : course.status === "unconfigured"
                      ? "warn"
                      : "accent"
              }
            >
              {COURSE_LABEL[course.status]}
            </Badge>
          </div>
          {course.description ? (
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink2">
              {course.description}
            </p>
          ) : null}
          <p className="mt-1 text-[12px] text-ink3">
            所属计划：{plan.title} · 计划学习进度 {plan.progress.percent}%
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Link href={`/plan/${plan.id}`}>
            <Button size="sm" variant="ghost">
              管理课程结构
            </Button>
          </Link>
          {plan.status === "draft" ? (
            <Link href={`/plan/${plan.id}`}>
              <Button size="sm" variant="secondary">
                先确认计划
              </Button>
            </Link>
          ) : (
            <Button
              size="sm"
              icon={<Play className="size-3.5" />}
              loading={starting}
              disabled={!canLearn || plan.status === "paused"}
              onClick={() => void start()}
              title={
                plan.status === "paused"
                  ? "计划已暂停，请先在计划页恢复"
                  : course.unconfigured
                    ? "请先为这门课程添加知识点"
                    : undefined
              }
            >
              {done ? "复习本课程" : course.status === "in_progress" ? "继续学习" : "开始学习"}
            </Button>
          )}
        </div>
      </div>

      {plan.status === "draft" ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warnsoft/40 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>计划还是草稿，确认后才能开始这门课程。</span>
        </div>
      ) : null}
      {plan.status === "paused" ? (
        <div className="mb-4 rounded-xl border border-line bg-panel2/50 px-3.5 py-2.5 text-[12.5px] text-ink2">
          计划已暂停，课程内容仍可查看；恢复计划后才能继续学习。
        </div>
      ) : null}
      {course.unconfigured ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warnsoft/40 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            这门课程还没有知识点，不能计入完成率，也不能开始学习。请先到
            <Link href={`/plan/${plan.id}`} className="mx-1 underline">
              计划编辑页
            </Link>
            添加。
          </span>
        </div>
      ) : null}

      <div className="mb-5 rounded-2xl border border-line bg-panel p-4">
        <div className="mb-1 flex items-center justify-between text-[12px] text-ink3">
          <span>学习进度</span>
          <span className="tabular-nums">{course.progress.percent}%</span>
        </div>
        <Progress value={course.progress.percent} max={100} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink3">
          <span>
            已掌握 {course.progress.mastered}/{course.progress.total} 个知识点
          </span>
          {course.nextConceptName ? (
            <span className="flex items-center gap-1 text-accentink">
              <ArrowRight className="size-3" />
              下一个：{course.nextConceptName}
            </span>
          ) : course.concepts.length > 0 ? (
            <span className="text-ok">本课程知识点已全部掌握</span>
          ) : null}
        </div>
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-[12px] font-medium uppercase tracking-wide text-ink3">课程知识点</h2>
          <span className="text-[12px] text-ink3">
            {course.concepts.length} 个 · 点开查看学习依据与作答记录
          </span>
        </div>
        {course.concepts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-ink3">
            还没有知识点。先到计划编辑页添加，才能开始学习。
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {course.concepts.map((concept) => (
              <Link
                key={concept.id}
                href={`/library?c=${concept.id}`}
                className="group flex items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-2.5 transition-colors hover:border-accent/40"
              >
                <BookOpen className="size-4 shrink-0 text-ink3" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] text-ink">{concept.name}</p>
                </div>
                <StatusPill
                  status={concept.status}
                  displayStatus={concept.displayStatus}
                  introduced={Boolean(concept.introducedAt)}
                />
                <ArrowRight className="size-3.5 shrink-0 text-ink3 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
