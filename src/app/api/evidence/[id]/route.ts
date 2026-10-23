import { getDb } from "@/lib/db";
import { voidEvidence } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";

/**
 * 作废一条证据（软删除）。
 * 保留审计记录，但它不再参与掌握度与复习调度；随后按剩余证据重算。
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<{ reason?: string }>(req);
    const exists = getDb().prepare("select id from evidence where id = ?").get(id);
    if (!exists) return fail(404, "证据不存在");
    const reason = (body.reason ?? "").trim() || "用户判定这条作答不算";
    const res = voidEvidence(id, reason);
    if (!res) return fail(404, "证据不存在");
    return ok({ voided: true, conceptId: res.conceptId, reason });
  } catch (e) {
    return handleError(e);
  }
}
