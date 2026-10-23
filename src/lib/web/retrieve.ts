import type { SourceDTO } from "@/lib/types";
import { effectiveTtlDays, getCached, logSearch, putCached, queryHash } from "./cache";
import type { WebConfig } from "./config";
import { extractReadableText, safeFetchText } from "./fetch";
import { planQueries } from "./gate";
import { getProvider, WebProviderError, type RawResult } from "./provider";
import { rankAndDedupe } from "./score";

export interface WebRetrievalResult {
  status: "hit" | "stale" | "no_result" | "failed";
  sources: SourceDTO[];
  notice?: string;
  queries: string[];
  cacheHit: boolean;
  latencyMs: number;
  code?: string;
}

function toSources(results: RawResult[] & { domain?: string; canonical?: string; quality?: number }[], provider: string): SourceDTO[] {
  const t = Date.now();
  return results.map((r, i) => ({
    id: `w${i + 1}`,
    kind: "web" as const,
    title: r.title || r.url,
    url: r.url,
    domain: (r as { domain?: string }).domain ?? null,
    publishedAt: r.publishedAt ?? null,
    retrievedAt: t,
    snippet: (r.snippet ?? "").slice(0, 600),
    stale: false,
    meta: { provider, score: (r as { quality?: number }).quality ?? null },
  }));
}

/** 摘要太短时抓一次正文补足；失败就退回"仅摘要"，不编造内容 */
async function enrich(result: RawResult, timeoutMs: number): Promise<RawResult> {
  if ((result.content?.length ?? 0) > 200) return result;
  if ((result.snippet?.length ?? 0) >= 240) return result;
  try {
    const page = await safeFetchText(result.url, { timeoutMs: Math.min(timeoutMs, 3500), allowPrivate: false });
    const text = extractReadableText(page.text).slice(0, 1500);
    if (!text) return result;
    return { ...result, content: text, snippet: result.snippet || text.slice(0, 240) };
  } catch {
    // 抓不到就保留原始摘要，卡片会标注"仅摘要"
    return result;
  }
}

export async function retrieveWeb(opts: {
  text: string;
  sessionId?: string | null;
  messageId?: string | null;
  cfg: WebConfig;
  signal?: AbortSignal;
}): Promise<WebRetrievalResult> {
  const { cfg } = opts;
  const started = Date.now();
  const queries = planQueries(opts.text, cfg);
  const query = queries[0] ?? "";
  if (!query) {
    return { status: "no_result", sources: [], notice: "没有可检索的查询内容。", queries: [], cacheHit: false, latencyMs: 0 };
  }

  const ttl = effectiveTtlDays(query, cfg);
  const hash = queryHash({
    provider: cfg.provider,
    query,
    maxResults: cfg.maxSources,
    domains: cfg.allowDomains,
  });

  const provider = getProvider(cfg);
  const log = (ok: boolean, count: number, cacheHit: boolean, error?: string) =>
    logSearch({
      sessionId: opts.sessionId,
      messageId: opts.messageId,
      queryHash: hash,
      provider: cfg.provider,
      cacheHit,
      resultCount: count,
      latencyMs: Date.now() - started,
      ok,
      error,
    });

  // 1) 缓存
  const cached = getCached(hash);
  if (cached && !cached.stale) {
    const ranked = rankAndDedupe(cached.results, query, cfg, cfg.maxSources);
    log(true, ranked.length, true);
    if (!ranked.length) {
      return {
        status: "no_result",
        sources: [],
        notice: "没有找到可靠来源，本次使用模型知识。",
        queries,
        cacheHit: true,
        latencyMs: Date.now() - started,
      };
    }
    return {
      status: "hit",
      sources: toSources(ranked as RawResult[], cfg.provider),
      queries,
      cacheHit: true,
      latencyMs: Date.now() - started,
    };
  }

  // 2) 实时检索
  try {
    const raw = await provider.search({
      query,
      maxResults: Math.max(5, cfg.maxSources * 2),
      domains: cfg.allowDomains,
      timeoutMs: cfg.timeoutMs,
      signal: opts.signal,
    });
    const ranked = rankAndDedupe(raw, query, cfg, cfg.maxSources);
    log(true, ranked.length, false);

    if (!ranked.length) {
      return {
        status: "no_result",
        sources: [],
        notice: raw.length ? "找到的内容质量不足，未采用。" : "没有找到可靠来源，本次使用模型知识。",
        queries,
        cacheHit: false,
        latencyMs: Date.now() - started,
      };
    }

    putCached(hash, query, cfg, ranked.map(({ title, url, snippet, publishedAt, content, score }) => ({
      title,
      url,
      snippet,
      publishedAt,
      content,
      score,
    })), ttl);

    // 3) 摘要不足时补一次正文（最多 2 条，失败不影响主流程）
    const enriched = await Promise.all(
      ranked.map((r, i) => (i < 2 ? enrich(r, cfg.timeoutMs) : Promise.resolve(r))),
    );

    const sources = toSources(enriched as RawResult[], cfg.provider);
    // 正文进 prompt，但不上来源卡片（卡片只放 ≤600 字摘要）
    enriched.forEach((r, i) => {
      if (r.content) {
        (sources[i].meta as Record<string, unknown>).excerpt = r.content.slice(0, 600);
      }
    });

    return {
      status: "hit",
      sources,
      queries,
      cacheHit: false,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    const err =
      e instanceof WebProviderError
        ? e
        : new WebProviderError("WEB_NETWORK", (e as Error).message || "搜索失败");
    log(false, 0, false, err.code);

    // 过期缓存比没有好，但必须标"可能已过期"
    if (cached) {
      const ranked = rankAndDedupe(cached.results, query, cfg, cfg.maxSources);
      if (ranked.length) {
        const sources = toSources(ranked as RawResult[], cfg.provider).map((s) => ({ ...s, stale: true }));
        return {
          status: "stale",
          sources,
          notice: `来源可能已过期（缓存于 ${Math.max(1, Math.round((Date.now() - cached.fetchedAt) / 86400000))} 天前）。`,
          queries,
          cacheHit: true,
          latencyMs: Date.now() - started,
          code: err.code,
        };
      }
    }

    const msg =
      err.code === "WEB_TIMEOUT"
        ? "搜索超时，本次未能联网核实。"
        : err.code === "WEB_UNAUTHORIZED"
          ? "搜索服务鉴权失败，请检查 Key。"
          : err.code === "WEB_RATE_LIMIT"
            ? "搜索服务限流，稍后再试。"
            : "本次未能联网核实，以下是模型知识。";
    return {
      status: "failed",
      sources: [],
      notice: msg,
      queries,
      cacheHit: false,
      latencyMs: Date.now() - started,
      code: err.code,
    };
  }
}
