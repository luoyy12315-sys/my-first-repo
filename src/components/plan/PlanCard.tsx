"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Clock3, Trash2, TriangleAlert } from "lucide-react";
import { Badge, Progress, cx } from "@/components/ui/kit";
import type { PlanDTO } from "@/lib/types";

export function planStatusText(plan: PlanDTO) {
  if (plan.status === "draft") return "待确认";
  if (plan.status === "paused") return "已暂停";
  if (
    plan.progress.coursesTotal > 0 &&
    plan.progress.coursesDone === plan.progress.coursesTotal &&
    plan.progress.unconfiguredCourses === 0
  ) {
    return "已完成";
  }
  return "进行中";
}

export default function PlanCard({
  plan,
  onDelete,
  className,
}: {
  plan: PlanDTO;
  onDelete?: () => void;
  className?: string;
}) {
  const status = planStatusText(plan);
  const complete = status === "已完成";
  const href =
    plan.status !== "draft" && plan.currentCourseId
      ? `/plan/${plan.id}/course/${plan.currentCourseId}`
      : `/plan/${plan.id}`;
  const action =
    plan.status === "draft"
      ? "查看并确认"
      : complete
        ? "查看课程"
        : plan.status === "paused"
          ? "查看计划"
          : plan.currentCourseId
            ? "继续学习"
            : "查看计划";

  return (
    <div className={cx("min-w-0 rounded-2xl border border-line bg-panel p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-serif text-[16px] leading-6 text-ink">{plan.title}</h3>
            <Badge
              tone={
                plan.status === "draft"
                  ? "warn"
                  : complete
                    ? "ok"
                    : plan.status === "paused"
                      ? "neutral"
                      : "accent"
              }
            >
              {status}
            </Badge>
          </div>
          {plan.note ? (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink3">{plan.note}</p>
          ) : null}
        </div>
        {onDelete ? (
          <button
            onClick={onDelete}
            className="rounded-full p-1.5 text-ink3 transition-colors hover:bg-badsoft hover:text-bad"
            title="删除这个计划"
            aria-label={`删除计划 ${plan.title}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[12px] text-ink3">
          <span>学习进度</span>
          <span className="tabular-nums">
            {plan.progress.percent}% · 已掌握 {plan.progress.conceptsMastered}/
            {plan.progress.conceptsTotal}
          </span>
        </div>
        <Progress value={plan.progress.percent} max={100} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink3">
        <span className="flex items-center gap-1">
          <BookOpen className="size-3.5" />
          已完成课程 {plan.progress.coursesDone}/{plan.progress.coursesTotal}
        </span>
        <span className="flex min-w-0 items-center gap-1">
          <Clock3 className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {complete
              ? "全部课程已完成"
              : plan.currentCourseTitle
                ? `当前：${plan.currentCourseTitle}${plan.currentConceptName ? ` · ${plan.currentConceptName}` : ""}`
                : plan.status === "draft"
                  ? "确认课程目录后开始"
                  : "尚未开始"}
          </span>
        </span>
        {plan.progress.unconfiguredCourses > 0 ? (
          <span className="flex items-center gap-1 text-warn">
            <TriangleAlert className="size-3.5" />
            {plan.progress.unconfiguredCourses} 门课程未配置知识点
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
        <span className="text-[12px] text-ink3">
          {plan.counts.sessions} 个会话 · {plan.counts.materials} 份材料
        </span>
        <Link
          href={href}
          className="flex items-center gap-1 rounded-full bg-accentsoft px-3 py-1 text-[12px] text-accentink transition-colors hover:bg-accent/15"
        >
          {action}
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
