import { getExercise, getExerciseFlags, resetExerciseFlags } from "@/lib/db/repo";
import { fail, handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";

/**
 * 「再做一次」：清空这道题的提示/解析标记。
 * 不删历史作答——旧记录已经是事实，改的是"下一次作答"的判定环境。
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const exercise = getExercise(id);
    if (!exercise) return fail(404, "练习不存在");
    resetExerciseFlags(id);
    return ok({ reset: true, flags: getExerciseFlags(id) });
  } catch (e) {
    return handleError(e);
  }
}
