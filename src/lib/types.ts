export type ConceptStatus =
  | "untouched" // 尚未接触
  | "learning" // 正在学习
  | "needs_work" // 需要巩固 / 待复习
  | "initial" // 有初步掌握证据
  | "mastered"; // 已掌握

/** 普通界面统一使用这四种状态；initial/learning 都显示为「学习中」 */
export type ConceptDisplayStatus = "todo" | "learning" | "review" | "mastered";

export const DISPLAY_STATUS_LABEL: Record<ConceptDisplayStatus, string> = {
  todo: "待学习",
  learning: "学习中",
  review: "待复习",
  mastered: "已掌握",
};

export const DISPLAY_STATUS_ORDER: ConceptDisplayStatus[] = [
  "todo",
  "learning",
  "review",
  "mastered",
];

/** 内部状态的历史文案；普通列表请用 DISPLAY_STATUS_LABEL */
export const STATUS_LABEL: Record<ConceptStatus, string> = {
  untouched: "待学习",
  learning: "学习中",
  needs_work: "待复习",
  initial: "学习中",
  mastered: "已掌握",
};

export const STATUS_ORDER: ConceptStatus[] = [
  "untouched",
  "learning",
  "needs_work",
  "initial",
  "mastered",
];

export type LearningMode = "infinite" | "goal" | "review";
export type PlanStatus = "draft" | "active" | "paused";
export type CourseStatus = "pending" | "in_progress" | "done" | "skipped" | "unconfigured";

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
  mode: LearningMode;
  /** 本会话固定使用的模型配置；null 表示跟随默认 */
  modelId?: string | null;
  /** 归属的学习计划；null 表示无限学习或未归类 */
  planId?: string | null;
  planTitle?: string | null;
  planItemId?: string | null;
  courseTitle?: string | null;
  updatedAt: number;
  /** 侧栏置顶时间戳；null / undefined 表示未置顶 */
  pinnedAt?: number | null;
  messageCount: number;
  summary?: string | null;
  resumeHint?: string | null;
  focusConceptId?: string | null;
  reviewItemId?: string | null;
  focusConceptName?: string | null;
  topics: { id: string; name: string }[];
}

/** 全局搜索的一条结果 */
export interface SearchHit {
  id: string;
  title: string;
  meta: string;
  href: string;
  at?: number;
}

/** 全局搜索的分组（对话 / 计划 / 知识点 / 材料） */
export interface SearchGroup {
  key: "sessions" | "plans" | "concepts" | "materials";
  label: string;
  hits: SearchHit[];
}

export interface ConceptDTO {
  id: string;
  topicId: string;
  topicName: string;
  name: string;
  definition?: string | null;
  status: ConceptStatus;
  /** 普通界面用的四态显示 */
  displayStatus: ConceptDisplayStatus;
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
  /** 唯一所属课程（计划步骤）；null 表示尚未归属，普通界面标为待整理 */
  courseId?: string | null;
  courseTitle?: string | null;
  planId?: string | null;
  planTitle?: string | null;
  prerequisites: { id: string; name: string; status: ConceptStatus }[];
}

export interface EvidenceDTO {
  id: string;
  correct: boolean | null;
  score: number | null;
  independent: boolean;
  hintUsed: boolean;
  /** 0 表示保留审计但不计入掌握度（例如查看解析后作答） */
  weight: number;
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
  courseId?: string | null;
  courseTitle?: string | null;
}

/** 某一档的柱子：日 / 周 / 月 */
export interface StudyTimeBucket {
  /** 归一化的 key：日=YYYY-MM-DD，周=该周周一（YYYY-MM-DD），月=YYYY-MM */
  key: string;
  /** 展示用短标签：日=「8」，周=「10/20」，月=「10 月」 */
  label: string;
  seconds: number;
}

