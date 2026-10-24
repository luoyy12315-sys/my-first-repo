import { 
  getExercisePublic,
  getLatestSummary,
  getPlan,
  getSession,
  listBlocks,
  listMessages,
  deleteSession,
  getAiModel,
  setSessionModel,
  setSessionPlan,
  setSessionPlanItem,
  touchSession,
} from "@/lib/db/repo";
import { getDb } from "@/lib/db";
import { ApiError, fail, handleError, ok, readJson } from "@/lib/api/helpers";
import { serializeBlock } from "@/lib/api/serialize";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const session = getSession(id);
    if (!session) return fail(404, "会话不存在");
    const messages = listMessages(id);
    const blocks = listBlocks(id).map(serializeBlock);
    const summary = getLatestSummary(id);
    const exercises = blocks
      .filter((b) => b.kind === "exercise" && b.exercise)
      .map((b) => b.exercise)
      .filter(Boolean);
    return ok({ session, messages, blocks, summary, exercises });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const session = getSession(id);
    if (!session) return fail(404, "会话不存在");
    const body = await readJson<{
      title?: string;
      modelId?: string | null;
      planId?: string | null;
      planItemId?: string | null;
      /** 无限学习会话被用户明确整理进目标计划 */
      archive?: boolean;
    }>(req);
    if (typeof body.title === "string" && body.title.trim()) {
      touchSession(id, { title: body.title.trim().slice(0, 80) });
    }

    const wantsPlanChange = body.planId !== undefined || body.planItemId !== undefined;
    if (wantsPlanChange && session.mode === "infinite") {
      if (!body.archive) {
        return fail(400, "无限学习不会自动归入计划；如要整理，请明确选择计划与课程");
      }
      if (!body.planId || !body.planItemId) {
        return fail(400, "整理到目标学习时必须同时选择计划与课程");
      }
    }

    // 归属计划：null 表示移出计划（未归类）
    if (body.planId !== undefined) {
      if (body.planId !== null && (typeof body.planId !== "string" || !getPlan(body.planId))) {
        return fail(400, "计划不存在");
      }
      if (body.planId) {
        const plan = getPlan(body.planId);
        if (plan?.status === "draft") return fail(400, "计划尚未确认");
      }
      setSessionPlan(id, body.planId);
      if (body.planId && body.archive) {
        getDb().prepare("update sessions set mode = 'goal', updated_at = ? where id = ?").run(Date.now(), id);
      }
    }
    // 绑定课程：必须属于当前（或本次切换后的）计划
    if (body.planItemId !== undefined) {
      const targetPlanId = body.planId !== undefined ? body.planId : session.planId;
      if (body.planItemId !== null) {
        if (typeof body.planItemId !== "string" || !targetPlanId) {
          return fail(400, "绑定课程时必须提供计划");
        }
        const plan = getPlan(targetPlanId);
        if (!plan || !plan.items.some((item) => item.id === body.planItemId)) {
          return fail(400, "课程不存在或不属于该计划");
        }
      }
      setSessionPlanItem(id, body.planItemId);
    } else if (body.planId !== undefined) {
      // 只改计划归属时，旧课程绑定立即失效，避免指向别的计划的课程
      setSessionPlanItem(id, null);
    }
    // 切换本会话使用的模型：null 表示回到"跟随默认模型"
    if (body.modelId !== undefined) {
      if (body.modelId === null) {
        setSessionModel(id, null);
      } else {
        if (typeof body.modelId !== "string" || !getAiModel(body.modelId)) {
          return fail(400, "模型配置不存在");
        }
        setSessionModel(id, body.modelId);
      }
    }
    return ok({ session: getSession(id) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!getSession(id)) return fail(404, "会话不存在");
    const url = new URL(req.url);
    const withEvidence = url.searchParams.get("withEvidence") === "1";
    deleteSession(id, { withEvidence });
    return ok({ deleted: true, withEvidence });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // 预留：会话级操作（如重新生成小结）
  try {
    const { id } = await ctx.params;
    const session = getSession(id);
    if (!session) return fail(404, "会话不存在");
    const body = await readJson<{ action?: string; exerciseId?: string }>(req);
    if (body.action === "exercise" && body.exerciseId) {
      const ex = getExercisePublic(body.exerciseId);
      if (!ex) throw new ApiError(404, "练习不存在");
      return ok({ exercise: ex });
    }
    return fail(400, "未知操作");
  } catch (e) {
    return handleError(e);
  }
}
