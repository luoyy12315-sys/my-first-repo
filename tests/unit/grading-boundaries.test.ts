/**
 * 判题边界：空提交、判断题兜底、数值容差、填空归一化。
 *
 * 这些用例对应审计 P1-2 / P1-3：
 *  - 判断题 "answer=null/空串" 曾被兜底成 false，导致"正确答案是错"时空提交判对
 *  - Number("") = 0 让空答案变成 0
 *  - 1% 容差对百万级答案等于允许 ±1 万
 *  - 填空只做文本归一，"1000.00" ≠ "1000"、"50%" ≠ "50"
 */
import { describe, expect, it } from "vitest";
import { buildAnswerSpec, gradeAnswer, numericTolerance } from "@/lib/learning/exercise";
import type { ExerciseInput } from "@/lib/blocks/schema";

const base = { prompt: "题干" } as const;
const spec = (input: ExerciseInput) => buildAnswerSpec(input).spec;

describe("空提交不是答错，也不产生证据", () => {
  const judgeFalse = spec({ ...base, type: "judge", answer: "false" });

  it("判断题：null / 空串 / undefined 都不判对", () => {
    for (const empty of [null, "", "   ", undefined]) {
      const r = gradeAnswer("judge", judgeFalse, empty, { usedHint: false });
      expect(r.graded).toBe(false);
      expect(r.correct).toBe(false);
    }
  });

  it("判断题：认不出的文本不兜底成 false", () => {
    const r = gradeAnswer("judge", judgeFalse, "说不好", { usedHint: false });
    expect(r.graded).toBe(false);
    expect(r.feedback).toContain("对 / 错");
  });

  it("判断题：正常布尔与中英文写法仍可判定", () => {
    expect(gradeAnswer("judge", judgeFalse, false, { usedHint: false }).correct).toBe(true);
    expect(gradeAnswer("judge", judgeFalse, "错", { usedHint: false }).correct).toBe(true);
    expect(gradeAnswer("judge", judgeFalse, true, { usedHint: false }).correct).toBe(false);
  });

  it("单选：空串不会被当成选项 0", () => {
    const s = spec({ ...base, type: "single", options: ["甲", "乙"], answer: "0" });
    const r = gradeAnswer("single", s, "", { usedHint: false });
    expect(r.graded).toBe(false);
    expect(r.correct).toBe(false);
  });

  it("多选：空数组是未作答", () => {
    const s = spec({ ...base, type: "multi", options: ["A", "B"], answer: "0" });
    expect(gradeAnswer("multi", s, [], { usedHint: false }).graded).toBe(false);
  });

  it("计算题：空串不会被解析成 0", () => {
    const s = spec({ ...base, type: "numeric", answer: "0" });
    expect(gradeAnswer("numeric", s, "", { usedHint: false }).graded).toBe(false);
    expect(gradeAnswer("numeric", s, "0", { usedHint: false }).correct).toBe(true);
  });
});

describe("数值容差", () => {
  it("默认相对 0.1%，并对大数设绝对上限", () => {
    expect(numericTolerance(100)).toBeCloseTo(0.1, 6);
    // 百万级答案：0.1% 是 1000，但被上限压到 1，避免"差一万也算对"
    expect(numericTolerance(1_000_000)).toBe(1);
  });

  it("百万级答案不再接受 1% 偏差", () => {
    const s = spec({ ...base, type: "numeric", answer: "1000000" });
    expect(gradeAnswer("numeric", s, "1000000.5", { usedHint: false }).correct).toBe(true);
    expect(gradeAnswer("numeric", s, "1001500", { usedHint: false }).correct).toBe(false);
  });

  it("显式 tolerance 依然优先", () => {
    const s = spec({ ...base, type: "numeric", answer: "3.14159", tolerance: 0.01 });
    expect(gradeAnswer("numeric", s, "3.14", { usedHint: false }).correct).toBe(true);
  });

  it("千分位、全角、百分号都能解析", () => {
    const s = spec({ ...base, type: "numeric", answer: "1,000" });
    expect(gradeAnswer("numeric", s, "１０００", { usedHint: false }).correct).toBe(true);
    expect(gradeAnswer("numeric", s, "1000.00", { usedHint: false }).correct).toBe(true);
    const pct = spec({ ...base, type: "numeric", answer: "50%" });
    expect(gradeAnswer("numeric", pct, "50", { usedHint: false }).correct).toBe(true);
  });
});

describe("填空归一化", () => {
  it("数值等价写法可判对，纯文本答案仍走文本规则", () => {
    const s = spec({ ...base, type: "blank", answer: "1000" });
    expect(gradeAnswer("blank", s, ["1000.00"], { usedHint: false }).correct).toBe(true);
    expect(gradeAnswer("blank", s, ["1,000"], { usedHint: false }).correct).toBe(true);
    expect(gradeAnswer("blank", s, ["1000.5"], { usedHint: false }).correct).toBe(false);
  });

  it("百分号与全角数字（[答案 50%] [学生 50]）", () => {
    const s = spec({ ...base, type: "blank", answer: "50%" });
    expect(gradeAnswer("blank", s, ["50"], { usedHint: false }).correct).toBe(true);
    const wide = spec({ ...base, type: "blank", answer: "1000" });
    expect(gradeAnswer("blank", wide, ["１０００"], { usedHint: false }).correct).toBe(true);
  });

  it("短文本答案仍不做包含匹配", () => {
    const s = spec({ ...base, type: "blank", answer: "机会成本" });
    expect(gradeAnswer("blank", s, ["成本"], { usedHint: false }).correct).toBe(false);
  });
});