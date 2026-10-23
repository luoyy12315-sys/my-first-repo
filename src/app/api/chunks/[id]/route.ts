import { getMaterialChunk } from "@/lib/db/repo";
import { fail, handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";

/** 来源卡片跳转：按 chunk id 取回片段所属材料与页码，供 /materials 定位 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = getMaterialChunk(id);
    if (!row) return fail(404, "材料片段不存在（材料可能已被删除）");
    return ok({
      chunk: {
        id: row.id,
        materialId: row.material_id,
        material: row.material,
        page: row.page,
        heading: row.heading,
        text: row.text.slice(0, 2000),
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
