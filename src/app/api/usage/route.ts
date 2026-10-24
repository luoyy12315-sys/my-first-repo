/**
 * 用量统计接口。
 *
 * GET /api/usage?days=30  返回今日 / 本月 / 全部的真实 token 用量与按模型明细
 *
 * 只读 usage_log，不写库；单价与成本估算已按反馈移除（见 docs/AUDIT §11.3），
 * 想算钱拿 token 数乘自己的账单即可，产品里不再维护一份会过期的价格表。
 */

import { z } from "zod";
import { fail, handleError, ok } from "@/lib/api/helpers";
import { usageSummary } from "@/lib/db/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawDays = searchParams.get("days");
    const parsed = querySchema.safeParse(rawDays === null ? {} : { days: rawDays });
    if (!parsed.success) return fail(400, "days 参数需为 1–365 的整数");

    return ok(usageSummary({ days: parsed.data.days }));
  } catch (e) {
    return handleError(e);
  }
}