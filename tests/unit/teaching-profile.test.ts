import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEACHING_PROFILE,
  buildTeachingStyleBlock,
  isDefaultTeachingProfile,
  normalizeTeachingProfile,
} from "@/lib/teaching/profile";
import {
  buildRepresentationBlock,
  normalizeAvoid,
  normalizeRepresentation,
} from "@/lib/teaching/representation";

describe("讲解风格配置", () => {
  it("非法输入回落到默认值", () => {
    const p = normalizeTeachingProfile({ preset: "unknown", subject: 1, verbosity: "abc" });
    expect(p.preset).toBe("balanced");
    expect(p.subject).toBe("general");
    expect(p.verbosity).toBe(3);
  });

  it("篇幅被限制在 1–5", () => {
    expect(normalizeTeachingProfile({ verbosity: 99 }).verbosity).toBe(5);
    expect(normalizeTeachingProfile({ verbosity: -3 }).verbosity).toBe(1);
  });

  it("自定义偏好会裁剪到 500 字", () => {
    const p = normalizeTeachingProfile({ customDirective: `  ${"字".repeat(600)}  ` });
    expect(p.customDirective.length).toBe(500);
  });

  it("默认风格不注入任何提示词", () => {
    expect(isDefaultTeachingProfile(DEFAULT_TEACHING_PROFILE)).toBe(true);
    expect(buildTeachingStyleBlock(DEFAULT_TEACHING_PROFILE)).toBeNull();
  });

  it("非默认风格包含风格、学科、篇幅与自定义要求", () => {
    const block = buildTeachingStyleBlock(
      normalizeTeachingProfile({
        preset: "socratic",
        subject: "accounting",
        verbosity: 2,
        requireExample: true,
        requireCheckQuestion: true,
        customDirective: "先讲业务实质",
      }),
    );
    expect(block).toContain("苏格拉底式");
    expect(block).toContain("会计学");
    expect(block).toContain("2/5");
    expect(block).toContain("具体例子");
    expect(block).toContain("检验学生");
    expect(block).toContain("先讲业务实质");
  });
});

describe("结构化换个讲法", () => {
  it("只接受已知表征", () => {
    expect(normalizeRepresentation("analogy")).toBe("analogy");
    expect(normalizeRepresentation("随便讲讲")).toBeNull();
    expect(normalizeRepresentation(null)).toBeNull();
  });

  it("已用列表去重并过滤非法值", () => {
    expect(normalizeAvoid(["case", "case", "bogus", 1, "contrast"])).toEqual(["case", "contrast"]);
  });

  it("提示词点名本次表征，并要求避开已用表征", () => {
    const block = buildRepresentationBlock("contrast", ["analogy", "case", "contrast"]);
    expect(block).toContain("对比表");
    expect(block).toContain("生活类比");
    expect(block).toContain("具体案例");
    // 本次要用的表征不应出现在"已经用过"里
    expect(block).not.toContain("已经用过：生活类比、具体案例、对比表");
  });
});
