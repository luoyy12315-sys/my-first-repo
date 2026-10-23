import type { WebConfig } from "./config";

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
  freshness?: "day" | "week" | "month" | "year";
  domains?: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface WebSearchProvider {
  id: string;
  search(input: SearchInput): Promise<RawResult[]>;
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
  if (status === 401 || status === 403) return new WebProviderError("WEB_UNAUTHORIZED", "搜索服务鉴权失败");
  if (status === 429) return new WebProviderError("WEB_RATE_LIMIT", "搜索服务限流");
  return new WebProviderError("WEB_BAD_RESPONSE", `搜索服务返回 ${status}`);
}

function toTs(v: unknown): number | undefined {
  if (!v) return undefined;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : undefined;
}

/** SearXNG：自建、无 Key；需要实例在 settings.yml 打开 json 格式 */
function searxngProvider(cfg: WebConfig): WebSearchProvider {
  return {
    id: "searxng",
    async search({ query, maxResults, signal, timeoutMs }) {
      if (!cfg.baseUrl) throw new WebProviderError("WEB_NOT_CONFIGURED", "尚未配置 SearXNG 地址");
      const url = new URL("/search", cfg.baseUrl);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("language", "zh-CN");
      const t = withTimeout(timeoutMs ?? cfg.timeoutMs, signal);
      try {
        const res = await fetch(url, {
          signal: t.signal,
          headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {},
        });
        if (!res.ok) throw mapHttpError(res.status);
        const data = (await res.json()) as { results?: Record<string, unknown>[] };
        return (data.results ?? []).slice(0, maxResults * 2).map((r) => ({
          title: String(r.title ?? ""),
          url: String(r.url ?? ""),
          snippet: String(r.content ?? r.snippet ?? ""),
          publishedAt: toTs(r.publishedDate),
          score: typeof r.score === "number" ? r.score : undefined,
        }));
      } catch (e) {
        if (e instanceof WebProviderError) throw e;
        throw new WebProviderError(
          String((e as Error).message).includes("timeout") ? "WEB_TIMEOUT" : "WEB_NETWORK",
          (e as Error).message,
        );
      } finally {
        t.done();
      }
    },
  };
}

/** Tavily：质量好，直接返回抽取内容（省去自建抓页） */
function tavilyProvider(cfg: WebConfig): WebSearchProvider {
  return {
    id: "tavily",
    async search({ query, maxResults, signal, timeoutMs }) {
      if (!cfg.apiKey) throw new WebProviderError("WEB_NOT_CONFIGURED", "尚未配置 Tavily Key");
      const t = withTimeout(timeoutMs ?? cfg.timeoutMs, signal);
      try {
        const res = await fetch(`${cfg.baseUrl || "https://api.tavily.com"}/search`, {
          method: "POST",
          signal: t.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: cfg.apiKey,
            query,
            max_results: maxResults,
            search_depth: "basic",
            include_answer: false,
            include_raw_content: true,
          }),
        });
        if (!res.ok) throw mapHttpError(res.status);
        const data = (await res.json()) as { results?: Record<string, unknown>[] };
        return (data.results ?? []).map((r) => ({
          title: String(r.title ?? ""),
          url: String(r.url ?? ""),
          snippet: String(r.content ?? ""),
          publishedAt: toTs(r.published_date),
          content: typeof r.raw_content === "string" ? r.raw_content : undefined,
          score: typeof r.score === "number" ? r.score : undefined,
        }));
      } catch (e) {
        if (e instanceof WebProviderError) throw e;
        throw new WebProviderError(
          String((e as Error).message).includes("timeout") ? "WEB_TIMEOUT" : "WEB_NETWORK",
          (e as Error).message,
        );
      } finally {
        t.done();
      }
    },
  };
}

/** Brave Search API：备选 */
function braveProvider(cfg: WebConfig): WebSearchProvider {
  return {
    id: "brave",
    async search({ query, maxResults, signal, timeoutMs }) {
      if (!cfg.apiKey) throw new WebProviderError("WEB_NOT_CONFIGURED", "尚未配置 Brave Key");
      const url = new URL("/res/v1/web/search", cfg.baseUrl || "https://api.search.brave.com");
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(Math.min(10, maxResults)));
      const t = withTimeout(timeoutMs ?? cfg.timeoutMs, signal);
      try {
        const res = await fetch(url, {
          signal: t.signal,
          headers: { accept: "application/json", "x-subscription-token": cfg.apiKey },
        });
        if (!res.ok) throw mapHttpError(res.status);
        const data = (await res.json()) as { web?: { results?: Record<string, unknown>[] } };
        return (data.web?.results ?? []).map((r) => ({
          title: String(r.title ?? ""),
          url: String(r.url ?? ""),
          snippet: String(r.description ?? ""),
          publishedAt: toTs(r.age ?? r.page_age),
        }));
      } catch (e) {
        if (e instanceof WebProviderError) throw e;
        throw new WebProviderError(
          String((e as Error).message).includes("timeout") ? "WEB_TIMEOUT" : "WEB_NETWORK",
          (e as Error).message,
        );
      } finally {
        t.done();
      }
    },
  };
}

export function getProvider(cfg: WebConfig): WebSearchProvider {
  if (cfg.provider === "tavily") return tavilyProvider(cfg);
  if (cfg.provider === "brave") return braveProvider(cfg);
  return searxngProvider(cfg);
}
