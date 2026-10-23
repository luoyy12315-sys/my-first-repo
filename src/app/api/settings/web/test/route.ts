import { isProviderConfigured, resolveWebConfig } from "@/lib/web/config";
import { getProvider, WebProviderError } from "@/lib/web/provider";
import { rankAndDedupe } from "@/lib/web/score";
import { ok, handleError } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 真实打一次搜索：只返回结果数与延迟，不回显响应体（避免把这里当读取通道） */
export async function POST() {
  try {
    const cfg = resolveWebConfig();
    if (!isProviderConfigured(cfg)) {
      return ok({ ok: false, code: "WEB_NOT_CONFIGURED", message: "尚未配置搜索服务" }, { status: 400 });
    }
    const started = Date.now();
    try {
      const provider = getProvider(cfg);
      const raw = await provider.search({ query: "test", maxResults: 5, timeoutMs: cfg.timeoutMs });
      const ranked = rankAndDedupe(raw, "test", cfg, cfg.maxSources);
      return ok({
        ok: true,
        latencyMs: Date.now() - started,
        count: ranked.length,
        rawCount: raw.length,
        provider: cfg.provider,
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
