import { getPlan, latestPlanForConcept } from "@/lib/db/repo";
import type { ConceptDTO, ReviewItemDTO, SessionSummary, TodayPlan } from "@/lib/types";

/**
 * "今天该学什么"：到期复习 > 最薄弱知识点 > 继续上次（都没有就空态，不造假任务）。
 * 口径固定在这里，工作台和接口不会各算一套。
 */
export function pickTodayPlan(
  review: ReviewItemDTO[],
  weak: ConceptDTO[],
  sessions: SessionSummary[],
  nowMs = Date.now(),
): TodayPlan {
  const startOfDay = new Date(nowMs);
  startOfDay.setHours(0, 0, 0, 0);
  const studiedToday = (ts?: number | null) => Boolean(ts && ts >= startOfDay.getTime());
  const topWeak = weak.find((w) => !studiedToday(w.lastStudiedAt)) ?? null;

  if (review.length) {
    return {
      kind: "review",
      title: `复习：${review[0].conceptName}`,
      reason: review[0].reason,
      minutes: 10,
      conceptId: review[0].conceptId,
      reviewItemId: review[0].id,
      planId: review[0].planId,
      planTitle: review[0].planTitle,
    };
  }

  if (topWeak) {
    const weakPlanId = latestPlanForConcept(topWeak.id);
    return {
      kind: "weak",
      title: `巩固：${topWeak.name}`,
      reason:
        topWeak.wrongStreak > 0
          ? `最近连续答错 ${topWeak.wrongStreak} 次，需要换一种方式再测一次`
          : "证据还不够，换一种题型验证一下",
      minutes: 10,
      conceptId: topWeak.id,
      planId: weakPlanId,
      planTitle: weakPlanId ? getPlan(weakPlanId)?.title ?? null : null,
    };
  }

  const last = sessions.find((x) => x.messageCount > 0);
  if (last) {
    const cleanTitle = last.title.replace(/^(课程|规划|复习)：/, "");
    const focus =
      last.mode === "goal" ? last.focusConceptName ?? last.courseTitle ?? cleanTitle : cleanTitle;
    return {
      kind: "continue",
      title: `继续：${focus}`,
      reason: last.resumeHint ?? "没有到期的复习，接着上次的思路往下走",
      minutes: 10,
      sessionId: last.id,
    };
  }

  return {
    kind: "empty",
    title: "还没有可安排的内容",
    reason: "先随便问一个问题，系统才会有真实的学习记录",
    minutes: 10,
  };
}
