import { RESULT_PATH_CANDIDATES, type WebConfig } from "./config";

export interface RawResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: number;
  content?: string;
  score?: number;
}

export interface SearchInput {
  query: string;
  maxResults: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class WebProviderError extends Error {
  code: "WEB_NOT_CONFIGURED" | "WEB_UNAUTHORIZED" | "WEB_RATE_LIMIT" | "WEB_TIMEOUT" | "WEB_NETWORK" | "WEB_BAD_RESPONSE";
  detail?: string;
  constructor(code: WebProviderError["code"], message: string, detail?: string) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

function withTimeout(timeoutMs: number, outer?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(new Error("timeout")), timeoutMs);
  const onAbort = () => c.abort(new Error("aborted"));
  outer?.addEventListener("abort", onAbort);
  return {
    signal: c.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
    },
  };
}

function mapHttpError(status: number): WebProviderError {
  if (status === 401 || status === 403) return new WebProviderError("WEB_UNAUTHORIZED", "搜索接口鉴权失败（检查 Key 或认证头）");
  if (status === 429) return new WebProviderError("WEB_RATE_LIMIT", "搜索接口限流");
  return new WebProviderError("WEB_BAD_RESPONSE", `搜索接口返回 ${status}`);
}

/** 模板占位符：{{query}} / {{maxResults}} / {{apiKey}} */
export function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

/** 按点号路径取值，支持 a.b[0].c；路径为空时原样返回 */
export function getByPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split(".").reduce<unknown>((acc, rawKey) => {
    if (acc == null) return undefined;
    const key = rawKey.trim();
    const indexed = key.match(/^(.+)\[(\d+)\]$/);
    if (indexed) {
      const base = (acc as Record<string, unknown>)[indexed[1]];
      return Array.isArray(base) ? base[Number(indexed[2])] : undefined;
    }
    if (Array.isArray(acc) && /^\d+$/.test(key)) return acc[Number(key)];
    return (acc as Record<string, unknown>)[key];
  }, value);
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

/**
 * 从响应 JSON 里取出结果数组。
 * 指定了 resultsPath 就严格按它取；没指定就按常见路径猜，再退化成"第一个对象数组"。
 */
export function extractRows(payload: unknown, resultsPath: string): Record<string, unknown>[] {
  const isRowArray = (v: unknown): v is Record<string, unknown>[] =>
    Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && !Array.isArray(x));

  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === "object") as Record<string, unknown>[];

  if (resultsPath.trim()) {
    const picked = getByPath(payload, resultsPath.trim());
    return Array.isArray(picked)
      ? (picked.filter((x) => x && typeof x === "object") as Record<string, unknown>[])
      : [];
  }

  for (const path of RESULT_PATH_CANDIDATES) {
    const picked = getByPath(payload, path);
    if (isRowArray(picked)) return picked;
  }

  // 最后兜底：顶层对象里第一个"元素是对象"的数组
  if (payload && typeof payload === "object") {
    for (const v of Object.values(payload as Record<string, unknown>)) {
      if (isRowArray(v)) return v;
    }
  }
  return [];
}

const TITLE_KEYS = ["title", "name", "heading", "question"];
const URL_KEYS = ["url", "link", "href", "permalink"];
const SNIPPET_KEYS = ["snippet", "content", "description", "summary", "text", "abstract"];

function pickString(row: Record<string, unknown>, path: string, candidates: string[]): string {
  if (path.trim()) return asString(getByPath(row, path.trim()));
  for (const key of candidates) {
    const v = asString(getByPath(row, key));
    if (v.trim()) return v;
  }
  return "";
}

function toTs(v: unknown): number | undefined {
  if (!v) return undefined;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : undefined;
}

/** 单条结果 → 统一结构；字段名可自定义，没填就按常见名字猜 */
export function mapRow(row: Record<string, unknown>, cfg: Pick<WebConfig, "titleField" | "urlField" | "snippetField">): RawResult | null {
  const url = pickString(row, cfg.urlField, URL_KEYS);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const title = pickString(row, cfg.titleField, TITLE_KEYS) || url;
  const snippet = pickString(row, cfg.snippetField, SNIPPET_KEYS);
  const publishedAt = toTs(row.publishedAt ?? row.published_date ?? row.date ?? row.published ?? row.age);
  const rawContent = row.raw_content ?? row.full_text ?? row.content_text;
  const content = typeof rawContent === "string" && rawContent.length > 200 ? rawContent : undefined;
  return { title: title.slice(0, 300), url, snippet: snippet.slice(0, 2000), publishedAt, content };
}

/**
 * 发一次搜索请求。
 *
 * 通用 HTTP 适配：地址、方法、认证头、请求体模板、结果路径与字段名都由配置决定，
 * 因此不需要为每家服务写一个适配器。
 */
export async function searchWeb(cfg: WebConfig, input: SearchInput): Promise<RawResult[]> {
  if (!cfg.endpoint) throw new WebProviderError("WEB_NOT_CONFIGURED", "尚未配置搜索接口地址");

  let url: URL;
  try {
    url = new URL(cfg.endpoint);
  } catch {
    throw new WebProviderError("WEB_BAD_RESPONSE", "搜索接口地址格式不正确（要以 http:// 或 https:// 开头）");
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new WebProviderError("WEB_BAD_RESPONSE", "搜索接口只能用 http / https");
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (cfg.authHeader.trim()) {
    const idx = cfg.authHeader.indexOf(":");
    if (idx <= 0) throw new WebProviderError("WEB_BAD_RESPONSE", "认证请求头格式应为「名称: 值」");
    const name = cfg.authHeader.slice(0, idx).trim();
    const rawValue = cfg.authHeader.slice(idx + 1).trim();
    if (!name) throw new WebProviderError("WEB_BAD_RESPONSE", "认证请求头的名称不能为空");
    headers[name] = applyTemplate(rawValue, { apiKey: cfg.apiKey });
  }

  let body: string | undefined;
  if (cfg.method === "POST") {
    headers["content-type"] = "application/json";
    body = applyTemplate(cfg.bodyTemplate || '{"query": "{{query}}", "max_results": {{maxResults}}}', {
      query: input.query,
      maxResults: String(input.maxResults),
      apiKey: cfg.apiKey,
    });
  } else {
    url.searchParams.set(cfg.queryParam || "q", input.query);
  }

  const timer = withTimeout(input.timeoutMs ?? cfg.timeoutMs, input.signal);
  try {
    const res = await fetch(url, {
      method: cfg.method,
      headers,
      body,
      signal: timer.signal,
    });
    if (!res.ok) throw mapHttpError(res.status);
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new WebProviderError("WEB_BAD_RESPONSE", "搜索接口返回的不是 JSON（检查接口地址或响应格式）");
    }
    const rows = extractRows(payload, cfg.resultsPath);
    const mapped = rows.map((row) => mapRow(row, cfg)).filter((r): r is RawResult => r !== null);
    return mapped.slice(0, Math.max(1, input.maxResults));
  } catch (e) {
    if (e instanceof WebProviderError) throw e;
    const message = String((e as Error).message ?? "");
    throw new WebProviderError(
      message.includes("timeout") ? "WEB_TIMEOUT" : "WEB_NETWORK",
      message || "搜索请求失败",
    );
  } finally {
    timer.done();
  }
}