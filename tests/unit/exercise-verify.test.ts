import { describe, expect, it } from "vitest";
import { interpretVerdict, verifyExercise } from "@/lib/ai/exercise-verify";
import { buildAnswerSpec } from "@/lib/learning/exercise";
import type { ExerciseInput } from "@/lib/blocks/schema";

const base = { prompt: "题干" } as const;

describe("题目质量门 · 确定性检查", () => {
  it("重复选项直接判为 failed，不进入模型审校", async () => {
    const input: ExerciseInput = {
      ...base,
      type: "single",
      options: ["机会成本", "机会成本"],
      answer: "0",
    };
    const spec = buildAnswerSpec(input).spec;
    const result = await verifyExercise(input, spec, "s_test");
    expect(result.status).toBe("failed");
    expect(result.problems.join("；")).toContain("重复");
  });
});

describe("题目质量门 · 审校结论映射", () => {
  it("pass 正常放行", () => {
    expect(interpretVerdict({ verdict: "pass" }).status).toBe("passed");
  });
  it("ambiguous 标注但保留题目", () => {
    const r = interpretVerdict({ verdict: "ambiguous", note: "两种口径都能成立", problems: ["口径歧义"] });
    expect(r.status).toBe("ambiguous");
    expect(r.note).toContain("口径");
  });
  it("fail 拒绝交互题", () => {
    const r = interpretVerdict({ verdict: "fail", problems: ["答案键错误"] });
    expect(r.status).toBe("failed");
    expect(r.note).toContain("答案键");
  });
});