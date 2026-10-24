/**
 * 讲解风格：纯数据与提示词拼装（可被客户端与服务端共用，不依赖数据库）
 *
 * 这里只有「学生自己怎么描述」+ 三个微调项，不再有预设风格与学科标签：
 * 预设本质上就是一句话的别名，和用户自己的描述放在一起只会互相打架
 * （选了「生活类比」又写「不要用比喻」，模型只能猜）。
 */

export interface TeachingProfile {
  /** 学生希望怎么讲；空字符串表示不额外要求，走默认讲法 */
  directive: string;
  /** 1=只讲关键点，5=完整展开 */
  verbosity: number;
  requireExample: boolean;
  requireCheckQuestion: boolean;
}

export const DEFAULT_TEACHING_PROFILE: TeachingProfile = {
  directive: "",
  verbosity: 3,
  requireExample: false,
  requireCheckQuestion: false,
};

/** 描述长度上限：够写五六条具体要求，又不至于塞爆 system prompt */
export const MAX_TEACHING_DIRECTIVE = 500;

/**
 * 旧版预设 → 一句话描述：老配置里的 preset 在升级后迁移成文字，
 * 避免用户什么都没改、风格却静默失效。
 */
const LEGACY_PRESET_TEXT: Record<string, string> = {
  rigorous: "按「定义 → 条件 → 推导 → 边界」的顺序严谨推导。",
  analogy: "先用日常事物打比方，再回到术语。",
  exam: "先给考点与常见陷阱，再讲原理。",
  socratic: "先提问引导我自己想，不要直接给结论。",
};

export function normalizeTeachingProfile(input: unknown): TeachingProfile {
  const raw = (input ?? {}) as Partial<TeachingProfile> & {
    /** 旧字段：预设风格 */
    preset?: unknown;
    /** 旧字段：学科 */
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

export function isDefaultTeachingProfile(p: TeachingProfile): boolean {
  return (
    !p.directive.trim() &&
    p.verbosity === DEFAULT_TEACHING_PROFILE.verbosity &&
    !p.requireExample &&
    !p.requireCheckQuestion
  );
}

/** 默认风格不注入，避免无谓地改变现有行为与消耗 token */
export function buildTeachingStyleBlock(profile: TeachingProfile): string | null {
  if (isDefaultTeachingProfile(profile)) return null;
  const lines = [
    "【教学风格】以下偏好只在不牺牲准确性与安全性的前提下生效；与事实冲突时以准确性优先。",
  ];
  if (profile.directive.trim()) lines.push(`- 学生希望的讲法：${profile.directive.trim()}`);
  lines.push(
    `- 篇幅：${profile.verbosity}/5（1=只讲关键点，3=讲清思路，5=完整展开并补边界情况；给低分也要把结论说完整）`,
  );
  if (profile.requireExample) lines.push("- 每次讲解至少给一个具体例子或真实数字。");
  if (profile.requireCheckQuestion) {
    lines.push("- 讲完后用一个具体问题检验学生是否跟上，不要只问「懂了吗」。");
  }
  return lines.join("\n");
}