import { aiStatus, maskKey, resolveAiConfig } from "@/lib/ai/config";
import { createAiModel, getDefaultAiModel, listAiModels, updateAiModel } from "@/lib/db/repo";
import { handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 兼容入口。多模型上线后，真正的配置由 /api/models 管理；
 * 这里保留 GET/PUT，只是为了不打断旧调用方（以及环境变量兜底的场景）。
 */
export async function GET() {
  try {
    const cfg = resolveAiConfig();
    return ok({
      ...aiStatus(),
      keyMasked: maskKey(cfg.apiKey),
      temperature: cfg.temperature,
      stored: listAiModels().length > 0,
    });
  } catch (e) {
    return handleError(e);
  }
}

interface Body {
  provider?: "openai" | "anthropic";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
  clearKey?: boolean;
}

/** 写入「默认模型」：已存在则更新，不存在则新建一条 */
export async function PUT(req: Request) {
  try {
    const body = await readJson<Body>(req);
    if (body.baseUrl && !/^https?:\/\//.test(body.baseUrl)) {
      return ok({ error: "Base URL 必须以 http:// 或 https:// 开头" }, { status: 400 });
    }

    const existing = getDefaultAiModel();
    const incomingKey =
      typeof body.apiKey === "string" && body.apiKey.trim() && !body.apiKey.includes("****")
        ? body.apiKey.trim()
        : undefined;

    if (existing) {
      updateAiModel(existing.id, {
        provider: body.provider,
        baseUrl: body.baseUrl?.trim() || undefined,
        model: body.model?.trim() || undefined,
        apiKey: body.clearKey ? "" : incomingKey,
        temperature:
          typeof body.temperature === "number" && body.temperature >= 0 && body.temperature <= 2
            ? body.temperature
            : undefined,
      });
    } else {
      const baseUrl = body.baseUrl?.trim() || "";
      const model = body.model?.trim() || "";
      if (!baseUrl || !model) return ok({ error: "首次配置需要 Base URL 与模型名称" }, { status: 400 });
      createAiModel({
        label: model,
        provider: body.provider === "anthropic" ? "anthropic" : "openai",
        baseUrl,
        model,
        apiKey: body.clearKey ? "" : (incomingKey ?? ""),
        temperature: body.temperature ?? 0.6,
        isDefault: true,
      });
    }

    const cfg = resolveAiConfig();
    return ok({
      ...aiStatus(),
      keyMasked: maskKey(cfg.apiKey),
      temperature: cfg.temperature,
      stored: true,
    });
  } catch (e) {
    return handleError(e);
  }
}
