import { AI_ERROR_HINT, AiError, aiStatus, resolveAiConfig } from "@/lib/ai/config";
import { streamChat, type LlmMessage } from "@/lib/ai/provider";
import { buildTeachingMessages, fallbackTitle, findMaterialSources } from "@/lib/ai/prompt";
import { parseCitations } from "@/lib/ai/citations";
import { isWebConfigured, resolveWebConfig } from "@/lib/web/config";
import { GATE_NOTICE, shouldSearch } from "@/lib/web/gate";
import { retrieveWeb } from "@/lib/web/retrieve";
import { countSessionSearches } from "@/lib/web/cache";
import { TEACHING_TOOLS, executeTool } from "@/lib/ai/tools";
import {
  addMessage,
  createSession,
  getAiModel,
  getSession,
  listMessages,
  logUsage,
  recordAiModelTest,
  saveMessageSources,
  setSessionModel,
  touchSession,
  updateMessage,
} from "@/lib/db/repo";
import { serializeBlock } from "@/lib/api/serialize";
import { fail, handleError, readJson } from "@/lib/api/helpers";
import { stripBlockPlaceholders } from "@/lib/text";
import { normalizeAvoid, normalizeRepresentation } from "@/lib/teaching/representation";
import type { LearningMode, MessagePart, SourceDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ChatBody {
  sessionId?: string;
  text?: string;
  mode?: LearningMode;
  availableMinutes?: number | null;
  goal?: string | null;
  /** 本轮使用的模型配置；不传则沿用会话绑定，再否则用默认模型 */
  modelId?: string | null;
  /** 联网检索模式；不传则用设置里的默认模式（默认 off） */
  webMode?: "off" | "manual";
  /** 「换个讲法」的结构化选择 */
  representation?: string;
  avoidRepresentations?: string[];
  /** 失败重试：复用上一条用户消息，不再插入重复提问 */
  reuseUserMessageId?: string;
}

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = await readJson<ChatBody>(req);
  } catch (e) {
    return handleError(e);
  }
  let text = (body.text ?? "").trim();
  if (!text) return fail(400, "消息不能为空");
  if (text.length > 12000) return fail(400, "消息过长，请分段发送");

  const session = body.sessionId ? getSession(body.sessionId) : createSession({ mode: body.mode ?? "infinite" });
  if (!session) return fail(404, "会话不存在");

  let userMessage: ReturnType<typeof addMessage>;
  if (body.reuseUserMessageId) {
    // 重试：复用原来的提问，避免历史里出现两条一模一样的用户消息。
    const previous = listMessages(session.id).find(
      (m) => m.id === body.reuseUserMessageId && m.role === "user",
    );
    if (!previous) return fail(400, "要重试的消息不存在");
    userMessage = previous;
    text = previous.content;
  } else {
    userMessage = addMessage({ sessionId: session.id, role: "user", content: text });
  }
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
      // 跨轮状态放在 try 外：生成失败时 catch 也要能取到已经讲出来的半段
      const roundTexts: string[] = [];
      let currentRaw = "";
      const partialText = () =>
        [...roundTexts, stripBlockPlaceholders(currentRaw)]
          .map((t) => t.trim())
          .filter(Boolean)
          .join("\n\n");

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
        configured: isWebConfigured(webCfg),
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
          mode: session.mode,
          availableMinutes: body.availableMinutes ?? null,
          goal: body.goal ?? null,
          excludeMessageId: userMessage.id,
          materialSources,
          webSources,
          representation: normalizeRepresentation(body.representation),
          avoidRepresentations: normalizeAvoid(body.avoidRepresentations),
        });

        const tools = TEACHING_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
        }));

        // 有界编排：一次回复最多 3 次模型调用（首轮 + 2 次续写），工具总数仍限 5 个。
        // 续写只用于两件事：工具失败后修复、组件之后收尾（否则正文会断在"下面这张表："）。
        const MAX_CONTINUATIONS = 2;
        const MAX_TOOL_CALLS = 5;
        let round = 0;
        let totalToolCalls = 0;
        let emptyRetried = false;
        let activeConfig = config;
        let finishReason: string | null = null;
        let reasoningChars = 0;
        let lastPersist = 0;
        const usageTotal = { promptTokens: 0, completionTokens: 0 };
        let usageSeen = false;

        // 流式期间周期性落库：用户中途停止/断网时，已经讲出来的部分不会丢
        const persistStreaming = (force = false) => {
          const now = Date.now();
          if (!force && now - lastPersist < 1500) return;
          lastPersist = now;
          try {
            const inProgress = stripBlockPlaceholders(currentRaw);
            const snapshotParts: MessagePart[] = inProgress.trim()
              ? [...parts, { type: "text", text: inProgress }]
              : parts;
            updateMessage(assistantMessage.id, {
              content: partialText(),
              parts: snapshotParts,
              status: "streaming",
              model: config.model,
            });
          } catch {
            /* 落库失败不影响本轮输出，结束时还会再写一次 */
          }
        };

        while (true) {
          currentRaw = "";
          let reasoningNotified = false;
          const result = await streamChat({
            config: activeConfig,
            messages,
            tools,
            signal: req.signal,
            onText: (delta) => {
              currentRaw += delta;
              send({ type: "delta", text: delta });
              persistStreaming();
            },
            onReasoning: (delta) => {
              reasoningChars += delta.length;
              if (!reasoningNotified) {
                reasoningNotified = true;
                send({ type: "thinking", state: "start" });
              }
            },
          });
          finishReason = result.finishReason;
          if (result.usage) {
            usageSeen = true;
            usageTotal.promptTokens += result.usage.promptTokens;
            usageTotal.completionTokens += result.usage.completionTokens;
          }

          // 模型有时会把历史里的组件占位符复述进正文，落库前清掉
          const cleaned = stripBlockPlaceholders(currentRaw);
          if (cleaned.trim()) {
            roundTexts.push(cleaned);
            parts.push({ type: "text", text: cleaned });
            // 已归档本轮正文：清空缓冲，避免后续持久化把同一段又拼一遍
            currentRaw = "";
          }
          if (reasoningNotified) send({ type: "thinking", state: "stop" });

          // 推理型模型会把思考算进输出预算：预算用尽且没有正文时，放大预算重试一次
          if (
            !cleaned.trim() &&
            result.toolCalls.length === 0 &&
            !emptyRetried &&
            (result.finishReason === "length" || result.finishReason === "max_tokens")
          ) {
            emptyRetried = true;
            activeConfig = { ...config, maxTokens: Math.min(config.maxTokens * 2, 32000) };
            messages.push({
              role: "system",
              content:
                "上一次输出在推理阶段就用完了预算，没有产生任何正文。这次请直接给出最终答案（需要时再调用工具），不要展开推理过程。",
            });
            console.warn("[chat] 空正文且预算耗尽，放大预算重试:", activeConfig.maxTokens);
            continue;
          }

          if (!result.toolCalls.length) break;

          const budget = Math.max(0, MAX_TOOL_CALLS - totalToolCalls);
          const calls = result.toolCalls.slice(0, budget);
          totalToolCalls += calls.length;
          const toolMessages: LlmMessage[] = [];
          let anyFailure = false;
          let shouldContinue = false;

          for (const call of calls) {
            send({ type: "tool_status", name: call.name, state: "running" });
            let outcome;
            try {
              outcome = await executeTool(call.name, call.arguments, {
                sessionId: session.id,
                messageId: assistantMessage.id,
              });
            } catch (e) {
              outcome = {
                ok: false,
                result: `工具执行异常：${(e as Error).message}`,
                blocks: [],
              };
            }
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
            if (!outcome.ok) {
              anyFailure = true;
              // 没有 notice 的失败也必须让用户看见，不能再静默吞掉
              if (!outcome.notice) {
                const msg = `工具 ${call.name} 执行失败，已跳过。`;
                notices.push(msg);
                parts.push({ type: "notice", notice: msg });
                send({ type: "notice", text: msg });
              }
              console.warn("[tool] 失败:", call.name, outcome.result.slice(0, 200));
            } else if (
              call.name === "present_chart" ||
              call.name === "present_table" ||
              call.name === "present_steps"
            ) {
              shouldContinue = true;
            }
            toolMessages.push({
              role: "tool",
              toolCallId: call.id,
              content: outcome.ok ? outcome.result : `调用失败：${outcome.result}`,
            });
            send({ type: "tool_status", name: call.name, state: "done" });
          }

          messages.push({ role: "assistant", content: cleaned, toolCalls: calls });
          messages.push(...toolMessages);

          // 练习/小测/计划等没有"需要模型接着读"的新信息，不续写以免啰嗦或泄题
          if (round >= MAX_CONTINUATIONS || (!anyFailure && !shouldContinue)) break;
          messages.push({
            role: "system",
            content:
              "工具已经执行完毕。请用 1–3 句话收尾：说明这个组件想表达什么，或根据失败原因修正后重新尝试。不要复述组件里的内容，不要泄露练习题的答案。",
          });
          round++;
          persistStreaming(true);
        }

        fullText = roundTexts.join("\n\n");
        if (!fullText.trim() && !parts.some((p) => p.type === "block")) {
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
        if (finishReason === "length" || finishReason === "max_tokens") {
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
          promptTokens: usageSeen ? usageTotal.promptTokens : undefined,
          completionTokens: usageSeen ? usageTotal.completionTokens : undefined,
          latencyMs: Date.now() - startedAt,
          ok: true,
        });
        // 聊天成功也算一次真实健康信号：清掉上次错误，避免首页一直挂着旧失败。
        if (config.id) recordAiModelTest(config.id, true, Date.now() - startedAt, null);

        send({
          type: "done",
          messageId: assistantMessage.id,
          sessionId: session.id,
          session: getSession(session.id),
          usage: usageSeen ? usageTotal : null,
          finishReason,
          reasoningChars,
          sources: citations.used,
        });
      } catch (e) {
        const err = e instanceof AiError ? e : new AiError("AI_BAD_RESPONSE", (e as Error).message);
        const baseHint = AI_ERROR_HINT[err.code] ?? "生成失败，请重试。";
        // 上游 401/403 不一定是 Key 错：方舟等账户欠费也会返回 401。
        const hint = /overdue|balance|quota|insufficient/i.test(err.detail ?? "")
          ? "模型服务账户余额不足或已欠费，请先到服务商充值/处理，然后点「重试」。"
          : baseHint;
        console.error("[chat]", err.code, err.message, err.detail?.slice(0, 200));
        // 保留已经讲出来的部分（包括本轮还没收尾的那一段），不能因为失败就丢掉
        fullText = partialText();
        const inProgress = stripBlockPlaceholders(currentRaw);
        if (inProgress.trim()) parts.push({ type: "text", text: inProgress });
        // 生成失败时也保留来源，方便用户看到这一轮查了什么
        if (materialSources.length || webSources.length) {
          saveMessageSources(assistantMessage.id, [...materialSources, ...webSources].slice(0, 5));
        }
        parts.push({ type: "notice", notice: hint });
        updateMessage(assistantMessage.id, {
          content: fullText,
          parts,
          status: "error",
          error: err.code,
          model: config.model,
        });
        // 失败/中断也要更新会话：否则 message_count 仍为 0，列表接口会把整段对话过滤掉，
        // 用户明明问过，却在首页「继续」和历史里都找不到。
        try {
          if (session.title === "新的学习" && session.messageCount <= 1) {
            touchSession(session.id, { title: fallbackTitle(text) });
          } else {
            touchSession(session.id);
          }
        } catch {
          /* 会话更新失败不影响错误提示 */
        }
        logUsage({
          sessionId: session.id,
          model: config.model,
          latencyMs: Date.now() - startedAt,
          ok: false,
          error: err.code,
        });
        // 用户主动停止不算模型故障；其余失败写回健康状态，首页才能提示。
        if (config.id && err.code !== "AI_ABORTED") {
          recordAiModelTest(config.id, false, 0, hint);
        }
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
