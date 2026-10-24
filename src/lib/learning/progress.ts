import type {
  ConceptDisplayStatus,
  ConceptStatus,
  CourseProgress,
  CourseStatus,
  PlanProgress,
} from "@/lib/types";

export interface ConceptLike {
  status: ConceptStatus;
  evidenceCount: number;
  introducedAt?: number | null;
  nextReviewAt?: number | null;
  /** 最近一次有效作答；用于「掌握」随时间回收 */
  lastStudiedAt?: number | null;
}

/** 长期没有任何作答的判定阈值（天）：掌握不是永久徽章 */
const STALE_MASTERED_DAYS = 90;

function isStale(c: ConceptLike, at: number): boolean {
  if (!c.lastStudiedAt) return false;
  return at - c.lastStudiedAt > STALE_MASTERED_DAYS * 86400000;
}

/**
 * 从内部掌握度推导普通界面使用的四种状态。
 *
 * 「已掌握」会随时间回收：到期该复习、或连续 90 天没有任何作答证据，
 * 都退回「待复习」。旧实现先判 mastered 直接 return，导致课程可以永久 100%。
 */
export function conceptDisplayStatus(c: ConceptLike, at = Date.now()): ConceptDisplayStatus {
  const due = Boolean(c.evidenceCount > 0 && c.nextReviewAt && c.nextReviewAt <= at);
  if (c.status === "mastered") {
    return due || isStale(c, at) ? "review" : "mastered";
  }
  if (c.status === "needs_work") return "review";
  if (due) return "review";
  if (c.evidenceCount > 0 || c.introducedAt || c.status === "learning" || c.status === "initial") {
    return "learning";
  }
  return "todo";
}

export function courseProgressOf(concepts: ConceptLike[], at = Date.now()): CourseProgress {
  const total = concepts.length;
  const mastered = concepts.filter((c) => conceptDisplayStatus(c, at) === "mastered").length;
  const weightOf = (c: ConceptLike) => {
    const display = conceptDisplayStatus(c, at);
    // 学习进度与“完成”分开：学到一半也有进度，但只有 mastered 才算完成课程
    return display === "mastered" ? 1 : display === "learning" ? 0.4 : display === "review" ? 0.2 : 0;
  };
  const earned = concepts.reduce((sum, c) => sum + weightOf(c), 0);
  return {
    mastered,
    total,
    percent: total ? Math.round((earned / total) * 100) : 0,
  };
}

/**
 * 课程状态只由「课程内知识点」推导，skipped 是用户显式跳过。
 * 空课程不是完成，也不计入完成率；界面必须单独提示“未配置知识点”。
 */
export function courseStatusOf(
  stored: "pending" | "in_progress" | "done" | "skipped",
  concepts: ConceptLike[],
  at = Date.now(),
): CourseStatus {
  if (stored === "skipped") return "skipped";
  if (!concepts.length) return "unconfigured";
  const displays = concepts.map((c) => conceptDisplayStatus(c, at));
  if (displays.every((s) => s === "mastered")) return "done";
  if (stored === "in_progress" || displays.some((s) => s !== "todo")) return "in_progress";
  return "pending";
}

export function planProgressOf(
  courses: { status: CourseStatus; concepts: ConceptLike[] }[],
  at = Date.now(),
): PlanProgress {
  const active = courses.filter((c) => c.status !== "skipped");
  const allConcepts = active.flatMap((c) => c.concepts);
  const conceptsTotal = allConcepts.length;
  const conceptsMastered = allConcepts.filter(
    (c) => conceptDisplayStatus(c, at) === "mastered",
  ).length;
  const earned = allConcepts.reduce((sum, c) => {
    const display = conceptDisplayStatus(c, at);
    return sum + (display === "mastered" ? 1 : display === "learning" ? 0.4 : display === "review" ? 0.2 : 0);
  }, 0);
  const coursesDone = active.filter(
    (c) => c.concepts.length > 0 && c.concepts.every((x) => conceptDisplayStatus(x, at) === "mastered"),
  ).length;
  return {
    conceptsMastered,
    conceptsTotal,
    percent: conceptsTotal ? Math.round((earned / conceptsTotal) * 100) : 0,
    coursesDone,
    coursesTotal: active.length,
    unconfiguredCourses: active.filter((c) => c.concepts.length === 0).length,
  };
}
