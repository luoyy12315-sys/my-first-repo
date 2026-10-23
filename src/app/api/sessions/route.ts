import { createSession, findOpenReviewSession, getPlan, getSession, latestPlanForConcept, listSessions, setSessionPlan } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";

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
      mode?: "free" | "goal" | "review";
      goalId?: string;
      planId?: string | null;
      planItemId?: string | null;
      focusConceptId?: string;
      reviewItemId?: string;
    }>(req);
    if (body.mode && !["free", "goal", "review"].includes(body.mode)) {
      return fail(400, "mode 只能是 free / goal / review");
    }
    let planId: string | null | undefined = undefined;
    if (body.planId !== undefined) {
      if (body.planId !== null && (typeof body.planId !== "string" || !getPlan(body.planId))) {
        return fail(400, "计划不存在");
      }
      planId = body.planId;
    } else if (body.focusConceptId) {
      // 从档案/首页直接练某个概念时，自动沿用最近一次学习它的计划
      planId = latestPlanForConcept(body.focusConceptId);
    }
    let planItemId: string | null | undefined = undefined;
    if (body.planItemId !== undefined) {
      if (body.planItemId !== null) {
        if (typeof body.planItemId !== "string" || !planId) {
          return fail(400, "绑定计划步骤时必须提供计划");
        }
        const plan = getPlan(planId);
        if (!plan || !plan.items.some((item) => item.id === body.planItemId)) {
          return fail(400, "计划步骤不存在或不属于该计划");
        }
      }
      planItemId = body.planItemId;
    }
    // 复习是"一段连续动作"：同一条复习建议已经有未作答的会话时，回到那一条，
    // 而不是每点一次「练一练」就新开一个同名会话。
    if (body.mode === "review" && body.reviewItemId) {
      const existing = findOpenReviewSession(body.reviewItemId);
      if (existing) {
        if (planId) setSessionPlan(existing.id, planId);
        const session = getSession(existing.id);
        if (session) return ok({ session, reused: true });
      }
    }

    const session = createSession({
      title: body.title?.slice(0, 80) || (body.mode === "review" ? "复习" : "新的学习"),
      mode: body.mode ?? "free",
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
