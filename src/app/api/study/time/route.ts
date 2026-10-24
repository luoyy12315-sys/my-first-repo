import { addStudySeconds } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";
import { dayKey } from "@/lib/study/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 单次心跳只接受 1~120 秒，异常数值直接丢弃，避免统计被写飞 */
const MAX_SECONDS = 120;

export async function POST(req: Request) {
  try {
    const body = await readJson<{ day?: unknown; seconds?: unknown }>(req);
    const seconds = Number(body.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return fail(400, "seconds 必须是正数");
    if (seconds > MAX_SECONDS) return fail(400, "seconds 超出单次上限");

    // 只认本机今天（前后各留一天，兼容跨零点与轻微时钟偏差）
    const nowMs = Date.now();
    const allowed = new Set([-1, 0, 1].map((offset) => dayKey(nowMs + offset * 86400000)));
    const day = typeof body.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : "";
    if (!day || !allowed.has(day)) return fail(400, "day 不是有效的本地日期");

    addStudySeconds(day, Math.round(seconds));
    return ok({ day, seconds: Math.round(seconds) });
  } catch (e) {
    return handleError(e);
  }
}