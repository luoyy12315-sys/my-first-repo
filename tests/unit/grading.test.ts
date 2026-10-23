import { describe, expect, it } from "vitest";
import { buildAnswerSpec, gradeAnswer, inferErrorType } from "@/lib/learning/exercise";
import type { ExerciseInput } from "@/lib/blocks/schema";

const base = { prompt: "题干" } as const;

function spec(input: ExerciseInput) {
  return buildAnswerSpec(input).spec;
}

describe("判题：单选", () => {
  const s = spec({ ...base, type: "single", options: ["甲", "乙", "丙"], answer: "1" });
  it("选对判正确", () => {
    const r = gradeAnswer("single", s, 1, { usedHint: false });
    expect(r.correct).toBe(true);
    expect(r.score).toBe(1);
  });
  it("选错给出针对性反馈", () => {
    const r = gradeAnswer("single", s, 2, { usedHint: false });
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain("丙");
  });
  it("使用提示时正确也记录提示依赖", () => {
    const r = gradeAnswer("single", s, 1, { usedHint: true });
    expect(r.correct).toBe(true);
    expect(r.feedback).toContain("提示");
  });
});

describe("判题：多选", () => {
  const s = spec({ ...base, type: "multi", options: ["A", "B", "C", "D"], answer: "0,2" });
  it("全对", () => {
    expect(gradeAnswer("multi", s, [0, 2], { usedHint: false }).correct).toBe(true);
  });
  it("漏选提示漏了哪个", () => {
    const r = gradeAnswer("multi", s, [0], { usedHint: false });
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain("漏选");
  });
  it("多选也提示多了哪个", () => {
    const r = gradeAnswer("multi", s, [0, 1, 2], { usedHint: false });
    expect(r.feedback).toContain("多选");
  });
});

describe("判题：填空（归一化与等价答案）", () => {
  const s = spec({
    ...base,
    type: "blank",
    answer: "机会成本|OC||边际",
  });
  it("接受等价写法与全角/空格差异", () => {
    expect(gradeAnswer("blank", s, ["机会 成本", "边际"], { usedHint: false }).correct).toBe(true);
  });
  it("空数不足直接判错", () => {
    const r = gradeAnswer("blank", s, ["机会成本"], { usedHint: false });
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain("2");
  });

  it("短答案不做包含匹配：成本不能判对机会成本", () => {
    const short = spec({ ...base, type: "blank", answer: "机会成本" });
    expect(gradeAnswer("blank", short, ["成本"], { usedHint: false }).correct).toBe(false);
    expect(gradeAnswer("blank", short, ["机会成本"], { usedHint: false }).correct).toBe(true);
  });

  it("accept 提供额外等价写法", () => {
    const s2 = spec({ ...base, type: "blank", answer: "机会成本", accept: ["OC", "opportunity cost"] });
    expect(gradeAnswer("blank", s2, ["OC"], { usedHint: false }).correct).toBe(true);
    expect(gradeAnswer("blank", s2, ["opportunity cost"], { usedHint: false }).correct).toBe(true);
    expect(gradeAnswer("blank", s2, ["成本"], { usedHint: false }).correct).toBe(false);
  });
});

