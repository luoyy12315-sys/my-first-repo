import { describe, expect, it } from "vitest";
import {
  DEFAULT_STYLE_FIELDS,
  MAX_STYLE_NAME,
  MAX_TEACHING_STYLES,
  buildTeachingStyleBlock,
  isDefaultStyleFields,
  normalizeStyleFields,
  normalizeTeachingStyle,
  styleSummary,
} from "@/lib/teaching/profile";
import {
  buildRepresentationBlock,
  normalizeAvoid,
  normalizeRepresentation,
} from "@/lib/teaching/representation";

describe("讲解风格配置", () => {
  it("非法输入回落到默认值", () => {
    const p = normalizeStyleFields({ directive: 1, verbosity: "abc" });
    expect(p.directive).toBe("");
    expect(p.verbosity).toBe(3);
    expect(isDefaultStyleFields(p)).toBe(true);
  });

  it("篇幅被限制在 1–5", () => {
    expect(normalizeStyleFields({ verbosity: 99 }).verbosity).toBe(5);
    expect(normalizeStyleFields({ verbosity: -3 }).verbosity).toBe(1);
  });

  it("描述会去掉首尾空白并裁剪到上限", () => {
    const p = normalizeStyleFields({ directive: `  ${"字".repeat(600)}  ` });
    expect(p.directive.length).toBe(500);
    expect(p.directive.startsWith("字")).toBe(true);
  });

  it("旧的预设字段会迁移成一句话描述，不静默丢失", () => {
    const p = normalizeStyleFields({ preset: "socratic", subject: "accounting", customDirective: "" });
    expect(p.directive).toContain("提问");
    const block = buildTeachingStyleBlock(p);
    expect(block).toContain("学生希望的讲法");
    // 学科已随预设一起下线，不再注入
    expect(block).not.toContain("会计学");
  });

  it("默认风格不注入任何提示词", () => {
    expect(isDefaultStyleFields(DEFAULT_STYLE_FIELDS)).toBe(true);
    expect(buildTeachingStyleBlock(DEFAULT_STYLE_FIELDS)).toBeNull();
    expect(buildTeachingStyleBlock(normalizeStyleFields({}))).toBeNull();
  });

  it("非默认风格包含描述、篇幅与微调要求", () => {
    const block = buildTeachingStyleBlock(
      normalizeStyleFields({
        directive: "先讲业务实质，再给借贷方向",
        verbosity: 2,
        requireExample: true,
        requireCheckQuestion: true,
      }),
    );
    expect(block).toContain("先讲业务实质");
    expect(block).toContain("2/5");
    expect(block).toContain("具体例子");
    expect(block).toContain("检验学生");
  });

  it("风格卡片补齐 id 与名字，名字超长会被裁剪", () => {
    const s = normalizeTeachingStyle({ name: "名".repeat(50), directive: "先给结论" }, 2);
    expect(s.name.length).toBe(MAX_STYLE_NAME);
    expect(s.id).toBe("");
    expect(s.directive).toBe("先给结论");

    const fallback = normalizeTeachingStyle({}, 3);
    expect(fallback.name).toBe("风格 3");
  });

  it("摘要同时给出篇幅与两个选项", () => {
    expect(styleSummary({ ...DEFAULT_STYLE_FIELDS, verbosity: 2, requireExample: true })).toBe(
      "篇幅 2/5 · 必须举例",
    );
    expect(styleSummary(DEFAULT_STYLE_FIELDS)).toBe("篇幅 3/5 · 默认讲法");
  });

  it("风格数量上限是有限值，避免无限堆积", () => {
    expect(MAX_TEACHING_STYLES).toBeGreaterThan(1);
    expect(MAX_TEACHING_STYLES).toBeLessThanOrEqual(20);
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