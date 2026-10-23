import { AiError, type AiConfig } from "./config";
import { streamChat } from "./provider";

export interface ProbeResult {
  ok: boolean;
  code?: string;
  message?: string;
  detail?: string;
  latencyMs: number;
  model: string;
  replyLength?: number;
}

/** 错误详情脱敏：抹掉 URL 与 Key，避免把配置或凭据回显给客户端 */
function sanitize(detail?: string): string | undefined {
  if (!detail) return undefined;
  return detail
    .replace(/https?:\/\/[^\s"']+/g, "[url]")
    .replace(/\b(sk|ak|key)[-_a-zA-Z0-9]{8,}/gi, "[key]")
    .slice(0, 160);
}

/**
 * 真实连通性测试：用这套配置发一次最小请求。
 * 只返回延迟与长度，不回显模型内容——否则这个接口会变成任意地址的读取通道。
 */
export async function probeModel(config: AiConfig, extra?: Partial<AiConfig>): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await streamChat({
      config: { ...config, ...extra, maxTokens: 32, temperature: 0 },
      messages: [
        { role: "system", content: "只回复 OK 两个字母。" },
        { role: "user", content: "ping" },
      ],
    });
    return {
      ok: true,
      latencyMs: Date.now() - started,
      model: config.model,
      replyLength: res.text.length,
    };
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("AI_NETWORK", (e as Error).message);
    return {
      ok: false,
      code: err.code,
      message: err.message,
      detail: sanitize(err.detail),
      latencyMs: Date.now() - started,
      model: config.model,
    };
  }
}
