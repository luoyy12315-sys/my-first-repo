import {
  getAiModel,
  getDefaultAiModel,
  getSessionModelId,
  listAiModels,
  type AiModelRow,
} from "@/lib/db/repo";
import type { AiModelPublic, AiStatus } from "@/lib/types";

export interface AiConfig {
  /** 使用的模型配置 id；环境变量兜底时为 null */
  id: string | null;
  label: string;
  provider: "openai" | "anthropic";
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxTokens: number;
  source: "env" | "settings" | "none";
}

const DEFAULT_BASE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

/** 本地端点（Ollama / LM Studio / vLLM）通常不校验 Key，允许留空 */
export function isLocalEndpoint(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
  } catch {
    return false;
  }
}

function envNum(key: string, fallback: number) {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function fromRow(row: AiModelRow): AiConfig {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    baseUrl: row.baseUrl.replace(/\/+$/, ""),
    apiKey: row.apiKey.trim(),
    model: row.model,
    temperature: row.temperature,
    timeoutMs: envNum("AI_TIMEOUT_MS", 120000),
    maxTokens: envNum("AI_MAX_TOKENS", 4000),
    source: "settings",
  };
}

function fromEnv(): AiConfig {
  const provider = (process.env.AI_PROVIDER as AiConfig["provider"]) ?? "openai";
  const apiKey = (process.env.AI_API_KEY ?? "").trim();
  return {
    id: null,
    label: process.env.AI_MODEL || "环境变量模型",
    provider,
    baseUrl: (process.env.AI_BASE_URL || DEFAULT_BASE[provider] || DEFAULT_BASE.openai).replace(
      /\/+$/,
      "",
    ),
    apiKey,
    model: process.env.AI_MODEL || "",
    temperature: envNum("AI_TEMPERATURE", 0.6),
    timeoutMs: envNum("AI_TIMEOUT_MS", 120000),
    maxTokens: envNum("AI_MAX_TOKENS", 4000),
    source: apiKey ? "env" : "none",
  };
}

/**
 * 解析要用的模型配置。优先级：
 *   指定 id 且存在 > 默认模型 > 环境变量 > 空
 * API Key 只在服务端读取，永不出现在任何客户端响应中。
 */
export function resolveAiConfig(modelId?: string | null): AiConfig {
  if (modelId) {
    const row = getAiModel(modelId);
    if (row) return fromRow(row);
  }
  const def = getDefaultAiModel();
  if (def) return fromRow(def);
  return fromEnv();
}

/** 会话级状态：用于"这个会话现在配没配好"的判断 */
export function aiStatusForSession(sessionId?: string | null): AiStatus {
  return aiStatus(sessionId ? getSessionModelId(sessionId) : null);
}

/** 会话级解析：会话选了哪个模型就用哪个，否则跟随默认 */
export function resolveAiConfigForSession(sessionId?: string | null): AiConfig {
  const id = sessionId ? getSessionModelId(sessionId) : null;
  return resolveAiConfig(id);
}

export function aiStatus(modelId?: string | null): AiStatus {
  const c = resolveAiConfig(modelId);
  // 本地端点允许不填 Key（Ollama 等默认不校验）
  const configured = Boolean((c.apiKey || isLocalEndpoint(c.baseUrl)) && c.model);
  return {
    configured,
    provider: c.provider,
    baseUrl: c.baseUrl,
    model: c.model,
    label: c.label,
    modelId: c.id,
    source: c.source,
    reason: configured
      ? undefined
      : !c.apiKey
        ? "尚未配置模型服务的 API Key"
        : "尚未指定模型名称",
  };
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

/** 对外暴露的模型列表（脱敏，不含明文 Key） */
export function listModelProfiles(): AiModelPublic[] {
  return listAiModels().map((m) => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    baseUrl: m.baseUrl,
    model: m.model,
    temperature: m.temperature,
    isDefault: m.isDefault,
    configured: Boolean((m.apiKey || isLocalEndpoint(m.baseUrl)) && m.model),
    keyMasked: maskKey(m.apiKey),
    lastOkAt: m.lastOkAt,
    lastTestMs: m.lastTestMs,
    lastError: m.lastError,
  }));
}

export class AiError extends Error {
  code:
    | "AI_NOT_CONFIGURED"
    | "AI_UNAUTHORIZED"
    | "AI_RATE_LIMIT"
    | "AI_TIMEOUT"
    | "AI_NETWORK"
    | "AI_BAD_RESPONSE"
    | "AI_ABORTED";
  detail?: string;
  constructor(code: AiError["code"], message: string, detail?: string) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export const AI_ERROR_HINT: Record<AiError["code"], string> = {
  AI_NOT_CONFIGURED: "还没有配置模型服务。到「设置」页添加一个模型（可加多个），或改用本地模型（如 Ollama）。",
  AI_UNAUTHORIZED: "模型服务拒绝了这次请求（通常是 Key 无效或没有该模型权限）。",
  AI_RATE_LIMIT: "模型服务限流了，稍等一会儿再试。",
  AI_TIMEOUT: "模型响应超时。可以重试，或把问题拆小一点。",
  AI_NETWORK: "连不上模型服务，检查网络或 Base URL 是否正确。",
  AI_BAD_RESPONSE: "模型返回的内容无法解析，已降级处理。",
  AI_ABORTED: "本次生成已被取消。",
};
