import { getExercise, markSolutionViewed } from "@/lib/db/repo";
import { describeAnswer, describeReveal, type AnswerSpec } from "@/lib/learning/exercise";
import { fail, handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";

/**
 * 主动查看解析。
 * 这是一次显式的"放弃独立作答"动作：前端确认后才会调用，
 * 调用结果会让本次作答被标记为非独立完成（不计入掌握度）。
 * 注意：仅在用户明确请求后返回答案，且不创建作答记录。
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const exercise = getExercise(id);
    if (!exercise) return fail(404, "练习不存在");
    const spec = exercise.answer as unknown as AnswerSpec;
    if (!spec || !("kind" in spec)) return fail(409, "该练习缺少评分规则，无法给出解析");
    // 在服务端留痕：提交时以此为准，前端无法用 viewedSolution:false 绕过
    markSolutionViewed(id);
    return ok({
      correctDisplay: describeAnswer(spec),
      reveal: describeReveal(spec),
      explanation: exercise.explanation,
      rubric: exercise.rubric,
      notice: "已查看解析：本次作答将标记为非独立完成，不计入掌握度。",
    });
  } catch (e) {
    return handleError(e);
  }
}
