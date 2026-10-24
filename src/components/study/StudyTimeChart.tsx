"use client";

import { useState } from "react";
import { cx } from "@/components/ui/kit";
import { formatStudyDuration } from "@/lib/study/time";
import type { StudyTimeBucket, StudyTimeSummary } from "@/lib/types";

type Range = "day" | "week" | "month" | "total";

const RANGES: { key: Range; label: string }[] = [
  { key: "day", label: "日" },
  { key: "week", label: "周" },
  { key: "month", label: "月" },
  { key: "total", label: "总" },
];

/** 不足一分钟不算"学过"：不画柱子，避免随便点两下就凭空冒出一条 */
const MIN_VISIBLE_SECONDS = 60;

/** 柱状图：不引图表库，用 flex + 高度百分比 */
function Bars({ buckets }: { buckets: StudyTimeBucket[] }) {
  const max = Math.max(MIN_VISIBLE_SECONDS, ...buckets.map((b) => b.seconds));
  return (
    <div className="flex h-full min-h-24 items-end gap-1">
      {buckets.map((b) => {
        const active = b.seconds >= MIN_VISIBLE_SECONDS;
        const h = active ? Math.max(4, Math.round((b.seconds / max) * 100)) : 0;
        return (
          <div key={b.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div
              className={cx("w-full rounded-[3px] transition-colors", active ? "bg-accent/75 hover:bg-accent" : "")}
              style={{ height: `${h}%` }}
              title={`${b.key} · ${formatStudyDuration(b.seconds)}`}
              aria-label={`${b.key} 学习 ${formatStudyDuration(b.seconds)}`}
            />
            <span className="text-[10px] leading-none text-ink3">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function StudyTimeChart({ time }: { time: StudyTimeSummary }) {
  const [range, setRange] = useState<Range>("day");
  const buckets = range === "week" ? time.week : range === "month" ? time.months : time.days;
  const empty = !time.totalSeconds;

  return (
    <section className="flex h-full flex-col rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium text-ink">学习时间</h2>
        <div className="flex items-center gap-0.5 rounded-full bg-panel2 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={cx(
                "rounded-full px-2.5 py-1 text-[11.5px] transition-colors",
                range === r.key ? "bg-panel text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink3 hover:text-ink2",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-1 flex-col justify-end">
        {range === "total" ? (
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="font-serif text-[26px] leading-none tracking-tight text-ink">
                {formatStudyDuration(time.totalSeconds)}
              </div>
              <div className="mt-1.5 text-[12px] text-ink3">累计学习</div>
            </div>
            <dl className="flex items-end gap-5 text-right">
              <div>
                <dt className="text-[11px] text-ink3">今天</dt>
                <dd className="mt-0.5 text-[13px] text-ink">{formatStudyDuration(time.todaySeconds)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink3">学习天数</dt>
                <dd className="mt-0.5 text-[13px] text-ink">{time.studyDays} 天</dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink3">连续</dt>
                <dd className="mt-0.5 text-[13px] text-ink">{time.streak} 天</dd>
              </div>
            </dl>
          </div>
        ) : empty ? (
          <p className="py-8 text-center text-[12.5px] text-ink3">还没有学习记录，开始一次对话就会自动计时</p>
        ) : (
          <Bars buckets={buckets} />
        )}
      </div>

      {range !== "total" && !empty ? (
        <p className="mt-2 text-[11.5px] text-ink3">
          今天 {formatStudyDuration(time.todaySeconds)} · 累计 {formatStudyDuration(time.totalSeconds)} · 连续{" "}
          {time.streak} 天
        </p>
      ) : null}
    </section>
  );
}