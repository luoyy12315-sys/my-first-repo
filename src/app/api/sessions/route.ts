import {
  createSession,
  findOpenReviewSession,
  getConcept,
  getPlan,
  getSession,
  latestPlanForConcept,
  listSessions,
  setSessionPlan,
} from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";
import type { LearningMode } from "@/lib/types";

export const runtime = "nodejs";

const MODES: LearningMode[] = ["infinite", "goal", "review"];

export async function GET() {
  try {
    // 0 消息的会话只是“点了新建但没开始”，不应占据侧栏和历史。
    return ok({ sessions: listSessions(40).filter((s) => s.messageCount > 0) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      title?: string;
      mode?: LearningMode;
      goalId?: string;
      planId?: string | null;
      planItemId?: string | null;
      focusConceptId?: string;
      reviewItemId?: string;
    }>(req);
    const mode = body.mode ?? "infinite";
    if (!MODES.includes(mode)) {
      return fail(400, "mode 只能是 infinite / goal / review");
    }

    // 无限学习永远不自动挂到计划/课程上；用户在明确整理时再走归档动作。
    if (mode === "infinite") {
      const session = createSession({
        title: body.title?.slice(0, 80) || "新的学习",
        mode,
        reviewItemId: body.reviewItemId,
        focusConceptId: body.focusConceptId,
      });
      return ok({ session });
    }

    let planId: string | null | undefined = body.planId;
    let planItemId: string | null | undefined = body.planItemId;

    if (mode === "review" && body.focusConceptId) {
      const concept = getConcept(body.focusConceptId);
      if (concept) {
        planId = planId ?? concept.planId ?? latestPlanForConcept(concept.id);
        planItemId = planItemId ?? concept.courseId ?? null;
      }
    } else if (body.planId === undefined && body.focusConceptId) {
      planId = latestPlanForConcept(body.focusConceptId);
    }

    if (planId) {
      if (typeof planId !== "string") return fail(400, "计划不存在");
      const plan = getPlan(planId);
      if (!plan) return fail(400, "计划不存在");
      if (plan.status === "draft") return fail(400, "计划尚未确认，不能开始学习");
      if (planItemId) {
        if (typeof planItemId !== "string" || !plan.items.some((item) => item.id === planItemId)) {
          return fail(400, "课程不存在或不属于该计划");
        }
        if (plan.items.find((item) => item.id === planItemId)?.status === "skipped") {
          return fail(400, "这门课程已跳过，请先在计划中恢复");
        }
      }
    } else {
      planId = null;
      planItemId = null;
    }

    // 复习是"一段连续动作"：同一条复习建议已经有未作答的会话时，回到那一条，
    // 而不是每点一次「练一练」就新开一个同名会话。
    if (mode === "review" && body.reviewItemId) {
      const existing = findOpenReviewSession(body.reviewItemId);
      if (existing) {
        if (planId) setSessionPlan(existing.id, planId);
        const session = getSession(existing.id);
        if (session) return ok({ session, reused: true });
      }
    }

    const session = createSession({
      title: body.title?.slice(0, 80) || (mode === "review" ? "复习" : "新的学习"),
      mode,
      goalId: body.goalId,
      planId,
      planItemId,
      focusConceptId: body.focusConceptId,
      reviewItemId: body.reviewItemId,
    });
    return ok({ session });
  } catch (e) {
    return handleError(e);
  }
}
