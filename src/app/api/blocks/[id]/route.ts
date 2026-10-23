import { getBlock, updateBlockState } from "@/lib/db/repo";
import { serializeBlock } from "@/lib/api/serialize";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const block = getBlock(id);
    if (!block) return fail(404, "教学组件不存在");
    return ok({ block: serializeBlock(block) });
  } catch (e) {
    return handleError(e);
  }
}

const stateSchema = z.record(z.string(), z.unknown());

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const block = getBlock(id);
    if (!block) return fail(404, "教学组件不存在");
    const body = await readJson<{ state?: unknown }>(req);
    const parsed = stateSchema.safeParse(body.state);
    if (!parsed.success) return fail(400, "state 必须是对象");
    const raw = JSON.stringify(parsed.data);
    if (raw.length > 40000) return fail(413, "组件状态过大");
    // 只保存 UI/组件进度；不会写入学习证据
    updateBlockState(id, parsed.data);
    return ok({ saved: true, state: parsed.data });
  } catch (e) {
    return handleError(e);
  }
}
