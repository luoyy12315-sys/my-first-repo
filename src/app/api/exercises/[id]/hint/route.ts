import { AiError, aiStatusForSession, resolveAiConfigForSession } from "@/lib/ai/config";
import { streamChat } from "@/lib/ai/provider";
import { getBlock, getExercise, markHintUsed, updateBlockPayload } from "@/lib/db/repo";
import { fail, handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";

/** 渐进提示：优先使用模型生成练习时自带的 hint，其次现场生成（不会给出答案） */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const exercise = getExercise(id);
    if (!exercise) return fail(404, "练习不存在");

    const block = exercise.blockId ? getBlock(exercise.blockId) : null;
    const payload = (block?.payload ?? {}) as { hint?: string };
    if (payload.hint) {
      markHintUsed(id);
      return ok({ hint: payload.hint, source: "generated" });
    }

    const status = aiStatusForSession(exercise.sessionId);
    if (!status.configured) {
      return ok({
        hint: null,
        source: "none",
        message: "未配置模型服务，无法生成提示。可以查看解析，但这次作答将不计入掌握度。",
      });
    }

    const cfg = resolveAiConfigForSession(exercise.sessionId);
    const res = await streamChat({
      config: { ...cfg, temperature: 0.4, maxTokens: 300 },
      messages: [
        {
          role: "system",
          content:
            "你是导师，正在给一道正在作答的题写提示。只给一个不暴露答案的推进提示：指出该关注哪个条件、该用哪个概念、或该先做哪一步。不要写出最终答案，不要超过 60 字。",
        },
        { role: "user", content: `题目（${exercise.type}）：${exercise.prompt}` },
      ],
    });
    const hint = res.text.trim().slice(0, 300);
    if (!hint) return ok({ hint: null, source: "none", message: "提示生成失败，可直接查看解析。" });
    if (block) updateBlockPayload(block.id, { ...(block.payload as object), hint });
    markHintUsed(id);
    return ok({ hint, source: "ai" });
  } catch (e) {
    if (e instanceof AiError) return fail(502, "提示生成失败：" + e.message);
    return handleError(e);
  }
}
