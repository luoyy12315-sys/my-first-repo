import { aiStatus } from "@/lib/ai/config";
import {
  getPlan,
  latestPlanForConcept,
  listConcepts,
  listMaterials,
  listReviewItems,
  listSessions,
  listTopics,
  listWeakConcepts,
  refreshReviewQueue,
} from "@/lib/db/repo";
import type { TodayPlan } from "@/lib/types";
import { handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    refreshReviewQueue();
    const sessions = listSessions(8).filter((s) => s.messageCount > 0);
    const concepts = listConcepts({ limit: 500 });
    const withEvidence = concepts.filter((c) => c.evidenceCount > 0);
    const review = listReviewItems().slice(0, 4);
    const weak = listWeakConcepts(3);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const studiedToday = (ts?: number | null) => Boolean(ts && ts >= startOfDay.getTime());
    const topWeak = weak.find((w) => !studiedToday(w.lastStudiedAt)) ?? null;

    // "今天做什么"：到期复习 > 最薄弱知识点 > 继续上次（没有就空态，不造假任务）
    let todayPlan: TodayPlan = {
      kind: "empty",
      title: "还没有可安排的内容",
      reason: "先随便问一个问题，系统才会有真实的学习记录",
      minutes: 10,
    };
    if (review.length) {
      todayPlan = {
        kind: "review",
        title: `复习：${review[0].conceptName}`,
        reason: review[0].reason,
        minutes: 10,
        conceptId: review[0].conceptId,
        reviewItemId: review[0].id,
        planId: review[0].planId,
        planTitle: review[0].planTitle,
      };
    } else if (topWeak) {
      const weakPlanId = latestPlanForConcept(topWeak.id);
      todayPlan = {
        kind: "weak",
        title: `巩固：${topWeak.name}`,
        reason:
          topWeak.wrongStreak > 0
            ? `最近连续答错 ${topWeak.wrongStreak} 次，需要换一种方式再测一次`
            : `证据还不够，换一种题型验证一下`,
        minutes: 10,
        conceptId: topWeak.id,
        planId: weakPlanId,
        planTitle: weakPlanId ? getPlan(weakPlanId)?.title ?? null : null,
      };
    } else {
      const last = sessions.find((x) => x.messageCount > 0);
      if (last) {
        todayPlan = {
          kind: "continue",
          title: `继续：${last.title}`,
          reason: "没有到期的复习，接着上次的思路往下走",
          minutes: 10,
          sessionId: last.id,
        };
      }
    }

    return ok({
      ai: aiStatus(),
      todayPlan,
      sessions,
      continueSession: sessions.find((s) => s.messageCount > 0) ?? null,
      topics: listTopics().slice(0, 6),
      weak,
      review,
      materials: listMaterials().slice(0, 3),
      stats: {
        concepts: concepts.length,
        withEvidence: withEvidence.length,
        mastered: concepts.filter((c) => c.status === "mastered").length,
        initial: concepts.filter((c) => c.status === "initial").length,
        needsWork: concepts.filter((c) => c.status === "needs_work").length,
        sessions: sessions.length,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
