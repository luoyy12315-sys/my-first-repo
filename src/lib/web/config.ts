import { getJsonSetting } from "@/lib/db/repo";
import type { WebConfigPublic } from "@/lib/types";

export type WebProviderId = "searxng" | "tavily" | "brave";

export interface WebConfig {
  enabled: boolean;
  provider: WebProviderId;
  baseUrl: string;
  apiKey: string;
  maxSources: number;
  timeoutMs: number;
  ttlDays: number;
  defaultMode: "off" | "manual";
  allowDomains: string[];
  denyDomains: string[];
  maxSearchesPerSession: number;
  allowPrivateProvider: boolean;
}

const DEFAULTS: WebConfig = {
  enabled: false,
  provider: "searxng",
  baseUrl: "",
  apiKey: "",
  maxSources: 3,
  timeoutMs: 4000,
  ttlDays: 7,
  defaultMode: "off",
  allowDomains: [],
  denyDomains: [],
  maxSearchesPerSession: 6,
  allowPrivateProvider: true,
};

export const PROVIDER_DEFAULT_BASE: Record<WebProviderId, string> = {
  searxng: "",
  tavily: "https://api.tavily.com",
  brave: "https://api.search.brave.com",
};

function env(key: string): string {
  return (process.env[key] ?? "").trim();
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 配置优先级：设置页（本机 SQLite）> 环境变量 > 默认值 */
export function resolveWebConfig(): WebConfig {
  const stored = getJsonSetting<Partial<WebConfig>>("web_config") ?? {};
  const provider = (stored.provider ?? env("WEB_SEARCH_PROVIDER") ?? "searxng") as WebProviderId;
  const baseUrl = (stored.baseUrl ?? env("WEB_SEARCH_BASE_URL") ?? PROVIDER_DEFAULT_BASE[provider] ?? "").replace(
    /\/+$/,
    "",
  );
  return {
    enabled: Boolean(stored.enabled ?? false),
    provider: ["searxng", "tavily", "brave"].includes(provider) ? provider : "searxng",
    baseUrl,
    apiKey: (stored.apiKey || env("WEB_SEARCH_API_KEY") || "").trim(),
    maxSources: num(stored.maxSources, DEFAULTS.maxSources, 1, 5),
    timeoutMs: num(stored.timeoutMs, DEFAULTS.timeoutMs, 2000, 10000),
    ttlDays: num(stored.ttlDays, DEFAULTS.ttlDays, 1, 30),
    defaultMode: stored.defaultMode === "manual" ? "manual" : "off",
    allowDomains: Array.isArray(stored.allowDomains) ? stored.allowDomains.slice(0, 50) : [],
    denyDomains: Array.isArray(stored.denyDomains) ? stored.denyDomains.slice(0, 50) : [],
    maxSearchesPerSession: num(stored.maxSearchesPerSession, DEFAULTS.maxSearchesPerSession, 1, 30),
    allowPrivateProvider: stored.allowPrivateProvider !== false,
  };
}

/** provider 是否具备可用条件（SearXNG 用自建地址，其它要 Key） */
export function isProviderConfigured(cfg: WebConfig): boolean {
  if (cfg.provider === "searxng") return Boolean(cfg.baseUrl);
  return Boolean(cfg.apiKey);
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

export function webStatus(): WebConfigPublic {
  const cfg = resolveWebConfig();
  return {
    enabled: cfg.enabled,
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    configured: isProviderConfigured(cfg),
    keyMasked: maskKey(cfg.apiKey),
    maxSources: cfg.maxSources,
    timeoutMs: cfg.timeoutMs,
    ttlDays: cfg.ttlDays,
    defaultMode: cfg.defaultMode,
    allowDomains: cfg.allowDomains,
    denyDomains: cfg.denyDomains,
    maxSearchesPerSession: cfg.maxSearchesPerSession,
    allowPrivateProvider: cfg.allowPrivateProvider,
  };
}
