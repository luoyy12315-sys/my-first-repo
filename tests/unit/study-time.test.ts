import { describe, expect, it } from "vitest";
import { dayKey, formatStudyDuration, monthKey, summarizeStudyTime, weekKey } from "@/lib/study/time";

/** 本地时间构造：避免 UTC 偏移把"今天"算错 */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).getTime();

describe("学习时长聚合", () => {
  it("空数据时不造假：总时长 0、连续 0 天、柱子全 0", () => {
    const s = summarizeStudyTime([], at(2026, 10, 24));
    expect(s.totalSeconds).toBe(0);
    expect(s.studyDays).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.todaySeconds).toBe(0);
    expect(s.days).toHaveLength(14);
    expect(s.days.every((b) => b.seconds === 0)).toBe(true);
    expect(s.weeks).toHaveLength(8);
    expect(s.months).toHaveLength(6);
  });

  it("日视图是最近 14 天，按天累加、标签是日期数字", () => {
    const now = at(2026, 10, 24);
    const s = summarizeStudyTime(
      [
        { day: "2026-10-24", seconds: 600 },
        { day: "2026-10-23", seconds: 300 },
        { day: "2026-10-01", seconds: 120 },
      ],
      now,
    );
    expect(s.days).toHaveLength(14);
    expect(s.days[13].key).toBe("2026-10-24");
    expect(s.days[13].seconds).toBe(600);
    expect(s.days[12].seconds).toBe(300);
    expect(s.todaySeconds).toBe(600);
    expect(s.totalSeconds).toBe(1020);
    expect(s.studyDays).toBe(3);
    // 10-01 不在最近 14 天里，但计入总数
    expect(s.days.some((b) => b.key === "2026-10-01")).toBe(false);
  });

  it("周视图按周一归档，月视图按自然月归档", () => {
    // 2026-10-24 是周六；该周周一为 2026-10-19
    const now = at(2026, 10, 24);
    const s = summarizeStudyTime(
      [
        { day: "2026-10-19", seconds: 100 }, // 周一
        { day: "2026-10-25", seconds: 200 }, // 周日
        { day: "2026-09-30", seconds: 400 },
      ],
      now,
    );
    const week = s.weeks.find((b) => b.key === "2026-10-19");
    expect(week?.seconds).toBe(300);
    expect(s.weeks.at(-1)?.key).toBe("2026-10-19");
    const oct = s.months.find((b) => b.key === "2026-10");
    expect(oct?.seconds).toBe(300);
    const sep = s.months.find((b) => b.key === "2026-09");
    expect(sep?.seconds).toBe(400);
  });

  it("连续天数：今天没学但从昨天往前连续，仍算连上", () => {
    const now = at(2026, 10, 24);
    const s = summarizeStudyTime(
      [
        { day: "2026-10-23", seconds: 60 },
        { day: "2026-10-22", seconds: 60 },
        { day: "2026-10-20", seconds: 60 }, // 断了一天
      ],
      now,
    );
    expect(s.streak).toBe(2);
  });

  it("今天学了就从今天开始数连续", () => {
    const now = at(2026, 10, 24);
    const s = summarizeStudyTime(
      [
        { day: "2026-10-24", seconds: 60 },
        { day: "2026-10-23", seconds: 60 },
        { day: "2026-10-22", seconds: 60 },
      ],
      now,
    );
    expect(s.streak).toBe(3);
  });

  it("本地日期 key 与周/月 key 都用本机时区", () => {
    const ms = at(2026, 1, 5, 23); // 周一晚
    expect(dayKey(ms)).toBe("2026-01-05");
    expect(weekKey(ms)).toBe("2026-01-05");
    expect(monthKey(ms)).toBe("2026-01");
  });
});

describe("时长文案", () => {
  it("不足一小时按分钟，整小时不写 0 分", () => {
    expect(formatStudyDuration(0)).toBe("0 分");
    expect(formatStudyDuration(59)).toBe("0 分");
    expect(formatStudyDuration(60)).toBe("1 分");
    expect(formatStudyDuration(25 * 60)).toBe("25 分");
    expect(formatStudyDuration(60 * 60)).toBe("1 小时");
    expect(formatStudyDuration(80 * 60)).toBe("1 小时 20 分");
  });
});