/**
 * 模型服务适配层（OpenAI 兼容协议 / Anthropic Messages 协议）
 *
 * 刻意把协议差异收敛在这一个文件里：业务代码只处理
 * "文本增量 + 工具调用" 两种事件，不关心厂商差异。
 */
import { AiError, isLocalEndpoint, type AiConfig } from "./config";

export interface LlmToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** assistant 发起的工具调用 */
  toolCalls?: { id: string; name: string; arguments: string }[];
  /** role=tool 时对应调用 id */
  toolCallId?: string;
}

export interface StreamResult {
  text: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  finishReason: string | null;
  usage?: { promptTokens: number; completionTokens: number };
  /** 推理过程：只用于界面状态与预算判断，绝不拼进正文、不入库 */
  reasoning?: string;
  reasoningTokens?: number;
}

export interface StreamOptions {
  config: AiConfig;
  messages: LlmMessage[];
  tools?: LlmToolSpec[];
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  /** 推理增量（不展示正文，用于"正在思考"状态与日志） */
  onReasoning?: (delta: string) => void;
  /** 需要 JSON 输出时（如小结/评阅）启用 */
  jsonMode?: boolean;
}

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 600);
  } catch {
    return "";
  }
}

function mapHttpError(status: number, body: string): AiError {
  if (status === 401 || status === 403) return new AiError("AI_UNAUTHORIZED", "模型服务鉴权失败", body);
  if (status === 429) return new AiError("AI_RATE_LIMIT", "模型服务限流", body);
  if (status >= 500) return new AiError("AI_NETWORK", "模型服务异常", body);
  return new AiError("AI_BAD_RESPONSE", `模型服务返回 ${status}`, body);
}

export async function streamChat(opts: StreamOptions): Promise<StreamResult> {
  const { config } = opts;
  if (!config.apiKey && !isLocalEndpoint(config.baseUrl)) {
    throw new AiError("AI_NOT_CONFIGURED", "缺少 API Key");
  }
  if (!config.model) throw new AiError("AI_NOT_CONFIGURED", "缺少模型名称");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), config.timeoutMs);
  const onAbort = () => controller.abort(new Error("aborted"));
  opts.signal?.addEventListener("abort", onAbort);

  try {
    const result =
      config.provider === "anthropic"
        ? await streamAnthropic({ ...opts, signal: controller.signal })
        : await streamOpenAI({ ...opts, signal: controller.signal });
    return result;
  } catch (e) {
    const err = e as Error & { name?: string };
    if (err instanceof AiError) throw err;
    if (err.name === "AbortError" || String(err.message).includes("aborted")) {
      throw new AiError("AI_ABORTED", "请求被中止");
    }
    if (String(err.message).includes("timeout")) {
      throw new AiError("AI_TIMEOUT", "模型响应超时");
    }
    throw new AiError("AI_NETWORK", err.message || "网络错误");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

async function streamOpenAI(opts: StreamOptions): Promise<StreamResult> {
  const { config, messages, tools, onText, onReasoning, jsonMode } = opts;
  const body: Record<string, unknown> = {
    model: config.model,
    messages: messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((t) => ({
            id: t.id,
            type: "function",
            function: { name: t.name, arguments: t.arguments },
          })),
        };
      }
      return { role: m.role, content: m.content };
    }),
    stream: true,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream_options: { include_usage: true },
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) throw mapHttpError(res.status, await readError(res));
  if (!res.body) throw new AiError("AI_BAD_RESPONSE", "响应没有内容");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let reasoning = "";
  let reasoningTokens = 0;
  const calls: { id: string; name: string; arguments: string }[] = [];
  let finishReason: string | null = null;
  let usage: StreamResult["usage"];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const errObj = json.error as { message?: string } | undefined;
      if (errObj) throw new AiError("AI_BAD_RESPONSE", errObj.message || "模型返回错误");
      const u = json.usage as
        | {
            prompt_tokens?: number;
            completion_tokens?: number;
            completion_tokens_details?: { reasoning_tokens?: number };
          }
        | undefined;
      if (u) {
        usage = { promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0 };
        reasoningTokens = u.completion_tokens_details?.reasoning_tokens ?? reasoningTokens;
      }
      const choice = (json.choices as Record<string, unknown>[] | undefined)?.[0];
      if (!choice) continue;
      finishReason = (choice.finish_reason as string) ?? finishReason;
      const delta = choice.delta as Record<string, unknown> | undefined;
      if (!delta) continue;
      // 推理型模型（DeepSeek/豆包等）把思考放在 reasoning_content，
      // 它的 token 计入 completion_tokens；不单独接住就会表现为"空回复"。
      const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
      if (typeof reasoningDelta === "string" && reasoningDelta.length) {
        reasoning += reasoningDelta;
        onReasoning?.(reasoningDelta);
      }
      const content = delta.content;
      if (typeof content === "string" && content.length) {
        text += content;
        onText?.(content);
      }
      const toolDeltas = delta.tool_calls as
        | { index: number; id?: string; function?: { name?: string; arguments?: string } }[]
        | undefined;
      if (toolDeltas) {
        for (const td of toolDeltas) {
          const idx = td.index ?? 0;
          if (!calls[idx]) calls[idx] = { id: td.id ?? `call_${idx}`, name: "", arguments: "" };
          if (td.id) calls[idx].id = td.id;
          if (td.function?.name) calls[idx].name += td.function.name;
          if (td.function?.arguments) calls[idx].arguments += td.function.arguments;
        }
      }
    }
  }

  return {
    text,
    toolCalls: calls.filter((c) => c && c.name),
    finishReason,
    usage,
    reasoning,
    reasoningTokens,
  };
}

