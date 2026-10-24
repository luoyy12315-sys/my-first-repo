import { getExercise, getExercisePublic, listAttemptsByExercise } from "@/lib/db/repo";
import { describeAnswer, describeReveal, type AnswerSpec } from "@/lib/learning/exercise";
import { fail, handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const ex = getExercise(id);
    if (!ex) return fail(404, "练习不存在");
    const exercise = getExercisePublic(id);
    const attempts = listAttemptsByExercise(id);
    // 只有「已经判定过」的作答才下发标准答案与解析。
    // 未判定的作答（开放题待评阅、空提交）不算"答过"——否则刷新一下就能拿到答案再看题。
    const revealed = attempts.some((a) => a.isCorrect !== null);
    let correctDisplay: string | null = null;
    let reveal: ReturnType<typeof describeReveal> = null;
    if (revealed) {
      try {
        const spec = ex.answer as unknown as AnswerSpec;
        correctDisplay = describeAnswer(spec);
        reveal = describeReveal(spec);
      } catch {
        correctDisplay = null;
        reveal = null;
      }
    }
    return ok({
      exercise,
      attempts: attempts.map((a) => ({
        ...a,
        exerciseId: id,
        correctDisplay,
        reveal,
        explanation: revealed ? ex.explanation : null,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
