import { AiError, aiStatusForSession, resolveAiConfigForSession } from "@/lib/ai/config";
import { completeJson } from "@/lib/ai/provider";
import { exerciseInputSchema } from "@/lib/blocks/schema";
import { buildAnswerSpec } from "@/lib/learning/exercise";
import { verifyExercise } from "@/lib/ai/exercise-verify";
import { addMessage, createBlock, createExercise, getConcept, getExercise } from "@/lib/db/repo";
import { fail, handleError, ok } from "@/lib/api/helpers";
import { EXERCISE_TYPE_LABEL, type ExerciseType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** 换一题时优先换一种表征，而不是同一题型再来一遍 */
const ALT_TYPE: Record<ExerciseType, ExerciseType> = {
  single: "blank",
  multi: "judge",
  blank: "single",
  judge: "multi",
  order: "steps",
  numeric: "single",
  steps: "numeric",
  open: "blank",
};

const ANSWER_RULE =
  "answer 字段写法：single 写选项下标(如 0)；multi 写下标列表(如 0,2)；blank 每个空用 | 分隔可接受写法、空之间用 || 分隔(如 3|三||-2)；judge 写 true/false；order 写正确顺序下标(如 2,0,1)；numeric 写数字；steps 每步用 || 分隔。" +
  "选项/步骤等一律用中文，题干可用 markdown 与 $LaTeX$。";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const exercise = getExercise(id);
    if (!exercise) return fail(404, "练习不存在");
    if (!exercise.conceptId) return fail(409, "这道题没有关联知识点，无法按知识点换题");
    const concept = getConcept(exercise.conceptId);
    if (!concept) return fail(409, "知识点已被删除");

    const status = aiStatusForSession(exercise.sessionId);
    if (!status.configured) return fail(412, "模型服务未配置，暂时无法生成新题");

    const cfg = resolveAiConfigForSession(exercise.sessionId);
    const targetType = ALT_TYPE[exercise.type] ?? "single";
    const payload = await completeJson({
      config: { ...cfg, temperature: 0.7, maxTokens: 1200 },
      messages: [
        {
          role: "system",
          content:
            "你是出题人。只输出一个 JSON 对象，不要任何解释或代码块标记。" +
            "题干必须自洽、答案唯一可判定；不要照抄原题；不要超纲。" +
            ANSWER_RULE,
        },
        {
          role: "user",
          content: `知识点：${concept.name}${concept.definition ? `（${concept.definition}）` : ""}
题型：${targetType}（${EXERCISE_TYPE_LABEL[targetType]}）
难度：${exercise.difficulty}/5
原题（不要重复）：${exercise.prompt.slice(0, 400)}

请输出 JSON：{"type":"${targetType}","prompt":"...","options":["..."],"steps":["..."],"answer":"...","hint":"...","explanation":"...","difficulty":${exercise.difficulty}}`,
        },
      ],
    });

    const parsed = exerciseInputSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(502, "生成的题目结构不合法，已放弃（不会伪造一道可用题）", {
        issues: parsed.error.issues.slice(0, 3).map((i) => i.message),
      });
    }
    if (parsed.data.type !== targetType) {
      // 模型擅自换题型也可以接受，但要求仍是合法题型
    }
    let spec;
    try {
      spec = buildAnswerSpec(parsed.data);
    } catch (e) {
      return fail(502, `生成的答案无法解析：${(e as Error).message}`);
    }

    const verification = await verifyExercise(parsed.data, spec.spec, exercise.sessionId);
    if (verification.status === "failed") {
      return fail(502, `生成的题目未通过二次校验：${verification.note ?? "答案键不可信"}`, {
        problems: verification.problems,
      });
    }

    // 先建块再建题，并用 blockId 关联：否则下发时找不到对应的公开题目
    const block = createBlock({
      sessionId: exercise.sessionId,
      kind: "exercise",
      title: parsed.data.prompt.slice(0, 40),
      payload: { hint: parsed.data.hint ?? null, type: parsed.data.type, retryOf: exercise.id },
    });
    const newExercise = createExercise({
      sessionId: exercise.sessionId,
      blockId: block.id,
      conceptId: exercise.conceptId,
      type: parsed.data.type,
      prompt: parsed.data.prompt,
      options: parsed.data.options ?? [],
      answer: spec.spec,
      rubric: parsed.data.rubric ?? null,
      explanation: parsed.data.explanation ?? null,
      difficulty: parsed.data.difficulty ?? exercise.difficulty,
      verification: verification.status,
      verificationNote: verification.note,
    });

    addMessage({
      sessionId: exercise.sessionId,
      role: "assistant",
      content: `换一题：仍然考「${concept.name}」，这次换成${EXERCISE_TYPE_LABEL[parsed.data.type]}。`,
      parts: [{ type: "block", blockId: block.id, kind: "exercise" }],
    });

    return ok({
      blockId: block.id,
      exerciseId: newExercise.id,
      sessionId: exercise.sessionId,
      type: parsed.data.type,
    });
  } catch (e) {
    if (e instanceof AiError) return fail(502, `生成新题失败：${e.message}`);
    return handleError(e);
  }
}
