/**
 * 讲解风格：纯数据与提示词拼装（可被客户端与服务端共用，不依赖数据库）
 */
export const TEACHING_PRESETS = ["balanced", "rigorous", "analogy", "exam", "socratic"] as const;
export type TeachingPreset = (typeof TEACHING_PRESETS)[number];

export const TEACHING_SUBJECTS = ["general", "accounting", "english", "custom"] as const;
export type TeachingSubject = (typeof TEACHING_SUBJECTS)[number];

export interface TeachingProfile {
  preset: TeachingPreset;
  subject: TeachingSubject;
  /** 1=只讲关键点，5=完整展开 */
  verbosity: number;
  requireExample: boolean;
  requireCheckQuestion: boolean;
  customDirective: string;
}

export const DEFAULT_TEACHING_PROFILE: TeachingProfile = {
  preset: "balanced",
  subject: "general",
  verbosity: 3,
  requireExample: false,
  requireCheckQuestion: false,
  customDirective: "",
};

export const PRESET_LABEL: Record<TeachingPreset, string> = {
  balanced: "均衡",
  rigorous: "严谨推导",
  analogy: "生活类比",
  exam: "考点导向",
  socratic: "苏格拉底式",
};

export const PRESET_HINT: Record<TeachingPreset, string> = {
  balanced: "先讲准，再讲透",
  rigorous: "定义 → 条件 → 推导 → 边界",
  analogy: "先用日常事物打比方，再回到术语",
  exam: "先给考点与陷阱，再讲原理",
  socratic: "先提问引导，不直接给结论",
};

export const SUBJECT_LABEL: Record<TeachingSubject, string> = {
  general: "通用",
  accounting: "会计学",
  english: "英语",
  custom: "自定义",
};

const SUBJECT_HINT: Record<TeachingSubject, string> = {
  general: "",
  accounting: "涉及分录时，先讲业务实质，再给借贷方向与科目；数字要能对上。",
  english: "讲解时给中英对照，并指出语法结构与常见中式表达。",
  custom: "",
};

function pick<T extends readonly string[]>(list: T, value: unknown, fallback: T[number]): T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

export function normalizeTeachingProfile(input: unknown): TeachingProfile {
  const raw = (input ?? {}) as Partial<TeachingProfile>;
  const verbosity = Math.min(5, Math.max(1, Math.round(Number(raw.verbosity) || 3)));
  return {
    preset: pick(TEACHING_PRESETS, raw.preset, DEFAULT_TEACHING_PROFILE.preset),
    subject: pick(TEACHING_SUBJECTS, raw.subject, DEFAULT_TEACHING_PROFILE.subject),
    verbosity,
    requireExample: Boolean(raw.requireExample),
    requireCheckQuestion: Boolean(raw.requireCheckQuestion),
    customDirective: typeof raw.customDirective === "string" ? raw.customDirective.trim().slice(0, 500) : "",
  };
}

export function isDefaultTeachingProfile(p: TeachingProfile): boolean {
  return (
    p.preset === DEFAULT_TEACHING_PROFILE.preset &&
    p.subject === DEFAULT_TEACHING_PROFILE.subject &&
    p.verbosity === DEFAULT_TEACHING_PROFILE.verbosity &&
    !p.requireExample &&
    !p.requireCheckQuestion &&
    !p.customDirective
  );
}

/** 默认风格不注入，避免无谓地改变现有行为与消耗 token */
export function buildTeachingStyleBlock(profile: TeachingProfile): string | null {
  if (isDefaultTeachingProfile(profile)) return null;
  const lines = [
    "【教学风格】以下偏好只在不牺牲准确性与安全性的前提下生效；与事实冲突时以准确性优先。",
    `- 风格：${PRESET_LABEL[profile.preset]}（${PRESET_HINT[profile.preset]}）`,
    `- 学科：${SUBJECT_LABEL[profile.subject]}`,
    `- 篇幅：${profile.verbosity}/5（1=只讲关键点，5=完整展开）`,
  ];
  const subjectHint = SUBJECT_HINT[profile.subject];
  if (subjectHint) lines.push(`- 学科要求：${subjectHint}`);
  if (profile.requireExample) lines.push("- 每次讲解至少给一个具体例子或真实数字。");
  if (profile.requireCheckQuestion) lines.push("- 讲完后用一个具体问题检验学生是否跟上，不要只问「懂了吗」。");
  if (profile.customDirective) lines.push(`- 学生自定义偏好：${profile.customDirective}`);
  return lines.join("\n");
}
