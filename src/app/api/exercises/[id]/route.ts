import { getExercise, getExercisePublic, listAttemptsByExercise } from "@/lib/db/repo";
import { describeAnswer, type AnswerSpec } from "@/lib/learning/exercise";
import { fail, handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const ex = getExercise(id);
    if (!ex) return fail(404, "练习不存在");
    const exercise = getExercisePublic(id);
    const attempts = listAttemptsByExercise(id);
    // 作答过的题，刷新/进工作区后仍要能看到正确答案与解析；没作答时绝不下发。
    let correctDisplay: string | null = null;
    if (attempts.length) {
      try {
        correctDisplay = describeAnswer(ex.answer as unknown as AnswerSpec);
      } catch {
        correctDisplay = null;
      }
    }
    return ok({
      exercise,
      attempts: attempts.map((a) => ({
        ...a,
        exerciseId: id,
        correctDisplay,
        explanation: attempts.length ? ex.explanation : null,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
