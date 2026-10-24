import { getJsonSetting } from "@/lib/db/repo";
import type { WebConfigPublic } from "@/lib/types";

/**
 * 联网检索配置：**一个通用 HTTP 搜索接口**。
 *
 * 早期版本内置 SearXNG / Tavily / Brave 三家适配器，实际使用时"预设"反而限制了
 * 能接什么服务：换个自建服务、或者服务商改了接口，就得改代码。现在只描述
 * "怎么发请求、怎么读结果"，任何返回 JSON 的搜索 API 都能配进来：
 *
 *   GET  https://api.example.com/search?q=关键词
 *   POST https://api.example.com/search   {"query":"关键词"}   + 认证头
 *
 * 请求体模板、结果数组路径与字段映射都可留空走自动识别，配置量保持在少数几项。
 */

export interface WebConfig {
  enabled: boolean;
  /** 完整接口地址（含协议；GET 时可以自带固定参数，如 ?format=json） */
  endpoint: string;
  method: "GET" | "POST";
  /** API Key：供 {{apiKey}} 占位符使用（请求体模板 / 认证请求头） */
  apiKey: string;
  /** 认证请求头整行，如 "Authorization: Bearer {{apiKey}}"；留空表示不需要 */
  authHeader: string;
  /** GET 时的查询参数名 */
  queryParam: string;
  /** POST 请求体模板（JSON 字符串，支持 {{query}} / {{maxResults}} / {{apiKey}}） */
  bodyTemplate: string;
  /** 结果数组路径，如 results、data.items、web.results；留空自动识别 */
  resultsPath: string;
  /** 单条结果里标题 / 链接 / 摘要的字段名；留空自动识别 */
  titleField: string;
  urlField: string;
  snippetField: string;
  maxSources: number;
  timeoutMs: number;
  ttlDays: number;
  defaultMode: "off" | "manual";
  allowDomains: string[];
  denyDomains: string[];
  maxSearchesPerSession: number;
}

const DEFAULTS: WebConfig = {
  enabled: false,
  endpoint: "",
  method: "GET",
  apiKey: "",
  authHeader: "",
  queryParam: "q",
  bodyTemplate: '{"query": "{{query}}", "max_results": {{maxResults}}}',
  resultsPath: "",
  titleField: "",
  urlField: "",
  snippetField: "",
  maxSources: 3,
  timeoutMs: 4000,
  ttlDays: 7,
  defaultMode: "off",
  allowDomains: [],
  denyDomains: [],
  maxSearchesPerSession: 6,
};

/** 自动识别结果数组时依次尝试的路径 */
export const RESULT_PATH_CANDIDATES = [
  "results",
  "data",
  "items",
  "web.results",
  "data.results",
  "data.items",
  "organic",
  "hits",
];

function env(key: string): string {
  return (process.env[key] ?? "").trim();
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function str(v: unknown, fallback: string, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}

/** 配置优先级：设置页（本机 SQLite）> 环境变量 > 默认值 */
export function resolveWebConfig(): WebConfig {
  const stored = getJsonSetting<Partial<WebConfig> & { baseUrl?: string; provider?: string }>("web_config") ?? {};
  // 兼容旧版：老配置只有 baseUrl/provider，没有 endpoint
  const legacyEndpoint = typeof stored.baseUrl === "string" ? stored.baseUrl : "";
  const endpoint = (
    str(stored.endpoint, env("WEB_SEARCH_ENDPOINT") || legacyEndpoint)
  ).replace(/\/+$/, "");
  return {
    enabled: Boolean(stored.enabled ?? false),
    endpoint,
    method: stored.method === "POST" ? "POST" : "GET",
    apiKey: (str(stored.apiKey, env("WEB_SEARCH_API_KEY"), 500) || "").trim(),
    authHeader: str(stored.authHeader, env("WEB_SEARCH_AUTH_HEADER"), 500),
    queryParam: str(stored.queryParam, DEFAULTS.queryParam, 50) || DEFAULTS.queryParam,
    bodyTemplate: str(stored.bodyTemplate, DEFAULTS.bodyTemplate, 4000),
    resultsPath: str(stored.resultsPath, "", 200),
    titleField: str(stored.titleField, "", 100),
    urlField: str(stored.urlField, "", 100),
    snippetField: str(stored.snippetField, "", 100),
    maxSources: num(stored.maxSources, DEFAULTS.maxSources, 1, 5),
    timeoutMs: num(stored.timeoutMs, DEFAULTS.timeoutMs, 2000, 10000),
    ttlDays: num(stored.ttlDays, DEFAULTS.ttlDays, 1, 30),
    defaultMode: stored.defaultMode === "manual" ? "manual" : "off",
    allowDomains: Array.isArray(stored.allowDomains) ? stored.allowDomains.slice(0, 50) : [],
    denyDomains: Array.isArray(stored.denyDomains) ? stored.denyDomains.slice(0, 50) : [],
    maxSearchesPerSession: num(stored.maxSearchesPerSession, DEFAULTS.maxSearchesPerSession, 1, 30),
  };
}

/** 接口是否具备可用条件：至少要有一个可请求的地址 */
export function isWebConfigured(cfg: WebConfig): boolean {
  return Boolean(cfg.endpoint);
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

/** 日志 / 缓存 / 来源卡片上标识"用了哪个接口" */
export function webEndpointLabel(cfg: WebConfig): string {
  try {
    return new URL(cfg.endpoint).host || "custom";
  } catch {
    return cfg.endpoint ? "custom" : "unconfigured";
  }
}

export function webStatus(): WebConfigPublic {
  const cfg = resolveWebConfig();
  return {
    enabled: cfg.enabled,
    endpoint: cfg.endpoint,
    method: cfg.method,
    configured: isWebConfigured(cfg),
    keyMasked: maskKey(cfg.apiKey),
    // 请求头里可能带 Key，只回报"有没有配"，不回显内容
    hasAuth: Boolean(cfg.authHeader || cfg.apiKey),
    queryParam: cfg.queryParam,
    bodyTemplate: cfg.bodyTemplate,
    resultsPath: cfg.resultsPath,
    titleField: cfg.titleField,
    urlField: cfg.urlField,
    snippetField: cfg.snippetField,
    maxSources: cfg.maxSources,
    timeoutMs: cfg.timeoutMs,
    ttlDays: cfg.ttlDays,
    defaultMode: cfg.defaultMode,
    allowDomains: cfg.allowDomains,
    denyDomains: cfg.denyDomains,
    maxSearchesPerSession: cfg.maxSearchesPerSession,
  };
}