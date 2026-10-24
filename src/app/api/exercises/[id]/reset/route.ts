import {
  getExercise,
  getExerciseFlags,
  hasRevealedAnswer,
  listAttemptsByExercise,
  resetExerciseFlags,
} from "@/lib/db/repo";
import { fail, handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";

/**
 * 「再做一次」：清空这道题的提示/解析标记。
 * 不删历史作答——旧记录已经是事实，改的是"下一次作答"的判定环境。
 *
 * 只允许在**已经提交过**之后调用：
 * 否则"用了提示 → 点再做一次 → 再提交"能把提示痕迹洗掉，证据会被污染。
 * 另外清标记不等于恢复独立完成：答案下发过之后，独立性由服务端历史判定。
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const exercise = getExercise(id);
    if (!exercise) return fail(404, "练习不存在");
    if (!listAttemptsByExercise(id).length) {
      return fail(409, "还没有提交过这道题，不能「再做一次」。请先提交，再看解析或重做。");
    }
    resetExerciseFlags(id);
    const flags = getExerciseFlags(id);
    return ok({
      reset: true,
      flags,
      // 已经下发过的答案不会因为「再做一次」而消失：这次重做仍然不记为独立完成
      independent: !hasRevealedAnswer(id),
    });
  } catch (e) {
    return handleError(e);
  }
}
