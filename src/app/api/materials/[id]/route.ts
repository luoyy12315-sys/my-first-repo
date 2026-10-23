import fs from "node:fs";
import { getDb } from "@/lib/db";
import { getPlan, setMaterialPlan } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = getDb().prepare("select id from materials where id = ?").get(id) as { id: string } | undefined;
    if (!row) return fail(404, "材料不存在");
    const body = await readJson<{ planId?: string | null }>(req);
    if (body.planId === undefined) return fail(400, "缺少 planId");
    if (body.planId !== null && (typeof body.planId !== "string" || !getPlan(body.planId))) {
      return fail(400, "计划不存在");
    }
    setMaterialPlan(id, body.planId);
    return ok({ planId: body.planId });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const row = db.prepare("select path from materials where id = ?").get(id) as
      | { path: string | null }
      | undefined;
    if (!row) return fail(404, "材料不存在");
    db.prepare("delete from materials where id = ?").run(id);
    if (row.path) {
      try {
        fs.unlinkSync(row.path);
      } catch {
        /* 文件可能已被移动，忽略 */
      }
    }
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
