export type ConceptStatus =
  | "untouched" // 尚未接触
  | "learning" // 正在学习
  | "needs_work" // 需要巩固
  | "initial" // 有初步掌握证据
  | "mastered"; // 暂时掌握

export const STATUS_LABEL: Record<ConceptStatus, string> = {
  untouched: "尚未接触",
  learning: "正在学习",
  needs_work: "需要巩固",
  initial: "有初步掌握证据",
  mastered: "暂时掌握",
};

export const STATUS_ORDER: ConceptStatus[] = [
  "untouched",
  "learning",
  "needs_work",
  "initial",
  "mastered",
];

export type ExerciseType =
  | "single"
  | "multi"
  | "blank"
  | "judge"
  | "order"
  | "numeric"
  | "steps"
  | "open";

export const EXERCISE_TYPE_LABEL: Record<ExerciseType, string> = {
  single: "单选",
  multi: "多选",
  blank: "填空",
  judge: "判断",
  order: "排序",
  numeric: "计算",
  steps: "分步骤",
  open: "开放题",
};

/** 错因分类（A1）：只用于决定"怎么教"，不参与掌握度计算 */
export type ErrorType =
  | "concept_confusion"
  | "calculation"
  | "misread"
  | "expression"
  | "knowledge_gap";

export const ERROR_LABEL: Record<ErrorType, string> = {
  concept_confusion: "概念混淆",
  calculation: "计算失误",
  misread: "审题遗漏",
  expression: "表述不全",
  knowledge_gap: "知识缺口",
};

export type FeedbackVote = "easy" | "hard" | "broken";

export type BlockKind =
  | "chart"
  | "table"
  | "steps"
  | "exercise"
  | "quiz"
  | "simulator"
  | "note"
  | "fallback";

export interface MessagePart {
  type: "text" | "block" | "notice";
  text?: string;
  blockId?: string;
  kind?: BlockKind;
  notice?: string;
}

/** 一条回答引用的来源：本地材料片段或网络结果 */
export interface SourceDTO {
  /** 渲染用的短 id：'m1' | 'w1' */
  id: string;
  kind: "material" | "web";
  title: string;
  url?: string | null;
  domain?: string | null;
  publishedAt?: number | null;
  retrievedAt: number;
  snippet?: string | null;
  stale?: boolean;
  meta?: Record<string, unknown> | null;
}

export interface MessageDTO {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts: MessagePart[];
  status: "streaming" | "done" | "error";
  error?: string | null;
  /** 产出这条回答的模型（多模型下用于区分） */
  model?: string | null;
  /** 本条回答引用的来源（材料 / 网络） */
  sources?: SourceDTO[];
  createdAt: number;
  seq: number;
}

export interface BlockDTO {
  id: string;
  sessionId: string;
  messageId?: string | null;
  kind: BlockKind;
  title?: string | null;
  payload: Record<string, unknown>;
  state: Record<string, unknown>;
  status: "ready" | "error";
  createdAt: number;
}

export interface ExercisePublic {
  id: string;
  blockId: string | null;
  sessionId: string;
  conceptId: string | null;
  conceptName?: string | null;
  type: ExerciseType;
  prompt: string;
  options: string[];
  blanks: number;
  steps: string[];
  unit?: string | null;
  difficulty: number;
  /** 已作答次数（用于 UI 展示"第 n 次"） */
  attemptCount?: number;
  /** 是否已存在正确作答 */
  solved?: boolean;
  /** 出题二次校验结果；只有 passed 的题目才计入掌握度 */
  verification: "passed" | "ambiguous" | "unverified";
  verificationNote?: string | null;
}

export interface AttemptDTO {
  id: string;
  exerciseId: string;
  isCorrect: boolean | null;
  score: number | null;
  maxScore: number;
  feedback: string;
  correctAnswerDisplay?: string | null;
  usedHint: boolean;
  viewedSolution: boolean;
  correctDisplay?: string | null;
  explanation?: string | null;
  errorType?: ErrorType | null;
  attemptNo: number;
  createdAt: number;
  graded?: boolean;
}

