import type { WebConfig } from "./config";
import type { RawResult } from "./provider";

const TRACKING = /^(utm_|fbclid|gclid|spm|from|ref_?$)/i;

/** 规范化 URL：去掉跟踪参数、hash、末尾斜杠，用于去重 */
export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING.test(key) || key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
    }
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./i, "");
    // 去掉路径末尾斜杠（要改 pathname，不能直接截字符串，否则会连 query 一起切掉）
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return raw;
  }
}

export function domainOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function domainMatches(host: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase().replace(/^\*\./, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!p) return false;
  return host === p || host.endsWith(`.${p}`);
}

export interface ScoredResult extends RawResult {
  canonical: string;
  domain: string;
  quality: number;
}

/**
 * 评分与去重。
 * 只做可解释的规则，不用模型打分——排序结果要能被用户验证。
 */
export function rankAndDedupe(
  results: RawResult[],
  query: string,
  cfg: WebConfig,
  maxSources: number,
): ScoredResult[] {
  const now = Date.now();
  const year = 365 * 24 * 3600 * 1000;
  const terms = query
    .toLowerCase()
    .split(/[\s,，。;；、?!？！]+/)
    .filter((t) => t.length >= 2);

  const seen = new Set<string>();
  const scored: ScoredResult[] = [];

  for (const r of results) {
    if (!r.url || !/^https?:\/\//i.test(r.url)) continue;
    const canonical = canonicalizeUrl(r.url);
    const domain = domainOf(r.url);
    if (!domain) continue;
    if (cfg.denyDomains.some((d) => domainMatches(domain, d))) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);

    let quality = 10;
    if (cfg.allowDomains.some((d) => domainMatches(domain, d))) quality += 30;
    if (/\.(gov|edu)(\.[a-z]{2})?$/i.test(domain) || /\.gov\.cn$/i.test(domain) || /\.edu\.cn$/i.test(domain)) {
      quality += 20;
    }
    if (r.publishedAt) {
      const age = now - r.publishedAt;
      if (age >= 0 && age <= year) quality += 10;
      else if (age > 3 * year) quality -= 10;
    }
    const haystack = `${r.title} ${r.snippet}`.toLowerCase();
    const hits = terms.filter((t) => haystack.includes(t)).length;
    quality += Math.min(20, hits * 8);
    if ((r.snippet ?? "").length < 200) quality -= 10;
    if (typeof r.score === "number") quality += Math.min(10, r.score * 5);

    scored.push({ ...r, canonical, domain, quality });
  }

  scored.sort((a, b) => b.quality - a.quality);

  // 同一域名最多 2 条，保证多样性
  const perDomain = new Map<string, number>();
  const picked: ScoredResult[] = [];
  for (const r of scored) {
    if (r.quality < 10) continue;
    const n = perDomain.get(r.domain) ?? 0;
    if (n >= 2) continue;
    perDomain.set(r.domain, n + 1);
    picked.push(r);
    if (picked.length >= maxSources) break;
  }
  return picked;
}
