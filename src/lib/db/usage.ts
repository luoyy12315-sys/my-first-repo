/**
 * usage_log 的只读聚合查询。
 *
 * 背景：usage_log 之前只写不读，用户看不到真实的 token 消耗、耗时和失败次数。
 * 这里只做 select，不写库、不改表结构；写入仍由 repo.ts 的 logUsage 负责。
 * 数据访问统一走 getDb()，不依赖 repo.ts 里的其它函数，避免并行改动互相牵连。
 */

import { getDb } from "@/lib/db";

export interface UsageBucket {
  /** 调用次数（含失败） */
  calls: number;
  okCalls: number;
  failedCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /**
   * 成功调用的平均耗时（毫秒）。
   * 没有成功样本时为 null——UI 必须显示 "—"，不能除零得到 NaN。
   */
  avgLatencyMs: number | null;
}

export interface UsageModelRow extends UsageBucket {
  /** 原始 model 字段；老数据可能为空字符串，UI 显示「未知模型」 */
  model: string;
  lastUsedAt: number | null;
}

export interface UsageSummary {
  generatedAt: number;
  /** byModel 明细的统计窗口（天） */
  days: number;
  today: UsageBucket;
  month: UsageBucket;
  all: UsageBucket;
  byModel: UsageModelRow[];
}

/** 每条 usage_log 汇总出来的原始列 */
interface AggregateRow {
  calls: number;
  okCalls: number;
  failedCalls: number;
  promptTokens: number;
  completionTokens: number;
  latencySum: number;
  latencyCount: number;
}

/** 三个时间窗口共用同一套聚合表达式，避免口径漂移 */
const AGGREGATE_COLUMNS = `
  count(*) as calls,
  coalesce(sum(case when ok = 1 then 1 else 0 end), 0) as okCalls,
  coalesce(sum(case when ok = 0 then 1 else 0 end), 0) as failedCalls,
  coalesce(sum(coalesce(prompt_tokens, 0)), 0) as promptTokens,
  coalesce(sum(coalesce(completion_tokens, 0)), 0) as completionTokens,
  coalesce(sum(case when ok = 1 and latency_ms > 0 then latency_ms else 0 end), 0) as latencySum,
  coalesce(sum(case when ok = 1 and latency_ms > 0 then 1 else 0 end), 0) as latencyCount
`;

const BUCKET_SQL = `select ${AGGREGATE_COLUMNS} from usage_log where created_at >= ?`;

const MODEL_SQL = `
  select
    ${AGGREGATE_COLUMNS},
    coalesce(nullif(trim(model), ''), '') as model,
    max(created_at) as lastUsedAt
  from usage_log
  where created_at >= ?
  group by model
  order by calls desc, lastUsedAt desc
  limit 50
`;

function toBucket(row: AggregateRow | undefined): UsageBucket {
  const calls = Number(row?.calls ?? 0);
  const promptTokens = Number(row?.promptTokens ?? 0);
  const completionTokens = Number(row?.completionTokens ?? 0);
  const latencyCount = Number(row?.latencyCount ?? 0);
  const latencySum = Number(row?.latencySum ?? 0);
  return {
    calls,
    okCalls: Number(row?.okCalls ?? 0),
    failedCalls: Number(row?.failedCalls ?? 0),
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
  };
}

/** 本地时区的今天 0 点。用本地时间而不是 SQLite 的 UTC，避免"今日"差 8 小时。 */
function startOfLocalDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 本地时区的本月 1 号 0 点 */
function startOfLocalMonth(at: number): number {
  const d = new Date(at);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 汇总今日 / 本月 / 全部用量，并按模型拆分最近 N 天明细。
 * 纯读：不写 usage_log，也不写 settings。
 */
export function usageSummary(opts: { days?: number; now?: number } = {}): UsageSummary {
  const db = getDb();
  const at = typeof opts.now === "number" && Number.isFinite(opts.now) ? opts.now : Date.now();
  const days = Math.min(365, Math.max(1, Math.round(opts.days ?? 30)));

  const bucket = db.prepare(BUCKET_SQL);
  const todayStart = startOfLocalDay(at);
  const monthStart = startOfLocalMonth(at);
  const modelStart = at - days * 24 * 60 * 60 * 1000;

  const today = toBucket(bucket.get(todayStart) as AggregateRow | undefined);
  const month = toBucket(bucket.get(monthStart) as AggregateRow | undefined);
  // created_at 是正数毫秒时间戳，>= 0 即等价于全表
  const all = toBucket(bucket.get(0) as AggregateRow | undefined);

  const modelRows = db.prepare(MODEL_SQL).all(modelStart) as Array<
    AggregateRow & { model: string | null; lastUsedAt: number | null }
  >;

  const byModel: UsageModelRow[] = modelRows.map((row) => ({
    model: row.model ?? "",
    lastUsedAt: typeof row.lastUsedAt === "number" ? row.lastUsedAt : null,
    ...toBucket(row),
  }));

  return {
    generatedAt: at,
    days,
    today,
    month,
    all,
    byModel,
  };
}