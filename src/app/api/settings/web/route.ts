import { isProviderConfigured, maskKey, resolveWebConfig, webStatus, type WebProviderId } from "@/lib/web/config";
import { clearWebCache, webCacheRows, webStats } from "@/lib/web/cache";
import { setJsonSetting } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ ...webStatus(), stats: webStats(7), cacheRows: webCacheRows() });
  } catch (e) {
    return handleError(e);
  }
}

interface Body {
  enabled?: boolean;
  provider?: WebProviderId;
  baseUrl?: string;
  apiKey?: string;
  clearKey?: boolean;
  maxSources?: number;
  timeoutMs?: number;
  ttlDays?: number;
  defaultMode?: "off" | "manual";
  allowDomains?: string[];
  denyDomains?: string[];
  maxSearchesPerSession?: number;
}

function cleanList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export async function PUT(req: Request) {
  try {
    const body = await readJson<Body>(req);
    const prev = resolveWebConfig();

    if (body.baseUrl !== undefined && body.baseUrl.trim()) {
      const v = body.baseUrl.trim();
      if (!/^https?:\/\//i.test(v)) return fail(400, "Base URL 必须以 http:// 或 https:// 开头");
      try {
        new URL(v);
      } catch {
        return fail(400, "Base URL 格式不正确");
      }
    }

    const next = {
      ...prev,
      enabled: typeof body.enabled === "boolean" ? body.enabled : prev.enabled,
      provider:
        body.provider && ["searxng", "tavily", "brave"].includes(body.provider)
          ? body.provider
          : prev.provider,
      baseUrl: body.baseUrl === undefined ? prev.baseUrl : body.baseUrl.trim().replace(/\/+$/, ""),
      apiKey: body.clearKey
        ? ""
        : typeof body.apiKey === "string" && body.apiKey.trim() && !body.apiKey.includes("****")
          ? body.apiKey.trim()
          : prev.apiKey,
      maxSources: typeof body.maxSources === "number" ? body.maxSources : prev.maxSources,
      timeoutMs: typeof body.timeoutMs === "number" ? body.timeoutMs : prev.timeoutMs,
      ttlDays: typeof body.ttlDays === "number" ? body.ttlDays : prev.ttlDays,
      defaultMode: body.defaultMode === "manual" ? "manual" : body.defaultMode === "off" ? "off" : prev.defaultMode,
      allowDomains: cleanList(body.allowDomains) ?? prev.allowDomains,
      denyDomains: cleanList(body.denyDomains) ?? prev.denyDomains,
      maxSearchesPerSession:
        typeof body.maxSearchesPerSession === "number"
          ? body.maxSearchesPerSession
          : prev.maxSearchesPerSession,
    };

    // 打开联网但没有可用 provider，等于给用户一个必然失败的开关
    if (next.enabled && !isProviderConfigured(next)) {
      return fail(400, "启用联网前先配置搜索服务（SearXNG 地址或 API Key）");
    }

    setJsonSetting("web_config", next);
    const status = webStatus();
    return ok({
      ...status,
      keyMasked: maskKey(resolveWebConfig().apiKey),
      stats: webStats(7),
      cacheRows: webCacheRows(),
    });
  } catch (e) {
    return handleError(e);
  }
}

/** 维护动作：目前只有清空检索缓存 */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ action?: string }>(req);
    if (body.action !== "clearCache") return fail(400, "未知操作");
    const removed = clearWebCache();
    return ok({ removed, cacheRows: webCacheRows(), stats: webStats(7) });
  } catch (e) {
    return handleError(e);
  }
}