import { addExerciseFeedback, getExercise, voidEvidenceByExercise } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";

/**
 * 题目反馈（C2）：
 * - easy / hard：只作为下一题难度依据，不影响已有证据
 * - broken：这道题本身有问题 → 作废它产生的证据，并按剩余证据重算
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const exercise = getExercise(id);
    if (!exercise) return fail(404, "练习不存在");

    const body = await readJson<{ vote?: string; note?: string }>(req);
    const vote = body.vote;
    if (!vote || !["easy", "hard", "broken"].includes(vote)) {
      return fail(400, "vote 只能是 easy / hard / broken");
    }

    addExerciseFeedback({
      exerciseId: id,
      sessionId: exercise.sessionId,
      vote: vote as "easy" | "hard" | "broken",
      note: (body.note ?? "").slice(0, 200) || null,
    });

    let voidedConcepts: string[] = [];
    if (vote === "broken") {
      voidedConcepts = voidEvidenceByExercise(id, "用户标记：这道题本身有问题");
    }

    return ok({ saved: true, vote, voidedConcepts });
  } catch (e) {
    return handleError(e);
  }
}
