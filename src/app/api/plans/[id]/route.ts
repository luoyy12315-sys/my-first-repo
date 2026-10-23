import {
  deletePlan,
  getConcept,
  getPlan,
  listPlans,
  setPlanItemConcept,
  updatePlanItem,
} from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";

const STATUSES = ["pending", "in_progress", "done", "skipped"] as const;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const plan = getPlan(id);
    if (!plan) return fail(404, "计划不存在");
    return ok({ plan });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<{ itemId?: string; status?: string; conceptId?: string | null }>(req);
    if (!body.itemId) return fail(400, "缺少 itemId");
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) return fail(400, "状态不合法");
      updatePlanItem(body.itemId, body.status as (typeof STATUSES)[number]);
    }
    if (body.conceptId !== undefined) {
      if (body.conceptId !== null && (typeof body.conceptId !== "string" || !getConcept(body.conceptId))) {
        return fail(400, "知识点不存在");
      }
      if (!setPlanItemConcept(body.itemId, body.conceptId)) return fail(404, "计划步骤不存在");
    }
    if (body.status === undefined && body.conceptId === undefined) {
      return fail(400, "缺少要更新的字段");
    }
    return ok({ plan: getPlan(id) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!getPlan(id)) return fail(404, "计划不存在");
    deletePlan(id);
    return ok({ deleted: true, plans: listPlans() });
  } catch (e) {
    return handleError(e);
  }
}
