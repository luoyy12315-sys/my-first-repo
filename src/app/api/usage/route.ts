/**
 * 用量统计接口。
 *
 * GET  /api/usage?days=30  返回今日 / 本月 / 全部的真实 token 用量与按模型明细
 * PUT  /api/usage          保存本地单价配置（每百万 token 的输入 / 输出单价）
 *
 * 单价只是用户自己填的本地配置，不内置任何厂商价格：没填就返回 null，
 * 由前端显示 "—"，不拿编造的数字去估成本。
 */

import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";
import { getDb, now } from "@/lib/db";
import { USAGE_PRICING_KEY, getUsagePricing, usageSummary } from "@/lib/db/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const pricingBodySchema = z.object({
  // null 表示明确清空；undefined 表示这次不改
  inputPerMTok: z.number().finite().min(0).max(1_000_000).nullable().optional(),
  outputPerMTok: z.number().finite().min(0).max(1_000_000).nullable().optional(),
  currency: z.enum(["CNY", "USD"]).optional(),
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

export async function PUT(req: Request) {
  try {
    const body = await readJson<unknown>(req);
    const parsed = pricingBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, "单价需为 0–1000000 之间的数字（每百万 token），留空表示未填写");
    }

    const prev = getUsagePricing();
    const pricing = {
      inputPerMTok: parsed.data.inputPerMTok === undefined ? prev.inputPerMTok : parsed.data.inputPerMTok,
      outputPerMTok:
        parsed.data.outputPerMTok === undefined ? prev.outputPerMTok : parsed.data.outputPerMTok,
      currency: parsed.data.currency ?? prev.currency,
    };

    // 只写 settings 的一行配置，不动表结构
    getDb()
      .prepare(
        "insert into settings (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at",
      )
      .run(USAGE_PRICING_KEY, JSON.stringify(pricing), now());

    return ok({ pricing });
  } catch (e) {
    return handleError(e);
  }
}