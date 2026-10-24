import type { StudyTimeBucket, StudyTimeSummary } from "@/lib/types";

/** 本地日 key（YYYY-MM-DD）。学习时长按用户本机的"今天"归档，跨时区不会错位 */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 周一作为一周开始 */
export function weekKey(ms: number): string {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7; // 周一=0
  d.setDate(d.getDate() - shift);
  return dayKey(d.getTime());
}

export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}

/** 日 key → 显示用的短标签，比如 8；月 → 10 月 */
function dayLabel(key: string): string {
  return String(Number(key.slice(8, 10)));
}

const WEEKDAY_LABELS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];

function monthLabel(key: string): string {
  return `${Number(key.slice(5, 7))} 月`;
}

/** 往前推 n 个自然日（含今天） */
function lastDays(nowMs: number, n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const base = new Date(nowMs);
  base.setHours(12, 0, 0, 0);
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const key = dayKey(d.getTime());
    out.push({ key, label: dayLabel(key) });
  }
  return out;
}

/** 本周七天：星期一 → 星期日 */
function currentWeek(nowMs: number): { key: string; label: string }[] {
  const monday = new Date(nowMs);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return WEEKDAY_LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return { key: dayKey(d.getTime()), label };
  });
}

/** 今年 1–12 月（未来的月份先留空，图表里不会画出柱子） */
function currentYearMonths(nowMs: number): { key: string; label: string }[] {
  const year = new Date(nowMs).getFullYear();
  return Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${`${i + 1}`.padStart(2, "0")}`;
    return { key, label: monthLabel(key) };
  });
}

/** 把「日 → 秒」的行聚合成日/周/月三档，并算出总时长、学习天数、连续天数 */
export function summarizeStudyTime(
  rows: { day: string; seconds: number }[],
  nowMs: number,
): StudyTimeSummary {
  const byDay = new Map<string, number>();
  let totalSeconds = 0;
  let studyDays = 0;
  for (const r of rows) {
    if (!r.seconds) continue;
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.seconds);
    totalSeconds += r.seconds;
    studyDays += 1;
  }

  const bucket = (key: string, label: string): StudyTimeBucket => ({
    key,
    label,
    seconds: byDay.get(key) ?? 0,
  });

  const today = dayKey(nowMs);
  const days = lastDays(nowMs, 14).map((b) => bucket(b.key, b.label));
  const week = currentWeek(nowMs).map((b) => bucket(b.key, b.label));
  // 月是按日期前缀汇总（1–12 月），不是按某一天的 key 取值
  const monthTotals = new Map<string, number>();
  for (const [day, seconds] of byDay) {
    const mk = day.slice(0, 7);
    monthTotals.set(mk, (monthTotals.get(mk) ?? 0) + seconds);
  }
  const months = currentYearMonths(nowMs).map((b) => ({
    key: b.key,
    label: b.label,
    seconds: monthTotals.get(b.key) ?? 0,
  }));

  // 连续学习天数：从今天（或昨天，今天还没学也算连上）往前数
  let streak = 0;
  const start = new Date(nowMs);
  start.setHours(12, 0, 0, 0);
  if (!byDay.get(dayKey(start.getTime()))) start.setDate(start.getDate() - 1);
  for (;;) {
    if (!byDay.get(dayKey(start.getTime()))) break;
    streak += 1;
    start.setDate(start.getDate() - 1);
  }

  return {
    totalSeconds,
    studyDays,
    streak,
    days,
    week,
    months,
    todaySeconds: byDay.get(today) ?? 0,
  };
}

/** 秒数 → 人话：0 分 / 25 分 / 1 小时 20 分 / 12 小时 */
export function formatStudyDuration(seconds: number): string {
  const mins = Math.floor((seconds || 0) / 60);
  if (mins < 60) return `${mins} 分`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}