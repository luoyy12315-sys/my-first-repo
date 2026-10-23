import { listModelProfiles } from "@/lib/ai/config";
import { createAiModel, listAiModels } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({
      models: listModelProfiles(),
      // 明文 Key 绝不下发，这里只给"有没有配"的布尔
      hasAnyConfigured: listAiModels().some((m) => Boolean(m.apiKey && m.model)),
    });
  } catch (e) {
    return handleError(e);
  }
}

interface Body {
  label?: string;
  provider?: "openai" | "anthropic";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
  isDefault?: boolean;
}

/** 后端校验：Base URL 必须可解析且为 http(s)，防止把内网地址当配置乱传 */
function validateBaseUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Base URL 不能为空";
  if (!/^https?:\/\//i.test(v)) return "Base URL 必须以 http:// 或 https:// 开头";
  try {
    new URL(v);
  } catch {
    return "Base URL 格式不正确";
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Body>(req);
    const baseUrl = (body.baseUrl ?? "").trim();
    const model = (body.model ?? "").trim();
    const err = validateBaseUrl(baseUrl);
    if (err) return fail(400, err);
    if (!model) return fail(400, "模型名称不能为空");

    const provider = body.provider === "anthropic" ? "anthropic" : "openai";
    const apiKey = (body.apiKey ?? "").trim();
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(baseUrl);
    if (!apiKey && !isLocal) return fail(400, "远端模型必须填写 API Key");

    const created = createAiModel({
      label: (body.label ?? "").trim() || model,
      provider,
      baseUrl,
      model,
      apiKey,
      temperature:
        typeof body.temperature === "number" && body.temperature >= 0 && body.temperature <= 2
          ? body.temperature
          : 0.6,
      isDefault: body.isDefault,
    });

    return ok({ model: created.id, models: listModelProfiles() }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
