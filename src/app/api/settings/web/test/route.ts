import { isProviderConfigured, resolveWebConfig, type WebConfig, type WebProviderId } from "@/lib/web/config";
import { getProvider, WebProviderError } from "@/lib/web/provider";
import { rankAndDedupe } from "@/lib/web/score";
import { ok, handleError } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 测试用 query：太短的 "test" 在中文搜索里几乎必然零结果，反而误判服务坏了 */
const TEST_QUERY = "人工智能";

interface TestBody {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxSources?: number;
  allowDomains?: string[];
  denyDomains?: string[];
}

const PROVIDERS: WebProviderId[] = ["searxng", "tavily", "brave"];

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * 真实打一次搜索。
 *
 * 支持传入**当前表单里的草稿配置**（还没保存也能测），这样"改了地址点测试"测的就是新地址；
 * 不传就测已保存的配置。只返回结果数与前几条标题/域名，不回显完整响应体。
 */
export async function POST(req: Request) {
  try {
    const saved = resolveWebConfig();
    const body = (await req.json().catch(() => null)) as TestBody | null;
    const draft: WebConfig = body
      ? {
          ...saved,
          provider: PROVIDERS.includes(body.provider as WebProviderId)
            ? (body.provider as WebProviderId)
            : saved.provider,
          baseUrl:
            typeof body.baseUrl === "string"
              ? body.baseUrl.trim().replace(/\/+$/, "")
              : saved.baseUrl,
          // 空 Key 表示"沿用已保存的"，避免用户只改地址时把 Key 清掉
          apiKey:
            typeof body.apiKey === "string" && body.apiKey.trim() && !body.apiKey.includes("****")
              ? body.apiKey.trim()
              : saved.apiKey,
          timeoutMs: clampNum(body.timeoutMs, saved.timeoutMs, 2000, 10000),
          maxSources: clampNum(body.maxSources, saved.maxSources, 1, 5),
          allowDomains: Array.isArray(body.allowDomains) ? body.allowDomains.slice(0, 50) : saved.allowDomains,
          denyDomains: Array.isArray(body.denyDomains) ? body.denyDomains.slice(0, 50) : saved.denyDomains,
        }
      : saved;

    if (!isProviderConfigured(draft)) {
      return ok(
        {
          ok: false,
          code: "WEB_NOT_CONFIGURED",
          message:
            draft.provider === "searxng"
              ? "还差 SearXNG 地址（例如 http://127.0.0.1:8888）"
              : `还差 ${draft.provider === "tavily" ? "Tavily" : "Brave"} 的 API Key`,
        },
        { status: 400 },
      );
    }

    const started = Date.now();
    try {
      const provider = getProvider(draft);
      const raw = await provider.search({
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
        provider: draft.provider,
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