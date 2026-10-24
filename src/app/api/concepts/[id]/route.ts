import {
  conceptErrorProfile,
  countPlanItemsForConcept,
  deleteConcept,
  getConcept,
  getConceptHistory,
  listConceptEvidence,
  listConcepts,
  listTopics,
  updateConceptStatusManually,
} from "@/lib/db/repo";
import { STATUS_ORDER, type ConceptStatus } from "@/lib/types";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const concept = getConcept(id);
    if (!concept) return fail(404, "知识点不存在");
    return ok({
      concept,
      history: getConceptHistory(id),
      evidence: listConceptEvidence(id),
      errorProfile: conceptErrorProfile(id),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!getConcept(id)) return fail(404, "知识点不存在");
    const body = await readJson<{ status?: string }>(req);
    if (!body.status || !STATUS_ORDER.includes(body.status as ConceptStatus)) {
      return fail(400, "状态值不合法");
    }
    const updated = updateConceptStatusManually(id, body.status as ConceptStatus);
    return ok({ concept: updated });
  } catch (e) {
    return handleError(e);
  }
}

/** 删除知识点：连同其证据、掌握度记录、复习条目一起删除（不可恢复） */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!getConcept(id)) return fail(404, "知识点不存在");
    const refs = countPlanItemsForConcept(id);
    if (refs > 0) {
      return fail(
        409,
        `该知识点仍属于 ${refs} 个计划步骤，请先在计划里移除（在课程里移除会一并删除该知识点）`,
      );
    }
    deleteConcept(id);
    return ok({ deleted: true, concepts: listConcepts({ limit: 500 }), topics: listTopics() });
  } catch (e) {
    return handleError(e);
  }
}
