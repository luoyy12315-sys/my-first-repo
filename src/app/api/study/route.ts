import { aiStatus } from "@/lib/ai/config";
import { latestPlanForConcept, listConcepts, listPlans, listReviewItems, listSessions, listStudyTimeRows, refreshReviewQueue } from "@/lib/db/repo";
import { handleError, ok } from "@/lib/api/helpers";
import { pickTodayPlan } from "@/lib/study/today";
import { summarizeStudyTime } from "@/lib/study/time";
import type { StudyOverview, StudyPlanProgress, StudyWeakItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 学习工作台：今天该学什么 + 计划进度 + 需要再练 + 学习时长 */
export async function GET() {
  try {
    refreshReviewQueue();
    const sessions = listSessions(8).filter((s) => s.messageCount > 0);
    const review = listReviewItems();
    const weakConcepts = listConcepts({ limit: 500 })
      .filter((c) => c.status === "needs_work" || (c.status === "learning" && c.wrongStreak > 0))
      .sort((a, b) => b.wrongStreak - a.wrongStreak || a.pMastery - b.pMastery);

    const todayPlan = pickTodayPlan(review.slice(0, 4), weakConcepts.slice(0, 3), sessions);

    // 需要再练：到期复习优先，其次答错多的；同一个知识点只出现一次
    const weak: StudyWeakItem[] = [];
    const seen = new Set<string>();
    for (const item of review) {
      if (weak.length >= 5) break;
      if (seen.has(item.conceptId)) continue;
      seen.add(item.conceptId);
      weak.push({
        conceptId: item.conceptId,
        name: item.conceptName,
        kind: "review",
        reason: item.reason,
        planId: item.planId,
        courseTitle: item.courseName,
        pMastery: 0,
        wrongStreak: 0,
      });
    }
    for (const c of weakConcepts) {
      if (weak.length >= 5) break;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      weak.push({
        conceptId: c.id,
        name: c.name,
        kind: "weak",
        reason:
          c.wrongStreak > 0
            ? `最近连续答错 ${c.wrongStreak} 次`
            : `掌握度 ${Math.round(c.pMastery * 100)}%，证据还不足`,
        planId: c.planId ?? latestPlanForConcept(c.id),
        courseTitle: c.courseTitle ?? null,
        pMastery: c.pMastery,
        wrongStreak: c.wrongStreak,
      });
    }

    const plans: StudyPlanProgress[] = listPlans()
      .filter((p) => p.status === "active")
      .map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        mastered: p.progress.conceptsMastered,
        total: p.progress.conceptsTotal,
        currentCourseId: p.currentCourseId,
        currentCourseTitle: p.currentCourseTitle,
        reviews: p.counts.reviews,
        sessions: p.counts.sessions,
      }));

    const time = summarizeStudyTime(listStudyTimeRows(), Date.now());

    const payload: StudyOverview = {
      ai: aiStatus(),
      todayPlan,
      plans,
      weak,
      time,
    };
    return ok(payload);
  } catch (e) {
    return handleError(e);
  }
}