export interface StudyTimeSummary {
  /** 累计秒数（全部历史） */
  totalSeconds: number;
  /** 有学习记录的天数 */
  studyDays: number;
  /** 连续学习天数（含今天或从昨天往前算） */
  streak: number;
  days: StudyTimeBucket[];
  weeks: StudyTimeBucket[];
  months: StudyTimeBucket[];
  /** 今天已学秒数 */
  todaySeconds: number;
}

/** 工作台上的一个计划进度 */
export interface StudyPlanProgress {
  id: string;
  title: string;
  status: string;
  mastered: number;
  total: number;
  currentCourseTitle: string | null;
  currentCourseId: string | null;
  reviews: number;
  sessions: number;
}

/** 需要再练的一条（弱点或到期复习） */
export interface StudyWeakItem {
  conceptId: string;
  name: string;
  kind: "review" | "weak";
  reason: string;
  planId: string | null;
  courseTitle: string | null;
  /** 掌握概率，0~1；弱点展示用 */
  pMastery: number;
  wrongStreak: number;
}

export interface ReviewItemDTO {
  id: string;
  conceptId: string;
  conceptName: string;
  topicName: string;
  planId: string | null;
  planTitle: string | null;
  courseId: string | null;
  courseName: string | null;
  reason: string;
  priority: number;
  dueAt: number | null;
  status: string;
  createdAt: number;
}

export interface CourseConceptDTO {
  id: string;
  name: string;
  status: ConceptStatus;
  displayStatus: ConceptDisplayStatus;
  introducedAt: number | null;
}

export interface CourseProgress {
  mastered: number;
  total: number;
  percent: number;
}

export interface PlanItemDTO {
  id: string;
  planId: string;
  title: string;
  /** 课程说明 */
  description?: string | null;
  orderIndex: number;
  status: CourseStatus;
  concepts: CourseConceptDTO[];
  progress: CourseProgress;
  /** 课程内下一个尚未掌握的知识点，用于「继续学习」 */
  nextConceptId?: string | null;
  nextConceptName?: string | null;
  /** 没有配置知识点：不计入完成率，界面必须明确标出 */
  unconfigured: boolean;
}

export interface PlanProgress {
  conceptsMastered: number;
  conceptsTotal: number;
  percent: number;
  coursesDone: number;
  coursesTotal: number;
  unconfiguredCourses: number;
}

export interface PlanDTO {
  id: string;
  goalId: string | null;
  title: string;
  note: string | null;
  status: PlanStatus;
  createdAt: number;
  updatedAt: number;
  /** 侧栏置顶时间戳；null / undefined 表示未置顶 */
  pinnedAt?: number | null;
  items: PlanItemDTO[];
  progress: PlanProgress;
  /** 当前学习位置：进行中的课程，其次第一门待开始且有知识点的课程 */
  currentCourseId: string | null;
  currentCourseTitle: string | null;
  currentConceptId: string | null;
  currentConceptName: string | null;
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

/** 联网检索配置（Key / 认证头只在服务端，不回显） */
export interface WebConfigPublic {
  enabled: boolean;
  endpoint: string;
  method: "GET" | "POST";
  configured: boolean;
  keyMasked: string;
  /** 是否已配置认证（请求头或 Key），不回显具体内容 */
  hasAuth: boolean;
  queryParam: string;
  bodyTemplate: string;
  resultsPath: string;
  titleField: string;
  urlField: string;
  snippetField: string;
  maxSources: number;
  timeoutMs: number;
  ttlDays: number;
  defaultMode: "off" | "manual";
  allowDomains: string[];
  denyDomains: string[];
  maxSearchesPerSession: number;
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
  /** 最近一次成功调用/测试；用于首页健康提示 */
  lastOkAt?: number | null;
  /** 最近一次失败原因；成功后清空 */
  lastError?: string | null;
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

/** 学习工作台（GET /api/study） */
export interface StudyOverview {
  ai: AiStatus;
  todayPlan: TodayPlan;
  plans: StudyPlanProgress[];
  weak: StudyWeakItem[];
  time: StudyTimeSummary;
}
