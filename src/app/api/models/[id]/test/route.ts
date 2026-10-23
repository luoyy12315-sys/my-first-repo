import { resolveAiConfig } from "@/lib/ai/config";
import { probeModel } from "@/lib/ai/test";
import { getAiModel, recordAiModelTest } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 测试某套模型配置是否真的可用。
 * 支持"未保存先测"：body 里带 baseUrl/model/apiKey 时用它测，不写库。
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = getAiModel(id);
    if (!row) return fail(404, "模型配置不存在");

    const body = await readJson<{
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      provider?: "openai" | "anthropic";
    }>(req).catch(() => ({}) as Record<string, never>);

    const cfg = resolveAiConfig(id);
    const override: Partial<typeof cfg> = {};
    if (body.baseUrl?.trim()) override.baseUrl = body.baseUrl.trim().replace(/\/+$/, "");
    if (body.model?.trim()) override.model = body.model.trim();
    if (body.provider === "anthropic" || body.provider === "openai") override.provider = body.provider;
    // 脱敏回显不当作新 Key；留空表示沿用已保存的 Key
    if (body.apiKey?.trim() && !body.apiKey.includes("****")) override.apiKey = body.apiKey.trim();

    const result = await probeModel(cfg, override);

    // 只有"用已保存配置测"才写回状态，避免临时输入的 Key 污染记录
    const usedSaved = !override.baseUrl && !override.model && !override.apiKey && !override.provider;
    if (usedSaved) {
      recordAiModelTest(id, result.ok, result.latencyMs, result.ok ? null : result.message);
    }

    return ok({ ...result, persisted: usedSaved });
  } catch (e) {
    return handleError(e);
  }
}
