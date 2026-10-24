import { isWebConfigured, maskKey, resolveWebConfig, webStatus } from "@/lib/web/config";
import { clearWebCache, webCacheRows, webStats } from "@/lib/web/cache";
import { applyTemplate } from "@/lib/web/provider";
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
  endpoint?: string;
  method?: "GET" | "POST";
  apiKey?: string;
  clearKey?: boolean;
  authHeader?: string;
  clearAuth?: boolean;
  queryParam?: string;
  bodyTemplate?: string;
  resultsPath?: string;
  titleField?: string;
  urlField?: string;
  snippetField?: string;
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

/** 请求体模板占位符替换后必须是合法 JSON，否则保存了就一定失败 */
function templateError(template: string): string | null {
  if (!template.trim()) return null;
  const filled = applyTemplate(template, { query: "测试", maxResults: "5", apiKey: "test" });
  try {
    JSON.parse(filled);
    return null;
  } catch (e) {
    return `请求体模板替换占位符后不是合法 JSON：${(e as Error).message}`;
  }
}

export async function PUT(req: Request) {
  try {
    const body = await readJson<Body>(req);
    const prev = resolveWebConfig();

    if (body.endpoint !== undefined && body.endpoint.trim()) {
      const v = body.endpoint.trim();
      if (!/^https?:\/\//i.test(v)) return fail(400, "接口地址必须以 http:// 或 https:// 开头");
      try {
        new URL(v);
      } catch {
        return fail(400, "接口地址格式不正确");
      }
    }

    const method = body.method === "POST" ? "POST" : body.method === "GET" ? "GET" : prev.method;
    const bodyTemplate = typeof body.bodyTemplate === "string" ? body.bodyTemplate.trim() : prev.bodyTemplate;
    if (method === "POST") {
      const err = templateError(bodyTemplate);
      if (err) return fail(400, err);
    }

    const next = {
      ...prev,
      enabled: typeof body.enabled === "boolean" ? body.enabled : prev.enabled,
      endpoint:
        body.endpoint === undefined ? prev.endpoint : body.endpoint.trim().replace(/\/+$/, ""),
      method,
      apiKey: body.clearKey
        ? ""
        : typeof body.apiKey === "string" && body.apiKey.trim() && !body.apiKey.includes("****")
          ? body.apiKey.trim()
          : prev.apiKey,
      // 空字符串表示"不改"，要清空请用 clearAuth（前端有按钮）
      authHeader: body.clearAuth
        ? ""
        : typeof body.authHeader === "string" && body.authHeader.trim() && !body.authHeader.includes("****")
          ? body.authHeader.trim()
          : prev.authHeader,
      queryParam:
        typeof body.queryParam === "string" && body.queryParam.trim()
          ? body.queryParam.trim().slice(0, 50)
          : prev.queryParam,
      bodyTemplate,
      resultsPath: typeof body.resultsPath === "string" ? body.resultsPath.trim().slice(0, 200) : prev.resultsPath,
      titleField: typeof body.titleField === "string" ? body.titleField.trim().slice(0, 100) : prev.titleField,
      urlField: typeof body.urlField === "string" ? body.urlField.trim().slice(0, 100) : prev.urlField,
      snippetField:
        typeof body.snippetField === "string" ? body.snippetField.trim().slice(0, 100) : prev.snippetField,
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

    // 打开联网但没有接口地址，等于给用户一个必然失败的开关
    if (next.enabled && !isWebConfigured(next)) {
      return fail(400, "启用联网前先填搜索接口地址");
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