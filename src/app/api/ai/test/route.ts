import { AiError, aiStatus, resolveAiConfig } from "@/lib/ai/config";
import { probeModel } from "@/lib/ai/test";
import { handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 兼容旧入口：测试「默认模型」。单模型测试请用 /api/models/[id]/test */
export async function POST(req: Request) {
  try {
    const modelId = new URL(req.url).searchParams.get("modelId");
    const status = aiStatus(modelId);
    if (!status.configured) {
      return ok({ ok: false, code: "AI_NOT_CONFIGURED", message: "尚未配置模型服务" }, { status: 400 });
    }
    const cfg = resolveAiConfig(modelId);
    const result = await probeModel(cfg);
    return ok(
      result.ok
        ? { ...result }
        : {
            ...result,
            message: result.message ?? "连接失败",
            // 保持旧字段名，避免调用方失效
            code: result.code ?? "AI_NETWORK",
          },
      { status: 200 },
    );
  } catch (e) {
    if (e instanceof AiError) {
      return ok({ ok: false, code: e.code, message: e.message }, { status: 200 });
    }
    return handleError(e);
  }
}
