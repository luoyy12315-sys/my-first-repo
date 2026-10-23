import { z } from "zod";
import {
  addAttempt,
  completeReviewForSession,
  getBlock,
  getExercise,
  getExerciseFlags,
  listExercisesByBlockId,
  recordAttemptEvidence,
  resetExerciseFlags,
  syncPlanItemCompletion,
} from "@/lib/db/repo";
import {
  describeAnswer,
  gradeAnswer,
  type AnswerSpec,
} from "@/lib/learning/exercise";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  answers: z
    .array(z.object({ exerciseId: z.string().min(1), answer: z.unknown() }))
    .min(1)
    .max(10),
  idempotencyKey: z.string().min(6).max(80).optional(),
});

/** 一套小测统一提交：逐题判分、逐题写证据，并返回 x/n 总评。 */
export async function POST(req: Request, ctx: { params: Promise<{ blockId: string }> }) {
  try {
    const { blockId } = await ctx.params;
    const block = getBlock(blockId);
    if (!block || block.kind !== "quiz") return fail(404, "小测不存在");
    const publicExercises = listExercisesByBlockId(blockId);
    if (!publicExercises.length) return fail(404, "小测没有题目");
    const exercises = publicExercises
      .map((e) => getExercise(e.id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e));
    if (!exercises.length) return fail(404, "小测题目不存在");

    const parsed = bodySchema.safeParse(await readJson(req));
    if (!parsed.success) return fail(400, "提交数据格式不正确");
    const answerMap = new Map(parsed.data.answers.map((a) => [a.exerciseId, a.answer]));
    const sessionId = exercises[0].sessionId;

    const results: Record<string, unknown>[] = [];
    let evidenceCount = 0;

    for (let i = 0; i < exercises.length; i++) {
      const exercise = exercises[i];
      if (!answerMap.has(exercise.id) || answerMap.get(exercise.id) == null) {
        return fail(400, `第 ${i + 1} 题还没有作答`);
      }
      const spec = exercise.answer as unknown as AnswerSpec;
      if (!spec || !("kind" in spec)) {
        return fail(409, `第 ${i + 1} 题缺少有效评分规则`);
      }

      const answer = answerMap.get(exercise.id);
      const flags = getExerciseFlags(exercise.id);
      const usedHint = flags.hintUsed;
      const viewedSolution = flags.solutionViewed;
      const result = gradeAnswer(exercise.type, spec, answer, { usedHint });
      if (!result.graded) {
        return fail(400, "多题小测暂不支持未评阅的开放题");
      }

      const key = parsed.data.idempotencyKey
        ? `${parsed.data.idempotencyKey}:${exercise.id}`
        : null;
      const { duplicate, attempt } = addAttempt({
        exerciseId: exercise.id,
        sessionId: exercise.sessionId,
        conceptId: exercise.conceptId,
        userAnswer: answer,
        isCorrect: result.correct,
        score: result.score,
        maxScore: 1,
        feedback: result.feedback,
        usedHint,
        viewedSolution,
        durationMs: null,
        idempotencyKey: key,
        errorType: result.correct ? null : (result.errorType ?? null),
      });

      const evidenceCounted = exercise.verification === "passed" && Boolean(exercise.conceptId);
      if (!duplicate && evidenceCounted && exercise.conceptId) {
        recordAttemptEvidence({
          conceptId: exercise.conceptId,
          sessionId: exercise.sessionId,
          exerciseId: exercise.id,
          type: exercise.type,
          correct: result.correct,
          score: result.score,
          usedHint,
          independent: !viewedSolution,
          difficulty: exercise.difficulty,
          attemptId: attempt.id,
          durationMs: null,
        });
      }
      if (!duplicate) resetExerciseFlags(exercise.id);
      if (evidenceCounted) evidenceCount += 1;

      results.push({
        ...attempt,
        exerciseId: exercise.id,
        correctDisplay: describeAnswer(spec),
        explanation: exercise.explanation,
        errorType: result.correct ? null : (result.errorType ?? null),
        verification: exercise.verification,
        verificationNote: exercise.verificationNote,
        evidenceCounted,
      });
    }

    syncPlanItemCompletion(sessionId);
    const allCorrect = results.every((r) => r.isCorrect === true);
    const allEvidence = results.every((r) => r.evidenceCounted === true);
    if (allCorrect && allEvidence) completeReviewForSession(sessionId);

    const graded = results as { isCorrect: boolean | null; score: number | null }[];
    const correctCount = graded.filter((r) => r.isCorrect === true).length;
    const score = graded.length
      ? graded.reduce((sum, r) => sum + (r.score ?? 0), 0) / graded.length
      : 0;

    return ok({
      summary: {
        total: exercises.length,
        gradedCount: results.length,
        correctCount,
        score,
        allCorrect,
        evidenceCount,
      },
      results,
    });
  } catch (e) {
    return handleError(e);
  }
}
