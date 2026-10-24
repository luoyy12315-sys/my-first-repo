/**
 * 掌握度回收（审计 4.4-7）：mastered 不是永久徽章。
 * 到期该复习、或连续 90 天没有任何作答，界面状态退回「待复习」，
 * 课程也就不会永久停在 100%。
 */
import { describe, expect, it } from "vitest";
import {
  conceptDisplayStatus,
  courseProgressOf,
  courseStatusOf,
  planProgressOf,
  type ConceptLike,
} from "@/lib/learning/progress";

const DAY = 86400000;
const now = Date.UTC(2026, 9, 24);

const mastered = (over: Partial<ConceptLike> = {}): ConceptLike => ({
  status: "mastered",
  evidenceCount: 5,
  lastStudiedAt: now - DAY,
  nextReviewAt: now + 10 * DAY,
  ...over,
});

describe("已掌握随时间回收", () => {
  it("到期未复测 → 待复习", () => {
    expect(conceptDisplayStatus(mastered({ nextReviewAt: now - DAY }), now)).toBe("review");
  });

  it("复习期未到 → 仍是已掌握", () => {
    expect(conceptDisplayStatus(mastered(), now)).toBe("mastered");
  });

  it("90 天没有任何作答 → 待复习", () => {
    expect(conceptDisplayStatus(mastered({ nextReviewAt: null, lastStudiedAt: now - 100 * DAY }), now)).toBe(
      "review",
    );
    expect(conceptDisplayStatus(mastered({ nextReviewAt: null, lastStudiedAt: now - 10 * DAY }), now)).toBe(
      "mastered",
    );
  });

  it("课程不再因为一次掌握就永久完成", () => {
    const due = mastered({ nextReviewAt: now - DAY });
    expect(courseStatusOf("done", [due], now)).toBe("in_progress");
    expect(courseStatusOf("done", [mastered()], now)).toBe("done");
  });

  it("计划进度按回收后的状态计算", () => {
    const c: ConceptLike[] = [mastered({ nextReviewAt: now - DAY }), { status: "learning", evidenceCount: 1 }];
    const progress = courseProgressOf(c, now);
    expect(progress.mastered).toBe(0);
    // 复习态权重 0.2 + 学习中 0.4，平均 0.3
    expect(progress.percent).toBe(30);

    const plan = planProgressOf([{ status: "in_progress", concepts: c }], now);
    expect(plan.conceptsMastered).toBe(0);
    expect(plan.coursesDone).toBe(0);
  });
});