async function streamAnthropic(opts: StreamOptions): Promise<StreamResult> {
  const { config, messages, tools, onText, onReasoning } = opts;
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      rest.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      rest.push({
        role: "assistant",
        content: [
          ...(m.content ? [{ type: "text", text: m.content }] : []),
          ...m.toolCalls.map((t) => ({
            type: "tool_use",
            id: t.id,
            name: t.name,
            input: safeParse(t.arguments),
          })),
        ],
      });
      continue;
    }
    rest.push({ role: m.role, content: m.content });
  }

  const body: Record<string, unknown> = {
    model: config.model,
    system,
    messages: rest,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: true,
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const res = await fetch(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw mapHttpError(res.status, await readError(res));
  if (!res.body) throw new AiError("AI_BAD_RESPONSE", "响应没有内容");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let reasoning = "";
  let reasoningTokens = 0;
  const calls: { id: string; name: string; arguments: string }[] = [];
  let finishReason: string | null = null;
  let usage: StreamResult["usage"];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      const type = json.type as string;
      if (type === "content_block_start") {
        const block = json.content_block as { type: string; id?: string; name?: string };
        if (block?.type === "tool_use") {
          calls.push({ id: block.id ?? `call_${calls.length}`, name: block.name ?? "", arguments: "" });
        }
      } else if (type === "content_block_delta") {
        const delta = json.delta as { type?: string; text?: string; partial_json?: string; thinking?: string };
        if (delta?.type === "text_delta" && delta.text) {
          text += delta.text;
          onText?.(delta.text);
        } else if (delta?.type === "thinking_delta" && delta.thinking) {
          reasoning += delta.thinking;
          onReasoning?.(delta.thinking);
        } else if (delta?.type === "input_json_delta" && delta.partial_json) {
          if (calls.length) calls[calls.length - 1].arguments += delta.partial_json;
        }
      } else if (type === "message_delta") {
        const d = json.delta as { stop_reason?: string };
        finishReason = d?.stop_reason ?? finishReason;
        const u = json.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        if (u) usage = { promptTokens: u.input_tokens ?? 0, completionTokens: u.output_tokens ?? 0 };
      }
    }
  }

  return {
    text,
    toolCalls: calls.filter((c) => c.arguments !== "" || c.name),
    finishReason,
    usage,
    reasoning,
    reasoningTokens,
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/** 无工具流式调用，用于 JSON 结构化任务（小结 / 开放题评阅） */
export async function completeJson(opts: Omit<StreamOptions, "tools" | "onText">): Promise<unknown> {
  const res = await streamChat({ ...opts, jsonMode: true });
  const raw = res.text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new AiError("AI_BAD_RESPONSE", "模型输出不是 JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}
