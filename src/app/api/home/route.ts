import { aiStatus } from "@/lib/ai/config";
import {
  listConcepts,
  listMaterials,
  listReviewItems,
  listSessions,
  listTopics,
  listWeakConcepts,
  refreshReviewQueue,
} from "@/lib/db/repo";
import { pickTodayPlan } from "@/lib/study/today";
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

    const todayPlan = pickTodayPlan(review, weak, sessions);

    return ok({
      ai: aiStatus(),
      todayPlan,
      sessions,
      continueSession: sessions.find((s) => s.messageCount > 0) ?? null,
      topics: listTopics().slice(0, 6),
      weak,
      review,
      materials: listMaterials().slice(0, 3),
      // 统计口径与档案/计划页一致：全部走 displayStatus（含到期与长期未复测的回收），
      // 不再直接数内部 status，避免首页和计划页数字对不上。
      stats: {
        concepts: concepts.length,
        withEvidence: withEvidence.length,
        mastered: concepts.filter((c) => c.displayStatus === "mastered").length,
        initial: concepts.filter((c) => c.displayStatus === "learning").length,
        needsWork: concepts.filter((c) => c.displayStatus === "review").length,
        todo: concepts.filter((c) => c.displayStatus === "todo").length,
        sessions: sessions.length,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
