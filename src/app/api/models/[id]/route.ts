import { listModelProfiles, resolveAiConfig } from "@/lib/ai/config";
import { deleteAiModel, getAiModel, updateAiModel } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = getAiModel(id);
    if (!row) return fail(404, "模型配置不存在");
    // 只回脱敏后的信息：明文 Key 永不出服务端
    const pub = listModelProfiles().find((m) => m.id === id);
    return ok({ model: pub });
  } catch (e) {
    return handleError(e);
  }
}

interface PatchBody {
  label?: string;
  provider?: "openai" | "anthropic";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  clearKey?: boolean;
  temperature?: number;
  isDefault?: boolean;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const prev = getAiModel(id);
    if (!prev) return fail(404, "模型配置不存在");
    const body = await readJson<PatchBody>(req);

    if (body.baseUrl !== undefined) {
      const v = body.baseUrl.trim();
      if (!/^https?:\/\//i.test(v)) return fail(400, "Base URL 必须以 http:// 或 https:// 开头");
      try {
        new URL(v);
      } catch {
        return fail(400, "Base URL 格式不正确");
      }
    }
    if (body.model !== undefined && !body.model.trim()) return fail(400, "模型名称不能为空");

    // 只接受"看起来是真实新 Key"的输入：带 **** 的是脱敏回显，忽略
    const incomingKey =
      typeof body.apiKey === "string" && body.apiKey.trim() && !body.apiKey.includes("****")
        ? body.apiKey.trim()
        : undefined;

    const updated = updateAiModel(id, {
      label: body.label?.trim() || undefined,
      provider: body.provider === "anthropic" ? "anthropic" : body.provider === "openai" ? "openai" : undefined,
      baseUrl: body.baseUrl,
      model: body.model?.trim(),
      apiKey: body.clearKey ? "" : incomingKey,
      temperature:
        typeof body.temperature === "number" && body.temperature >= 0 && body.temperature <= 2
          ? body.temperature
          : undefined,
      isDefault: body.isDefault,
    });

    return ok({ model: listModelProfiles().find((m) => m.id === updated?.id), models: listModelProfiles() });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const res = deleteAiModel(id);
    if (!res.deleted) return fail(404, "模型配置不存在");
    const models = listModelProfiles();
    return ok({
      deleted: true,
      promotedId: res.promotedId,
      models,
      // 删除后如果还有别的配置，说明当前默认是谁
      defaultModel: models.find((m) => m.isDefault)?.label ?? null,
      // 侧信道校验：确认剩下的默认配置仍然可用
      fallbackUsable: resolveAiConfig().source !== "none",
    });
  } catch (e) {
    return handleError(e);
  }
}
