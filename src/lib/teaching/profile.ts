/**
 * 讲解风格：纯数据与提示词拼装（可被客户端与服务端共用，不依赖数据库）
 *
 * 每个"自定义风格"就是一张卡片：名字 + 你希望我怎么讲 + 篇幅 + 两个选项。
 * 同一时间只有一个风格生效（使用中），没有生效风格时按默认讲法，不注入任何提示词。
 * 不再有内置预设与学科标签：预设只是把一句话起了个名字，反而和用户自己的描述打架。
 */

export interface StyleFields {
  /** 学生希望怎么讲；空字符串表示这一项不额外要求 */
  directive: string;
  /** 1=只讲关键点，5=完整展开 */
  verbosity: number;
  requireExample: boolean;
  requireCheckQuestion: boolean;
}

export interface TeachingStyle extends StyleFields {
  id: string;
  name: string;
}

export const MAX_TEACHING_STYLES = 8;
export const MAX_STYLE_NAME = 20;
/** 描述长度上限：够写五六条具体要求，又不至于塞爆 system prompt */
export const MAX_TEACHING_DIRECTIVE = 500;

export const DEFAULT_STYLE_FIELDS: StyleFields = {
  directive: "",
  verbosity: 3,
  requireExample: false,
  requireCheckQuestion: false,
};

/**
 * 旧版预设 → 一句话描述：升级后把老 `teaching_profile` 迁移成一个风格，
 * 避免用户什么都没改、风格却静默失效。
 */
const LEGACY_PRESET_TEXT: Record<string, string> = {
  rigorous: "按「定义 → 条件 → 推导 → 边界」的顺序严谨推导。",
  analogy: "先用日常事物打比方，再回到术语。",
  exam: "先给考点与常见陷阱，再讲原理。",
  socratic: "先提问引导我自己想，不要直接给结论。",
};

export function normalizeStyleFields(input: unknown): StyleFields {
  const raw = (input ?? {}) as Partial<StyleFields> & {
    /** 旧字段：预设风格 */
    preset?: unknown;
    /** 旧字段：学科（已下线，仅用于迁移判断） */
    subject?: unknown;
    /** 旧字段：自定义偏好 */
    customDirective?: unknown;
  };
  const verbosity = Math.min(5, Math.max(1, Math.round(Number(raw.verbosity) || 3)));

  const legacyCustom = typeof raw.customDirective === "string" ? raw.customDirective.trim() : "";
  const legacyPreset =
    typeof raw.preset === "string" && raw.preset !== "balanced"
      ? (LEGACY_PRESET_TEXT[raw.preset] ?? "")
      : "";
  const directive = (
    typeof raw.directive === "string" ? raw.directive : legacyCustom || legacyPreset
  )
    .trim()
    .slice(0, MAX_TEACHING_DIRECTIVE);

  return {
    directive,
    verbosity,
    requireExample: Boolean(raw.requireExample),
    requireCheckQuestion: Boolean(raw.requireCheckQuestion),
  };
}

/** 迁移专用：老配置（单份 profile）→ 一个风格的内容 */
export function normalizeLegacyProfile(input: unknown): StyleFields {
  return normalizeStyleFields(input);
}

export function isDefaultStyleFields(f: StyleFields): boolean {
  return (
    !f.directive.trim() &&
    f.verbosity === DEFAULT_STYLE_FIELDS.verbosity &&
    !f.requireExample &&
    !f.requireCheckQuestion
  );
}

/** 归一化一个风格（补 id / 名字），用于读写两侧 */
export function normalizeTeachingStyle(input: unknown, fallbackIndex = 1): TeachingStyle {
  const raw = (input ?? {}) as Partial<TeachingStyle>;
  const name = (typeof raw.name === "string" ? raw.name.trim() : "").slice(0, MAX_STYLE_NAME);
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "",
    name: name || `风格 ${fallbackIndex}`,
    ...normalizeStyleFields(raw),
  };
}

/** 卡片列表上的一行摘要 */
export function styleSummary(style: StyleFields): string {
  const parts = [`篇幅 ${style.verbosity}/5`];
  if (style.requireExample) parts.push("必须举例");
  if (style.requireCheckQuestion) parts.push("讲完提问");
  // 只有"什么都没设"才叫默认讲法；只勾了选项就不是默认
  if (isDefaultStyleFields(style)) parts.push("默认讲法");
  return parts.join(" · ");
}

/** 默认内容不注入，避免无谓地改变现有行为与消耗 token */
export function buildTeachingStyleBlock(fields: StyleFields): string | null {
  if (isDefaultStyleFields(fields)) return null;
  const lines = [
    "【教学风格】以下偏好只在不牺牲准确性与安全性的前提下生效；与事实冲突时以准确性优先。",
  ];
  if (fields.directive.trim()) lines.push(`- 学生希望的讲法：${fields.directive.trim()}`);
  lines.push(
    `- 篇幅：${fields.verbosity}/5（1=只讲关键点，3=讲清思路，5=完整展开并补边界情况；给低分也要把结论说完整）`,
  );
  if (fields.requireExample) lines.push("- 每次讲解至少给一个具体例子或真实数字。");
  if (fields.requireCheckQuestion) {
    lines.push("- 讲完后用一个具体问题检验学生是否跟上，不要只问「懂了吗」。");
  }
  return lines.join("\n");
}