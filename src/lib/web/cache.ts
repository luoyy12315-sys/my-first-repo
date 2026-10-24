import crypto from "node:crypto";
import { getDb, now, uid } from "@/lib/db";
import { webEndpointLabel, type WebConfig } from "./config";
import type { RawResult } from "./provider";

export interface CacheKeyParts {
  provider: string;
  query: string;
  maxResults: number;
  freshness?: string;
  domains?: string[];
}

export function queryHash(parts: CacheKeyParts): string {
  const raw = [
    parts.provider,
    parts.query.trim().toLowerCase(),
    parts.maxResults,
    parts.freshness ?? "",
    (parts.domains ?? []).slice().sort().join(","),
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export interface CacheHit {
  results: RawResult[];
  fetchedAt: number;
  expiresAt: number;
  stale: boolean;
}

/** 新闻类查询强制短 TTL：过期快照比没有更糟 */
export function effectiveTtlDays(query: string, cfg: WebConfig): number {
  if (/最新|最近|今年|今天|昨日|新闻|发布|上线|股价|价格/i.test(query)) return 1;
  return cfg.ttlDays;
}

export function getCached(hash: string): CacheHit | null {
  const row = getDb()
    .prepare("select results, fetched_at, expires_at from web_cache where query_hash = ?")
    .get(hash) as { results: string; fetched_at: number; expires_at: number } | undefined;
  if (!row) return null;
  let results: RawResult[] = [];
  try {
    results = JSON.parse(row.results) as RawResult[];
  } catch {
    return null;
  }
  return {
    results,
    fetchedAt: Number(row.fetched_at),
    expiresAt: Number(row.expires_at),
    stale: Number(row.expires_at) <= now(),
  };
}

export function putCached(hash: string, query: string, cfg: WebConfig, results: RawResult[], ttlDays: number) {
  const t = now();
  const expires = t + ttlDays * 24 * 3600 * 1000;
  getDb()
    .prepare(
      `insert into web_cache (id, query_hash, query, provider, results, fetched_at, expires_at)
       values (?, ?, ?, ?, ?, ?, ?)
       on conflict(query_hash) do update set results = excluded.results,
         fetched_at = excluded.fetched_at, expires_at = excluded.expires_at, provider = excluded.provider`,
    )
    .run(uid("wc_"), hash, query.slice(0, 300), webEndpointLabel(cfg), JSON.stringify(results), t, expires);
  return { fetchedAt: t, expiresAt: expires };
}

export function logSearch(opts: {
  sessionId?: string | null;
  messageId?: string | null;
  queryHash: string;
  provider: string;
  cacheHit: boolean;
  resultCount: number;
  latencyMs?: number;
  ok: boolean;
  error?: string | null;
}) {
  getDb()
    .prepare(
      `insert into web_search_log (id, session_id, message_id, query_hash, provider, cache_hit,
        result_count, latency_ms, ok, error, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      uid("wl_"),
      opts.sessionId ?? null,
      opts.messageId ?? null,
      opts.queryHash,
      opts.provider,
      opts.cacheHit ? 1 : 0,
      opts.resultCount,
      opts.latencyMs ?? null,
      opts.ok ? 1 : 0,
      opts.error ? opts.error.slice(0, 300) : null,
      now(),
    );
}

/** 会话预算：只统计真实 provider 调用（缓存命中不计数） */
export function countSessionSearches(sessionId: string): number {
  const r = getDb()
    .prepare("select count(*) as n from web_search_log where session_id = ? and cache_hit = 0 and ok = 1")
    .get(sessionId) as { n: number };
  return Number(r.n);
}

/** 缓存里还有多少条（含已过期但还没被覆盖的记录），设置页用来显示与清空 */
export function webCacheRows(): number {
  const r = getDb().prepare("select count(*) as n from web_cache").get() as { n: number };
  return Number(r.n);
}

/** 清空检索缓存：只删 web_cache，不动搜索日志与会话 */
export function clearWebCache(): number {
  const r = getDb().prepare("delete from web_cache").run();
  return Number(r.changes ?? 0);
}

/** 设置页的 7 天汇总 */
export function webStats(days = 7) {
  const since = now() - days * 24 * 3600 * 1000;
  const row = getDb()
    .prepare(
      `select count(*) as total,
              sum(cache_hit) as cached,
              sum(case when ok = 0 then 1 else 0 end) as failed,
              avg(case when cache_hit = 0 then latency_ms end) as avg_latency
         from web_search_log where created_at >= ?`,
    )
    .get(since) as { total: number; cached: number; failed: number; avg_latency: number | null };
  return {
    days,
    searches: Number(row.total ?? 0),
    cacheHits: Number(row.cached ?? 0),
    failures: Number(row.failed ?? 0),
    avgLatencyMs: row.avg_latency == null ? null : Math.round(Number(row.avg_latency)),
  };
}
