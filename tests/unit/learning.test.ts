import { describe, expect, it } from "vitest";
import { applyEvidence, bktStep, defaultParams, deriveStatus, type ConceptState } from "@/lib/learning/mastery";
import { scheduleNext, reviewGradeFromAttempt } from "@/lib/learning/scheduler";
import { evaluateExpression, validateExpression } from "@/lib/learning/expr";
import { extractQueryTerms } from "@/lib/db/repo";

const empty: ConceptState = {
  status: "untouched",
  pMastery: 0.1,
  evidenceCount: 0,
  independentCorrect: 0,
  hintUses: 0,
  wrongStreak: 0,
  distinctExercises: 0,
  lastStudiedAt: null,
};

describe("BKT 知识追踪", () => {
  it("答对提升掌握概率，答错降低", () => {
    const p = defaultParams("single");
    const up = bktStep(0.3, true, p);
    const down = bktStep(0.3, false, p);
    expect(up).toBeGreaterThan(0.3);
    expect(down).toBeLessThan(0.3);
  });

  it("无证据时状态为尚未接触", () => {
    expect(deriveStatus(empty, "untouched").status).toBe("untouched");
  });

  it("单次答对不足以判定暂时掌握", () => {
    const out = applyEvidence(empty, { correct: true, score: 1, independent: true, hintUsed: false, exerciseId: "e1", type: "single" }, 1);
    expect(out.next.status).not.toBe("mastered");
  });

  it("多次独立正确 + 多道不同题才可能掌握", () => {
    let s = empty;
    let t = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const r = applyEvidence(
        s,
        { correct: true, score: 1, independent: true, hintUsed: false, exerciseId: `e${i}`, type: "single" },
        (t += 1000),
        seen,
      );
      s = r.next;
      seen.add(`e${i}`);
    }
    expect(s.status).toBe("mastered");
    expect(s.distinctExercises).toBe(4);
  });

  it("同一道题重复答对不会堆出掌握度", () => {
    let s = empty;
    for (let i = 0; i < 5; i++) {
      s = applyEvidence(
        s,
        { correct: true, score: 1, independent: true, hintUsed: false, exerciseId: "same", type: "single" },
        1000 * (i + 1),
      ).next;
    }
    expect(s.distinctExercises).toBe(1);
    expect(s.status).not.toBe("mastered");
  });

  it("查看解析后作答不计入证据", () => {
    const out = applyEvidence(empty, { correct: true, score: 1, independent: false, hintUsed: false, exerciseId: "e1", type: "single" }, 1);
    expect(out.countedForMastery).toBe(false);
    expect(out.next.status).toBe("untouched");
    expect(out.next.pMastery).toBe(empty.pMastery);
  });

  it("使用提示获得的正确，掌握度提升弱于独立正确", () => {
    const noHint = applyEvidence(empty, { correct: true, score: 1, independent: true, hintUsed: false, exerciseId: "e1", type: "single" }, 1).next;
    const withHint = applyEvidence(empty, { correct: true, score: 1, independent: true, hintUsed: true, exerciseId: "e1", type: "single" }, 1).next;
    expect(noHint.pMastery).toBeGreaterThan(withHint.pMastery);
    expect(withHint.independentCorrect).toBe(0);
    expect(withHint.hintUses).toBe(1);
  });

  it("连续答错进入需要巩固", () => {
    let s = empty;
    s = applyEvidence(s, { correct: false, score: 0, independent: true, hintUsed: false, exerciseId: "e1", type: "single" }, 1).next;
    s = applyEvidence(s, { correct: false, score: 0, independent: true, hintUsed: false, exerciseId: "e2", type: "single" }, 2).next;
    expect(s.status).toBe("needs_work");
  });

  it("已掌握后出错会降级待复测", () => {
    const mastered: ConceptState = { ...empty, status: "mastered", pMastery: 0.9, independentCorrect: 5, distinctExercises: 5, evidenceCount: 5 };
    const out = applyEvidence(mastered, { correct: false, score: 0, independent: true, hintUsed: false, exerciseId: "e9", type: "single" }, 10);
    expect(out.next.status).toBe("initial");
  });
});

describe("复习调度", () => {
  it("答错缩短间隔，答对延长", () => {
    const base = { stability: 3, difficulty: 5, reps: 2, lapses: 0 };
    const good = scheduleNext(base, "good", 0);
    const again = scheduleNext(base, "again", 0);
    expect(good.intervalDays).toBeGreaterThan(again.intervalDays);
    expect(again.lapses).toBe(1);
  });
  it("间隔有上下界", () => {
    const r = scheduleNext({ stability: 9999, difficulty: 1, reps: 9, lapses: 0 }, "easy", 0);
    expect(r.intervalDays).toBeLessThanOrEqual(180);
  });
  it("由作答推断复习等级", () => {
    expect(reviewGradeFromAttempt({ correct: false, usedHint: false })).toBe("again");
    expect(reviewGradeFromAttempt({ correct: true, usedHint: true })).toBe("hard");
    expect(reviewGradeFromAttempt({ correct: true, usedHint: false })).toBe("good");
    expect(reviewGradeFromAttempt({ correct: true, usedHint: false, durationMs: 3000 })).toBe("easy");
  });
});

describe("安全表达式求值（模拟器）", () => {
  it("基本运算与优先级", () => {
    expect(evaluateExpression("1 + 2 * 3")).toBe(7);
    expect(evaluateExpression("(1 + 2) * 3")).toBe(9);
    expect(evaluateExpression("2 ^ 3 ^ 2")).toBe(512);
  });
  it("函数与常量", () => {
    expect(evaluateExpression("sqrt(16) + abs(-2)")).toBe(6);
    expect(evaluateExpression("sin(pi / 2)")).toBeCloseTo(1, 10);
  });
  it("变量代入", () => {
    expect(evaluateExpression("P * (1 + r) ^ n", { P: 1000, r: 0.1, n: 2 })).toBeCloseTo(1210, 6);
  });
  it("拒绝未知变量与函数（不执行任意代码）", () => {
    expect(() => evaluateExpression("process.exit(1)")).toThrow();
    expect(() => evaluateExpression("require('fs')")).toThrow();
    expect(() => evaluateExpression("alert(1)")).toThrow();
    expect(validateExpression("1 / 0", {}).ok).toBe(false);
  });
});

describe("材料检索词抽取（引用能否触发的前提）", () => {
  it("去掉虚词后仍能命中主题词", () => {
    const terms = extractQueryTerms("根据我的材料，讲讲机会成本是什么");
    expect(terms.some((t) => t.includes("机会成本"))).toBe(true);
    expect(terms).not.toContain("根据我的材料");
    expect(terms).not.toContain("讲讲机会成本是什么");
  });

  it("长片段会补 2 字窗口，短问题保持原样", () => {
    const long = extractQueryTerms("请解释一下边际效用递减规律的含义");
    expect(long.some((t) => t.length === 2)).toBe(true);
    expect(extractQueryTerms("复利")).toEqual(["复利"]);
  });

  it("纯虚词没有可用检索词", () => {
    expect(extractQueryTerms("请帮我")).toHaveLength(0);
  });

  it("长词排在前面（权重更高）", () => {
    const terms = extractQueryTerms("讲讲机会成本的定义");
    expect(terms[0].length).toBeGreaterThanOrEqual(4);
  });
});