export interface SessionSummary {
  id: string;
  title: string;
  mode: "free" | "goal" | "review";
  /** 本会话固定使用的模型配置；null 表示跟随默认 */
  modelId?: string | null;
  /** 归属的学习计划（计划即“目标”）；null 表示未归类 */
  planId?: string | null;
  planTitle?: string | null;
  updatedAt: number;
  messageCount: number;
  summary?: string | null;
  resumeHint?: string | null;
  focusConceptId?: string | null;
  reviewItemId?: string | null;
  focusConceptName?: string | null;
  topics: { id: string; name: string }[];
}

export interface ConceptDTO {
  id: string;
  topicId: string;
  topicName: string;
  name: string;
  definition?: string | null;
  status: ConceptStatus;
  pMastery: number;
  evidenceCount: number;
  independentCorrect: number;
  hintUses: number;
  wrongStreak: number;
  distinctExercises: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  nextReviewAt?: number | null;
  lastStudiedAt?: number | null;
  /** 是否已经讲解/出题接触过；不等于有作答证据 */
  introducedAt?: number | null;
  prerequisites: { id: string; name: string; status: ConceptStatus }[];
}

export interface EvidenceDTO {
  id: string;
  correct: boolean | null;
  score: number | null;
  independent: boolean;
  hintUsed: boolean;
  voided: boolean;
  voidReason?: string | null;
  note?: string | null;
  createdAt: number;
  exerciseType?: ExerciseType | null;
  prompt?: string | null;
}

export interface TodayPlan {
  kind: "review" | "weak" | "continue" | "empty";
  title: string;
  reason: string;
  minutes: number;
  conceptId?: string | null;
  reviewItemId?: string | null;
  sessionId?: string | null;
  planId?: string | null;
  planTitle?: string | null;
}

export interface ReviewItemDTO {
  id: string;
  conceptId: string;
  conceptName: string;
  topicName: string;
  planId: string | null;
  planTitle: string | null;
  reason: string;
  priority: number;
  dueAt: number | null;
  status: string;
  createdAt: number;
}

export interface PlanItemDTO {
  id: string;
  planId: string;
  title: string;
  rationale?: string | null;
  conceptId?: string | null;
  conceptName?: string | null;
  conceptStatus?: ConceptStatus | null;
  /** 本步已独立答对的不同知识点数量（未看解析、未用提示） */
  verifiedConcepts?: number;
  /** 本步自动完成所需的不同知识点数量 */
  requiredConcepts?: number;
  verifiedConceptNames?: string[];
  orderIndex: number;
  status: "pending" | "in_progress" | "done" | "skipped";
}

export interface PlanDTO {
  id: string;
  goalId: string | null;
  title: string;
  note: string | null;
  status: string;
  createdAt: number;
  items: PlanItemDTO[];
  progress: { done: number; total: number };
  counts: { sessions: number; materials: number; reviews: number };
}

export interface MaterialDTO {
  id: string;
  name: string;
  mime: string | null;
  size: number;
  status: "parsed" | "failed" | "unsupported";
  textChars: number;
  error?: string | null;
  planId: string | null;
  planTitle: string | null;
  createdAt: number;
  chunks: number;
}

/** 联网检索配置（Key 只在服务端） */
export interface WebConfigPublic {
  enabled: boolean;
  provider: "searxng" | "tavily" | "brave";
  baseUrl: string;
  configured: boolean;
  keyMasked: string;
  maxSources: number;
  timeoutMs: number;
  ttlDays: number;
  defaultMode: "off" | "manual";
  allowDomains: string[];
  denyDomains: string[];
  maxSearchesPerSession: number;
  allowPrivateProvider: boolean;
}

export interface AiStatus {
  configured: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  /** 用户给这套配置起的名字；环境变量兜底时为模型名 */
  label?: string;
  /** 当前使用的模型配置 id；环境变量兜底时为 null */
  modelId?: string | null;
  source: "env" | "settings" | "none";
  reason?: string;
}

/** 多模型配置（对外脱敏形态，绝不含明文 Key） */
export interface AiModelPublic {
  id: string;
  label: string;
  provider: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  temperature: number;
  isDefault: boolean;
  configured: boolean;
  keyMasked: string;
  lastOkAt: number | null;
  lastTestMs: number | null;
  lastError: string | null;
}
