import { getBlock, getSession } from "@/lib/db/repo";
import { serializeBlock } from "@/lib/api/serialize";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";
import { streamChat } from "@/lib/ai/provider";
import { aiStatusForSession, resolveAiConfigForSession } from "@/lib/ai/config";
import { addMessage, logUsage, saveMessageSources, touchSession, updateMessage } from "@/lib/db/repo";
import { buildTeachingMessages, findMaterialSources } from "@/lib/ai/prompt";
import { parseCitations } from "@/lib/ai/citations";
import { TEACHING_TOOLS, executeTool } from "@/lib/ai/tools";
import { stripBlockPlaceholders, stripInlineMarkdown } from "@/lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_req: Request, ctx: { params: Promise<{ blockId: string }> }) {
  try {
    const { blockId } = await ctx.params;
    const block = getBlock(blockId);
    if (!block) return fail(404, "教学组件不存在");
    return ok({ block: serializeBlock(block) });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * 在工作区里向 AI 提问：以该组件为上下文，回复写入同一会话。
 * 这里是一次性生成（非流式）：完成后回到会话查看回复。
 */
export async function POST(req: Request, ctx: { params: Promise<{ blockId: string }> }) {
  try {
    const { blockId } = await ctx.params;
    const block = getBlock(blockId);
    if (!block) return fail(404, "教学组件不存在");
    const session = getSession(block.sessionId);
    if (!session) return fail(404, "会话不存在");
    const body = await readJson<{ text?: string }>(req);
    const text = (body.text ?? "").trim();
    if (!text) return fail(400, "问题不能为空");
    if (!aiStatusForSession(session.id).configured) return fail(412, "模型服务未配置");

    const cfg = resolveAiConfigForSession(session.id);
    const startedAt = Date.now();
    const userMessage = addMessage({
      sessionId: block.sessionId,
      role: "user",
      content: `【工作区 · ${stripInlineMarkdown(block.title ?? block.kind)}】${text}`,
    });
    const assistant = addMessage({
      sessionId: block.sessionId,
      role: "assistant",
      content: "",
      status: "streaming",
      model: cfg.model,
    });

    // 与本轮问题相关的材料来源：编号只算一次，注入与落库保持一致
    const materialSources = findMaterialSources(text, 3, session.planId ?? null);
    const messages = buildTeachingMessages({
      sessionId: block.sessionId,
      userText: `（当前正在查看教学组件「${block.title ?? block.kind}」，类型 ${block.kind}。组件内容摘要：${JSON.stringify(block.payload).slice(0, 1200)}）\n\n学生提问：${text}`,
      excludeMessageId: userMessage.id,
      materialSources,
    });

    const result = await streamChat({
      config: cfg,
      messages,
      tools: TEACHING_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      })),
    });

    // 引用校验：只认本轮注入的来源，伪造引用剥离
    const citations = parseCitations(result.text, materialSources);
    const cleanText = stripBlockPlaceholders(citations.cleanText);

    const parts: { type: "text" | "block" | "notice"; text?: string; blockId?: string; kind?: string; notice?: string }[] = [];
    if (cleanText.trim()) parts.push({ type: "text", text: cleanText });
    for (const call of result.toolCalls.slice(0, 3)) {
      const outcome = await executeTool(call.name, call.arguments, {
        sessionId: block.sessionId,
        messageId: assistant.id,
      });
      for (const b of outcome.blocks) parts.push({ type: "block", blockId: b.id, kind: b.kind });
      if (outcome.notice) parts.push({ type: "notice", notice: outcome.notice });
    }
    if (citations.invalidCount > 0) {
      parts.push({ type: "notice", notice: "模型引用了不存在的来源，已移除。" });
    }
    if (materialSources.length && citations.used.length === 0 && cleanText.trim()) {
      parts.push({ type: "notice", notice: "本次回答未标注来源，以下内容请自行核对。" });
    }
    if (citations.used.length) saveMessageSources(assistant.id, citations.used);
    if (result.finishReason === "length" || result.finishReason === "max_tokens") {
      parts.push({ type: "notice", notice: "这次回答达到了模型输出上限，可能没有讲完。" });
    }
    updateMessage(assistant.id, { content: cleanText, parts: parts as never, status: "done" });
    touchSession(block.sessionId);
    logUsage({
      sessionId: block.sessionId,
      model: cfg.model,
      promptTokens: result.usage?.promptTokens,
      completionTokens: result.usage?.completionTokens,
      latencyMs: Date.now() - startedAt,
      ok: true,
    });
    return ok({ messageId: assistant.id, userMessageId: userMessage.id, sessionId: block.sessionId });
  } catch (e) {
    return handleError(e);
  }
}