describe("判题：判断/排序/计算/分步骤", () => {
  it("判断题", () => {
    const s = spec({ ...base, type: "judge", answer: "false" });
    expect(gradeAnswer("judge", s, false, { usedHint: false }).correct).toBe(true);
    expect(gradeAnswer("judge", s, true, { usedHint: false }).correct).toBe(false);
  });

  it("排序题定位第一个错位", () => {
    const s = spec({ ...base, type: "order", options: ["一", "二", "三"], answer: "2,0,1" });
    expect(gradeAnswer("order", s, [2, 0, 1], { usedHint: false }).correct).toBe(true);
    const r = gradeAnswer("order", s, [0, 2, 1], { usedHint: false });
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain("第 1 个位置");
  });

  it("计算题按容差判定", () => {
    const s = spec({ ...base, type: "numeric", answer: "3.14159", tolerance: 0.01 });
    expect(gradeAnswer("numeric", s, "3.14", { usedHint: false }).correct).toBe(true);
    expect(gradeAnswer("numeric", s, "3.2", { usedHint: false }).correct).toBe(false);
  });

  it("计算题支持 accept 等价数值", () => {
    const s = spec({ ...base, type: "numeric", answer: "3.14", tolerance: 0.001, accept: ["3.1416"] });
    expect(gradeAnswer("numeric", s, "3.1416", { usedHint: false }).correct).toBe(true);
  });

  it("分步骤给部分分", () => {
    const s = spec({
      ...base,
      type: "steps",
      steps: ["求导", "代入", "化简"],
      answer: "2x||4||4",
    });
    const r = gradeAnswer("steps", s, ["2x", "3", "4"], { usedHint: false });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(2 / 3, 5);
    expect(r.feedback).toContain("第 2 步");
  });

  it("开放题不伪造判定", () => {
    const s = spec({ ...base, type: "open", answer: "要点一", rubric: ["准确性"] });
    const r = gradeAnswer("open", s, "我的回答", { usedHint: false });
    expect(r.graded).toBe(false);
  });
});

describe("答案结构校验", () => {
  it("非法的单选索引会抛错（不会静默变成可交互组件）", () => {
    expect(() => buildAnswerSpec({ ...base, type: "single", options: ["A"], answer: "5" })).toThrow();
  });
  it("排序答案必须是完整排列", () => {
    expect(() =>
      buildAnswerSpec({ ...base, type: "order", options: ["a", "b", "c"], answer: "0,1" }),
    ).toThrow();
  });
});

describe("A1 · 错因推断（只用于怎么教，不参与掌握度）", () => {
  it("多选漏选判为审题遗漏，多选多选判为概念混淆", () => {
    const s = buildAnswerSpec({ ...base, type: "multi", options: ["A", "B", "C"], answer: "0,1" }).spec;
    expect(inferErrorType("multi", s, [0])).toBe("misread");
    expect(inferErrorType("multi", s, [0, 1, 2])).toBe("concept_confusion");
  });

  it("计算题按偏差量级区分计算失误与概念混淆", () => {
    const s = buildAnswerSpec({ ...base, type: "numeric", answer: "1000", tolerance: 1 }).spec;
    expect(inferErrorType("numeric", s, "950")).toBe("calculation");
    expect(inferErrorType("numeric", s, "5")).toBe("concept_confusion");
  });

  it("填空题错判为表述不全，排序列为审题遗漏", () => {
    expect(inferErrorType("blank", buildAnswerSpec({ ...base, type: "blank", answer: "甲" }).spec, ["乙"])).toBe("expression");
    expect(
      inferErrorType("order", buildAnswerSpec({ ...base, type: "order", options: ["a", "b"], answer: "1,0" }).spec, [0, 1]),
    ).toBe("misread");
  });

  it("单选/判断选错时不确定错因，不硬贴概念混淆", () => {
    expect(
      inferErrorType("single", buildAnswerSpec({ ...base, type: "single", options: ["a", "b"], answer: "0" }).spec, 1),
    ).toBeNull();
    expect(inferErrorType("judge", buildAnswerSpec({ ...base, type: "judge", answer: "true" }).spec, false)).toBeNull();
  });

  it("判题结果里带可确定的错因，答对时不带", () => {
    const single = buildAnswerSpec({ ...base, type: "single", options: ["A", "B"], answer: "1" }).spec;
    expect(gradeAnswer("single", single, 0, { usedHint: false }).errorType ?? null).toBeNull();
    expect(gradeAnswer("single", single, 1, { usedHint: false }).errorType).toBeUndefined();

    const multi = buildAnswerSpec({ ...base, type: "multi", options: ["A", "B", "C"], answer: "0,1" }).spec;
    expect(gradeAnswer("multi", multi, [0], { usedHint: false }).errorType).toBe("misread");
    expect(gradeAnswer("multi", multi, [0, 1], { usedHint: false }).errorType).toBeUndefined();
  });
});
