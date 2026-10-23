import { AI_ERROR_HINT, AiError, aiStatus, resolveAiConfig } from "@/lib/ai/config";
import { streamChat, type LlmMessage } from "@/lib/ai/provider";
import { buildTeachingMessages, fallbackTitle, findMaterialSources } from "@/lib/ai/prompt";
import { parseCitations } from "@/lib/ai/citations";
import { isProviderConfigured, resolveWebConfig } from "@/lib/web/config";
import { GATE_NOTICE, shouldSearch } from "@/lib/web/gate";
import { retrieveWeb } from "@/lib/web/retrieve";
import { countSessionSearches } from "@/lib/web/cache";
import { TEACHING_TOOLS, executeTool } from "@/lib/ai/tools";
import {
  addMessage,
  createSession,
  getAiModel,
  getSession,
  logUsage,
  saveMessageSources,
  setSessionModel,
  touchSession,
  updateMessage,
} from "@/lib/db/repo";
import { serializeBlock } from "@/lib/api/serialize";
import { fail, handleError, readJson } from "@/lib/api/helpers";
import { stripBlockPlaceholders } from "@/lib/text";
import type { MessagePart, SourceDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ChatBody {
  sessionId?: string;
  text?: string;
  mode?: "free" | "goal" | "review";
  availableMinutes?: number | null;
  goal?: string | null;
  /** 本轮使用的模型配置；不传则沿用会话绑定，再否则用默认模型 */
  modelId?: string | null;
  /** 联网检索模式；不传则用设置里的默认模式（默认 off） */
  webMode?: "off" | "manual";
}

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = await readJson<ChatBody>(req);
  } catch (e) {
    return handleError(e);
  }
  const text = (body.text ?? "").trim();
  if (!text) return fail(400, "消息不能为空");
  if (text.length > 12000) return fail(400, "消息过长，请分段发送");

  const session = body.sessionId ? getSession(body.sessionId) : createSession({ mode: body.mode ?? "free" });
  if (!session) return fail(404, "会话不存在");

  const userMessage = addMessage({ sessionId: session.id, role: "user", content: text });
  const assistantMessage = addMessage({
    sessionId: session.id,
    role: "assistant",
    content: "",
    status: "streaming",
  });

  const encoder = new TextEncoder();
  // 模型选择优先级：本轮显式指定 > 会话已绑定 > 默认模型
  // 显式指定会写回会话，这样刷新页面后仍然是同一模型，不会"换着换着悄悄变了"
  let modelId: string | null = body.modelId ?? session.modelId ?? null;
  if (modelId && !getAiModel(modelId)) modelId = null;
  if (body.modelId && modelId && modelId !== session.modelId) {
    setSessionModel(session.id, modelId);
  }
  const config = resolveAiConfig(modelId);
  const status = aiStatus(modelId);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send({
        type: "meta",
        session,
        userMessage,
        messageId: assistantMessage.id,
        ai: status,
      });

      // 未配置模型：如实告知，不生成任何"教学内容"
      if (!status.configured) {
        const note = `还没有配置模型服务，我暂时无法真正教学。\n\n到「设置」页填入以下任一项即可开始：\n\n- OpenAI 兼容端点（DeepSeek / 通义 / Kimi / 智谱 / Ollama 均可）\n- Anthropic\n\n配置完成后刷新本页重试。`;
        updateMessage(assistantMessage.id, {
          content: note,
          status: "error",
          error: "AI_NOT_CONFIGURED",
          parts: [{ type: "notice", notice: "模型服务未配置" }],
        });
        send({ type: "error", code: "AI_NOT_CONFIGURED", message: AI_ERROR_HINT.AI_NOT_CONFIGURED });
        send({ type: "done", messageId: assistantMessage.id, sessionId: session.id });
        closed = true;
        controller.close();
        return;
      }

      const startedAt = Date.now();
      let fullText = "";
      const parts: MessagePart[] = [];
      const notices: string[] = [];

      // ── 来源准备：本地材料 + （手动开启时）网络检索 ──
      const materialSources = findMaterialSources(text, 3, session.planId ?? null);
      const webSources: SourceDTO[] = [];
      let webNotice: string | null = null;

      const webCfg = resolveWebConfig();
      const webMode = body.webMode ?? webCfg.defaultMode;
      const gate = shouldSearch({
        mode: webMode,
        text,
        cfg: webCfg,
        configured: isProviderConfigured(webCfg),
        usedInSession: countSessionSearches(session.id),
      });
      if (gate.reason === "not_configured" || gate.reason === "disabled") {
        webNotice = GATE_NOTICE[gate.reason];
      } else if (gate.reason === "budget_exhausted") {
        webNotice = GATE_NOTICE.budget_exhausted;
      } else if (gate.search) {
        send({ type: "search_status", state: "searching", reason: gate.reason, text: text.slice(0, 40) });
        const retrieval = await retrieveWeb({
          text,
          sessionId: session.id,
          messageId: assistantMessage.id,
          cfg: webCfg,
          signal: req.signal,
        });
        webSources.push(...retrieval.sources);
        if (retrieval.sources.length) {
          send({ type: "search_status", state: "done", count: retrieval.sources.length, cacheHit: retrieval.cacheHit, latencyMs: retrieval.latencyMs });
          send({ type: "sources", sources: retrieval.sources });
        } else {
          send({ type: "search_status", state: "failed", code: retrieval.code, message: retrieval.notice ?? "未找到可靠来源" });
        }
        webNotice = retrieval.notice ?? null;
      }

      if (webNotice) {
        parts.push({ type: "notice", notice: webNotice });
        send({ type: "notice", text: webNotice });
      }

      try {
        const messages: LlmMessage[] = buildTeachingMessages({
          sessionId: session.id,
          userText: text,
          mode: body.mode ?? session.mode,
          availableMinutes: body.availableMinutes ?? null,
          goal: body.goal ?? null,
          excludeMessageId: userMessage.id,
          materialSources,
          webSources,
        });

        const result = await streamChat({
          config,
          messages,
          tools: TEACHING_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters as Record<string, unknown>,
          })),
          signal: req.signal,
          onText: (delta) => {
            fullText += delta;
            send({ type: "delta", text: delta });
          },
        });

        // 模型有时会把历史里的组件占位符复述进正文，落库前清掉
        fullText = stripBlockPlaceholders(fullText);
        // 文本部分可能为空（模型直接调用工具）
        if (fullText.trim()) parts.push({ type: "text", text: fullText });

        // 执行工具调用（顺序执行，保证组件顺序与模型意图一致）
        for (const call of result.toolCalls.slice(0, 5)) {
          send({ type: "tool_status", name: call.name, state: "running" });
          const outcome = await executeTool(call.name, call.arguments, {
            sessionId: session.id,
            messageId: assistantMessage.id,
          });
          for (const block of outcome.blocks) {
            const serialized = serializeBlock(block);
            parts.push({ type: "block", blockId: block.id, kind: block.kind });
            send({ type: "block", block: serialized });
          }
          if (outcome.notice) {
            notices.push(outcome.notice);
            parts.push({ type: "notice", notice: outcome.notice });
            send({ type: "notice", text: outcome.notice });
          }
          if (!outcome.ok && outcome.notice) {
            console.warn("[tool] 失败降级:", call.name, outcome.result.slice(0, 200));
          }
          send({ type: "tool_status", name: call.name, state: "done" });
        }

        if (!fullText.trim() && parts.length === 0) {
          const fallback = "模型这次没有返回可用内容。可以直接重试，或把问题说得更具体一点。";
          fullText = fallback;
          parts.push({ type: "text", text: fallback });
          send({ type: "delta", text: fallback });
        }

        // ── 引用校验：只认本轮注入的来源 id，伪造的一律剥离 ──
        const allSources: SourceDTO[] = [...materialSources, ...webSources];
        const citations = parseCitations(fullText, allSources);
        fullText = citations.cleanText;
        for (const part of parts) {
          if (part.type === "text" && typeof part.text === "string") {
            part.text = parseCitations(part.text, allSources).cleanText;
          }
        }
        if (citations.invalidCount > 0) {
          const note = "模型引用了不存在的来源，已移除。";
          parts.push({ type: "notice", notice: note });
          notices.push(note);
          send({ type: "notice", text: note });
        }
        if (allSources.length && citations.used.length === 0 && fullText.trim()) {
          const note = "本次回答未标注来源，以下内容请自行核对。";
          parts.push({ type: "notice", notice: note });
          notices.push(note);
          send({ type: "notice", text: note });
        }
        if (citations.used.length) {
          saveMessageSources(assistantMessage.id, citations.used);
        }

        // 截断不是正常完成：保留已生成内容，但必须告诉用户"没讲完"。
        if (result.finishReason === "length" || result.finishReason === "max_tokens") {
          const note = "这次回答达到了模型输出上限，可能没有讲完。可以说「继续」让我接着讲。";
          parts.push({ type: "notice", notice: note });
          notices.push(note);
          send({ type: "notice", text: note });
        }

        updateMessage(assistantMessage.id, {
          content: fullText,
          parts,
          status: "done",
          error: null,
          model: config.model,
        });

        // 首次对话自动命名（确定性规则，不额外消耗模型调用）
        if (session.title === "新的学习" && session.messageCount <= 1) {
          touchSession(session.id, { title: fallbackTitle(text) });
        } else {
          touchSession(session.id);
        }

        logUsage({
          sessionId: session.id,
          model: config.model,
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
          latencyMs: Date.now() - startedAt,
          ok: true,
        });

        send({
          type: "done",
          messageId: assistantMessage.id,
          sessionId: session.id,
          session: getSession(session.id),
          usage: result.usage ?? null,
          finishReason: result.finishReason,
          sources: citations.used,
        });
      } catch (e) {
        const err = e instanceof AiError ? e : new AiError("AI_BAD_RESPONSE", (e as Error).message);
        const hint = AI_ERROR_HINT[err.code] ?? "生成失败，请重试。";
        console.error("[chat]", err.code, err.message, err.detail?.slice(0, 200));
        fullText = stripBlockPlaceholders(fullText);
        // 保留已生成的文本，不丢弃
        if (fullText.trim()) parts.push({ type: "text", text: fullText });
        // 生成失败时也保留来源，方便用户看到这一轮查了什么
        if (materialSources.length || webSources.length) {
          saveMessageSources(assistantMessage.id, [...materialSources, ...webSources].slice(0, 5));
        }
        parts.push({ type: "notice", notice: hint });
        updateMessage(assistantMessage.id, {
          content: fullText.trim() ? `${fullText}\n\n> ${hint}` : hint,
          parts,
          status: "error",
          error: err.code,
          model: config.model,
        });
        logUsage({
          sessionId: session.id,
          model: config.model,
          latencyMs: Date.now() - startedAt,
          ok: false,
          error: err.code,
        });
        send({ type: "error", code: err.code, message: hint, detail: err.detail?.slice(0, 300) });
        send({ type: "done", messageId: assistantMessage.id, sessionId: session.id, failed: true });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
