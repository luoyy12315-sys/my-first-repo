import { isWebConfigured, resolveWebConfig, webEndpointLabel, type WebConfig } from "@/lib/web/config";
import { searchWeb, WebProviderError } from "@/lib/web/provider";
import { rankAndDedupe } from "@/lib/web/score";
import { ok, handleError } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 测试用 query：太短的 "test" 在中文搜索里几乎必然零结果，反而误判服务坏了 */
const TEST_QUERY = "人工智能";

interface TestBody {
  endpoint?: string;
  method?: "GET" | "POST";
  apiKey?: string;
  authHeader?: string;
  queryParam?: string;
  bodyTemplate?: string;
  resultsPath?: string;
  titleField?: string;
  urlField?: string;
  snippetField?: string;
  timeoutMs?: number;
  maxSources?: number;
  allowDomains?: string[];
  denyDomains?: string[];
}

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

/**
 * 真实打一次搜索。
 *
 * 支持传入**当前表单里的草稿配置**（还没保存也能测），这样"改了地址点测试"测的就是新地址；
 * 不传就测已保存的配置。只返回结果数与前几条标题/域名，不回显响应体。
 */
export async function POST(req: Request) {
  try {
    const saved = resolveWebConfig();
    const body = (await req.json().catch(() => null)) as TestBody | null;
    const draft: WebConfig = body
      ? {
          ...saved,
          endpoint: pickStr(body.endpoint, saved.endpoint).trim().replace(/\/+$/, ""),
          method: body.method === "POST" ? "POST" : body.method === "GET" ? "GET" : saved.method,
          // 空 Key / 空认证头表示"沿用已保存的"，避免用户只改地址时把凭据清掉
          apiKey:
            typeof body.apiKey === "string" && body.apiKey.trim() && !body.apiKey.includes("****")
              ? body.apiKey.trim()
              : saved.apiKey,
          authHeader:
            typeof body.authHeader === "string" && body.authHeader.trim() && !body.authHeader.includes("****")
              ? body.authHeader.trim()
              : saved.authHeader,
          queryParam: pickStr(body.queryParam, saved.queryParam) || saved.queryParam,
          bodyTemplate: pickStr(body.bodyTemplate, saved.bodyTemplate),
          resultsPath: pickStr(body.resultsPath, saved.resultsPath).trim(),
          titleField: pickStr(body.titleField, saved.titleField).trim(),
          urlField: pickStr(body.urlField, saved.urlField).trim(),
          snippetField: pickStr(body.snippetField, saved.snippetField).trim(),
          timeoutMs: clampNum(body.timeoutMs, saved.timeoutMs, 2000, 10000),
          maxSources: clampNum(body.maxSources, saved.maxSources, 1, 5),
          allowDomains: Array.isArray(body.allowDomains) ? body.allowDomains.slice(0, 50) : saved.allowDomains,
          denyDomains: Array.isArray(body.denyDomains) ? body.denyDomains.slice(0, 50) : saved.denyDomains,
        }
      : saved;

    if (!isWebConfigured(draft)) {
      return ok(
        {
          ok: false,
          code: "WEB_NOT_CONFIGURED",
          message: "还差搜索接口地址（要填完整 URL，例如 https://api.example.com/search）",
        },
        { status: 400 },
      );
    }

    const started = Date.now();
    try {
      const raw = await searchWeb(draft, {
        query: TEST_QUERY,
        maxResults: 5,
        timeoutMs: draft.timeoutMs,
      });
      const ranked = rankAndDedupe(raw, TEST_QUERY, draft, draft.maxSources);
      return ok({
        ok: true,
        latencyMs: Date.now() - started,
        count: ranked.length,
        rawCount: raw.length,
        endpoint: webEndpointLabel(draft),
        // 只给出前 3 条标题与域名，够判断"通不通、结果对不对"
        results: ranked.slice(0, 3).map((r) => ({
          title: String(r.title ?? "").slice(0, 100),
          url: (() => {
            try {
              return new URL(r.url).hostname;
            } catch {
              return String(r.url ?? "").slice(0, 60);
            }
          })(),
        })),
      });
    } catch (e) {
      const err = e instanceof WebProviderError ? e : new WebProviderError("WEB_NETWORK", (e as Error).message);
      return ok(
        {
          ok: false,
          code: err.code,
          message: err.message,
          latencyMs: Date.now() - started,
        },
        { status: 200 },
      );
    }
  } catch (e) {
    return handleError(e);
  }
}