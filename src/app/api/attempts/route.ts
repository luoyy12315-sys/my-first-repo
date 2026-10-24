import { aiStatusForSession, resolveAiConfigForSession } from "@/lib/ai/config";
import { completeJson } from "@/lib/ai/provider";
import { OPEN_GRADING_PROMPT } from "@/lib/ai/prompt";
import { describeAnswer, describeReveal, gradeAnswer, type AnswerSpec } from "@/lib/learning/exercise";
import {
  addAttempt,
  completeReviewForSession,
  getConcept,
  getExercise,
  getExerciseFlags,
  hasRevealedAnswer,
  recordAttemptEvidence,
  resetExerciseFlags,
  syncPlanItemCompletion,
} from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  exerciseId: z.string().min(1),
  answer: z.unknown(),
  usedHint: z.boolean().optional().default(false),
  viewedSolution: z.boolean().optional().default(false),
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
  idempotencyKey: z.string().min(6).max(80).optional(),
});

const aiGradeSchema = z.object({
  score: z.number().min(0).max(1),
  correct: z.boolean(),
  feedback: z.string().min(1).max(1200),
  hit: z.array(z.string()).optional(),
  miss: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await readJson(req));
    if (!parsed.success) return fail(400, "提交数据格式不正确");
    const { exerciseId, answer, durationMs, idempotencyKey } = parsed.data;

    const exercise = getExercise(exerciseId);
    if (!exercise) return fail(404, "练习不存在");
    if (exercise.answer && !("kind" in exercise.answer)) {
      return fail(409, "该练习缺少有效的评分规则，已禁用提交（请联系重建练习）");
    }

    // 服务端记录优先：先调过 /solution 或 /hint，就以服务端为准，避免前端自报"我没看过"
    const flags = getExerciseFlags(exerciseId);
    // 答案是否已经下发过（看过解析，或此前已有一次判定过的作答）。
    // 一旦下发，这次作答就不能再算"独立完成"——哪怕中途点过「再做一次」清空了标记。
    const revealedBefore = hasRevealedAnswer(exerciseId);
    const usedHint = parsed.data.usedHint || flags.hintUsed;
    const viewedSolution = parsed.data.viewedSolution || flags.solutionViewed || revealedBefore;

    const spec = exercise.answer as unknown as AnswerSpec;
    const result = gradeAnswer(exercise.type, spec, answer, { usedHint });

    let feedback = result.feedback;
    let correct: boolean | null = result.correct;
    let graded = result.graded;
    let score: number | null = result.score;

    // 开放题：交给模型按评分维度评阅；AI 不可用时如实标记"未评阅"
    if (!result.graded && exercise.type === "open") {
      const status = aiStatusForSession(exercise.sessionId);
      if (status.configured) {
        try {
          const cfg = resolveAiConfigForSession(exercise.sessionId);
          const payload = await completeJson({
            config: { ...cfg, temperature: 0.2 },
            messages: [
              { role: "system", content: OPEN_GRADING_PROMPT },
              {
                role: "user",
                content: `题目：${exercise.prompt}\n\n评分维度：${(exercise.rubric ?? []).join("；") || "准确性、完整性、是否解释原因"}\n\n参考答案要点：${JSON.stringify(spec.kind === "open" ? spec.modelAnswer : "")}\n\n学生作答：${JSON.stringify(answer)}`,
              },
            ],
          });
          const g = aiGradeSchema.parse(payload);
          graded = true;
          correct = g.correct;
          score = g.score;
          feedback = `${g.feedback}${g.miss?.length ? `\n\n待补充：${g.miss.join("；")}` : ""}`;
        } catch (e) {
          console.error("[grade:open]", (e as Error).message);
          feedback = "开放题已保存，但 AI 评阅暂时不可用（模型服务异常）。本次不计入掌握度，稍后可重新提交评阅。";
        }
      } else {
        feedback = "开放题已保存。当前未配置模型服务，无法自动评阅，因此本次不计入掌握度证据。";
      }
    }
    // 其他题型返回 graded=false 只有一个原因：没作答（空提交/认不出的判断），
    // 保留判题器给出的提示，不写成"开放题已保存"。

    const { duplicate, attempt } = addAttempt({
      exerciseId,
      sessionId: exercise.sessionId,
      conceptId: exercise.conceptId,
      userAnswer: answer,
      isCorrect: graded ? (correct as boolean) : null,
      score: graded ? score : null,
      maxScore: 1,
      feedback,
      usedHint,
      viewedSolution,
      durationMs,
      idempotencyKey: idempotencyKey ?? null,
      errorType: graded && !correct ? (result.errorType ?? null) : null,
    });

    let concept = exercise.conceptId ? getConcept(exercise.conceptId) : null;
    // 只有通过二次校验的题目才能写入掌握度证据
    const evidenceEligible = exercise.verification === "passed";
    if (!duplicate && graded && exercise.conceptId && evidenceEligible) {
      recordAttemptEvidence({
        conceptId: exercise.conceptId,
        sessionId: exercise.sessionId,
        exerciseId,
        type: exercise.type,
        correct: Boolean(correct),
        score: score ?? 0,
        usedHint,
        independent: !viewedSolution,
        difficulty: exercise.difficulty,
        attemptId: attempt.id,
        durationMs: durationMs ?? null,
      });
      concept = getConcept(exercise.conceptId);
      // 计划步骤按“不同知识点独立答对”自动推进；达到阈值自动完成
      syncPlanItemCompletion(exercise.sessionId);
      // 结构化复习：独立答对才算完成；看过解析后的"答对"不推动复习
      if (correct && !viewedSolution) completeReviewForSession(exercise.sessionId);
    }

    // 提示/解析标记只对本次作答有效，这次已经按当时的标记计入证据，清掉即可。
    // 注意：这不等于恢复"独立完成"——独立性由 hasRevealedAnswer 从历史推导。
    if (graded && !duplicate) resetExerciseFlags(exerciseId);

    return ok({
      attempt: {
        ...attempt,
        // 只有真正完成判定后才下发标准答案；未评阅的开放题不下发
        correctDisplay: graded ? describeAnswer(spec) : undefined,
        // 选项题在判定后才下发下标，前端据此标出对错；未判定不下发
        reveal: graded ? describeReveal(spec) : undefined,
        explanation: graded ? exercise.explanation : null,
        errorType: graded && !correct ? (result.errorType ?? null) : null,
      },
      graded,
      correct,
      score,
      duplicate,
      concept: concept
        ? {
            id: concept.id,
            name: concept.name,
            status: concept.status,
            pMastery: concept.pMastery,
            evidenceCount: concept.evidenceCount,
            independentCorrect: concept.independentCorrect,
            hintUses: concept.hintUses,
          }
        : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
