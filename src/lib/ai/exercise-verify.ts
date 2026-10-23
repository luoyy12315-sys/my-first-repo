/**
 * 题目二次校验（出题质量门）
 *
 * 模型自己出题、自己给答案，服务端只能校验格式，不能证明答案键语义正确。
 * 这里在落库前做一次独立审校：
 * - 确定性检查：选项重复/为空等结构问题
 * - 模型审校：答案键、选项唯一性、题干自洽、是否泄题/歧义
 *
 * 结论只分四档：passed / ambiguous / failed / unverified。
 * ambiguous 与 unverified 仍可展示，但不写入掌握度证据。
 */
import { z } from "zod";
import { aiStatusForSession, resolveAiConfigForSession } from "@/lib/ai/config";
import { completeJson } from "@/lib/ai/provider";
import { normalizeText, type ExerciseInput } from "@/lib/blocks/schema";
import { describeAnswer, type AnswerSpec } from "@/lib/learning/exercise";

export type ExerciseVerificationStatus = "passed" | "ambiguous" | "unverified";

export interface ExerciseVerification {
  status: ExerciseVerificationStatus | "failed";
  note: string | null;
  problems: string[];
}

export const EXERCISE_VERIFIER_PROMPT = `你是一名独立的题目审校员。你的唯一任务是检查一道题是否可作为可信练习，不教学、不改题、不替学生作答。

输入是一个 JSON：题型、题干、选项/步骤、标准答案、提示、解析、评分维度。
逐项检查：
1. 答案键是否正确：single 是否只有一个正确项；multi 是否不漏不多；blank/steps 的等价答案是否足够覆盖常见正确写法；numeric 的数值/容差是否合理。
2. 选项/步骤是否互斥、无重复、无空项；排序题是否能形成唯一顺序。
3. 题干是否自洽，是否存在第二种同样合理的答案（歧义）。
4. 题干或提示是否直接泄露答案。
5. 解析是否与答案键一致。
open 题没有唯一答案：只看题干与评分维度是否自洽，不要求唯一答案。

判定：
- fail：答案键错误、存在多个正确答案但按单选处理、选项重复导致无法唯一判断、题干自相矛盾。
- ambiguous：答案可辩护，但题干/选项存在合理歧义，或提示明显泄露答案。
- pass：上述问题都不存在。
只有明确问题时才 fail；不确定时用 ambiguous，不要为了严格而误杀。

只输出 JSON（不要 markdown）：
{"verdict":"pass"|"ambiguous"|"fail","problems":["具体问题，最多 4 条"],"note":"给学生看的简短说明，不超过 60 字"}`;

const verdictSchema = z.object({
  verdict: z.enum(["pass", "ambiguous", "fail"]),
  problems: z.array(z.string().max(200)).max(6).optional(),
  note: z.string().max(200).optional(),
});

/** 把审校模型返回的 JSON 转成内部结论（便于单测与降级处理） */
export function interpretVerdict(payload: unknown): ExerciseVerification {
  const verdict = verdictSchema.parse(payload);
  const problems = verdict.problems ?? [];
  if (verdict.verdict === "pass") {
    return { status: "passed", note: null, problems: [] };
  }
  const note =
    verdict.note?.trim() ||
    problems.join("；") ||
    (verdict.verdict === "ambiguous" ? "题目口径可能有争议" : "答案键未通过校验");
  return {
    status: verdict.verdict === "ambiguous" ? "ambiguous" : "failed",
    note,
    problems,
  };
}

function deterministicProblems(input: ExerciseInput): string[] {
  const problems: string[] = [];
  const options = input.options ?? [];
  if (options.length) {
    const normalized = options.map((o) => normalizeText(o));
    if (new Set(normalized).size !== normalized.length) problems.push("选项/排序项存在重复");
    if (normalized.some((o) => !o)) problems.push("选项/排序项存在空项");
  }
  return problems;
}

export async function verifyExercise(
  input: ExerciseInput,
  spec: AnswerSpec,
  sessionId: string,
): Promise<ExerciseVerification> {
  const structural = deterministicProblems(input);
  if (structural.length) {
    return { status: "failed", note: structural.join("；"), problems: structural };
  }

  const status = aiStatusForSession(sessionId);
  if (!status.configured) {
    return {
      status: "unverified",
      note: "当前没有可用的校验模型，本题不计入掌握度。",
      problems: [],
    };
  }

  try {
    const cfg = resolveAiConfigForSession(sessionId);
    const payload = await completeJson({
      config: { ...cfg, temperature: 0.1, maxTokens: 700 },
      messages: [
        { role: "system", content: EXERCISE_VERIFIER_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            type: input.type,
            prompt: input.prompt,
            options: input.options ?? [],
            steps: input.steps ?? [],
            answer: describeAnswer(spec),
            answerSpec: spec,
            hint: input.hint ?? null,
            explanation: input.explanation ?? null,
            rubric: input.rubric ?? [],
          }),
        },
      ],
    });
    const verdict = interpretVerdict(payload);
    return verdict;
  } catch (e) {
    console.error("[exercise-verify]", (e as Error).message);
    return {
      status: "unverified",
      note: "二次校验暂时不可用，本题不计入掌握度。",
      problems: [],
    };
  }
}