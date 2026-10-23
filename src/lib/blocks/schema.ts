/**
 * 教学组件的结构化协议（模型输出必须通过这里的校验才能落库/渲染）
 *
 * 说明：所有"正确答案"只存在于服务端 exercises.answer 字段，
 * 下发给前端的 ExercisePublic 不包含答案。
 */
import { z } from "zod";

export const exerciseTypeSchema = z.enum([
  "single",
  "multi",
  "blank",
  "judge",
  "order",
  "numeric",
  "steps",
  "open",
]);

/** 模型提交练习时使用的扁平参数（answer 用字符串表达，服务端按 type 解析） */
export const exerciseInputSchema = z
  .object({
    concept: z.string().min(1).max(120).optional(),
    topic: z.string().min(1).max(80).optional(),
    type: exerciseTypeSchema,
    prompt: z.string().min(3).max(4000),
    options: z.array(z.string().min(1).max(400)).max(10).optional(),
    blanks: z.number().int().min(1).max(8).optional(),
    steps: z.array(z.string().min(1).max(400)).max(10).optional(),
    unit: z.string().max(30).optional(),
    /** single: "0" ; multi: "0,2" ; blank: "甲||乙" ; judge: "true" ; order: "2,0,1" ; numeric: "3.14" ; steps: "1||3||x=2" */
    answer: z.string().min(1).max(2000),
    /** 可接受的等价答案，用 || 分隔 */
    accept: z.array(z.string().max(200)).max(10).optional(),
    tolerance: z.number().min(0).max(1000).optional(),
    /** 学生点「给我提示」时展示的渐进提示（不得直接给出答案） */
    hint: z.string().max(600).optional(),
    explanation: z.string().max(3000).optional(),
    difficulty: z.number().int().min(1).max(5).optional(),
    rubric: z.array(z.string().min(1).max(200)).max(6).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.type === "single" || v.type === "multi") && (!v.options || v.options.length < 2)) {
      ctx.addIssue({ code: "custom", message: "选择题必须提供至少 2 个选项" });
    }
    if (v.type === "order" && (!v.options || v.options.length < 2)) {
      ctx.addIssue({ code: "custom", message: "排序题必须提供至少 2 个项目" });
    }
    if (v.type === "steps" && (!v.steps || v.steps.length < 1)) {
      ctx.addIssue({ code: "custom", message: "分步骤练习必须给出步骤列表" });
    }
    if (v.type === "blank" && (v.answer.split("||").length < 1 || v.answer.trim() === "")) {
      ctx.addIssue({ code: "custom", message: "填空题答案不能为空" });
    }
  });

export type ExerciseInput = z.infer<typeof exerciseInputSchema>;

/** 多题小测：2–5 道题；整套有默认 concept/topic，单题可用自己的 concept/topic 覆盖 */
export const quizInputSchema = z.object({
  title: z.string().min(1).max(160),
  concept: z.string().min(1).max(120).optional(),
  topic: z.string().min(1).max(80).optional(),
  questions: z.array(z.unknown()).min(2).max(5),
});

export type QuizInput = z.infer<typeof quizInputSchema>;

const pointSchema = z.object({ x: z.number(), y: z.number() });

export const chartInputSchema = z.object({
  title: z.string().min(1).max(160),
  chartType: z.enum(["line", "bar", "scatter"]).default("line"),
  xLabel: z.string().max(60).optional(),
  yLabel: z.string().max(60).optional(),
  series: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        points: z.array(pointSchema).min(1).max(200),
      }),
    )
    .min(1)
    .max(6),
  note: z.string().max(600).optional(),
});

export const tableInputSchema = z.object({
  title: z.string().min(1).max(160),
  columns: z.array(z.string().min(1).max(80)).min(2).max(8),
  rows: z.array(z.array(z.string().max(400)).min(2).max(8)).min(1).max(60),
  note: z.string().max(600).optional(),
});

export const stepsInputSchema = z.object({
  title: z.string().min(1).max(160),
  steps: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        detail: z.string().max(1200).optional(),
      }),
    )
    .min(2)
    .max(10),
  note: z.string().max(600).optional(),
});

export const simulatorParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(24)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "参数名必须是合法变量名"),
  label: z.string().min(1).max(40),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  default: z.number(),
  unit: z.string().max(16).optional(),
});

export const simulatorInputSchema = z
  .object({
    title: z.string().min(1).max(160),
    description: z.string().max(1200).optional(),
    /** 表达式，可引用 params 中的变量；用于输出与绘图，不支持任意代码 */
    expression: z.string().min(1).max(400).optional(),
    params: z.array(simulatorParamSchema).min(1).max(6),
    outputs: z
      .array(
        z.object({
          key: z.string().min(1).max(24),
          label: z.string().min(1).max(40),
          expression: z.string().min(1).max(300),
          unit: z.string().max(16).optional(),
          digits: z.number().int().min(0).max(6).optional(),
        }),
      )
      .max(6)
      .optional(),
    /** 绘制曲线：x 轴变量取自 params，y = expression */
    plot: z
      .object({
        xKey: z.string().min(1).max(24),
        expression: z.string().min(1).max(300),
        xLabel: z.string().max(40).optional(),
        yLabel: z.string().max(40).optional(),
      })
      .optional(),
    insight: z.string().max(800).optional(),
  })
  .superRefine((v, ctx) => {
    const keys = new Set(v.params.map((p) => p.key));
    for (const p of v.params) {
      if (p.min >= p.max) ctx.addIssue({ code: "custom", message: `参数 ${p.key} 的 min 必须小于 max` });
      if (p.default < p.min || p.default > p.max)
        ctx.addIssue({ code: "custom", message: `参数 ${p.key} 的默认值超出范围` });
    }
    if (v.plot && !keys.has(v.plot.xKey)) {
      ctx.addIssue({ code: "custom", message: "plot.xKey 必须是已声明的参数" });
    }
  });

export type SimulatorInput = z.infer<typeof simulatorInputSchema>;

const conceptInputSchema = z.object({
  name: z.string().min(1).max(120),
  definition: z.string().max(600).optional(),
  prerequisites: z.array(z.string().max(120)).max(6).optional(),
});

export const conceptsInputSchema = z.object({
  topic: z.string().min(1).max(80),
  topicDescription: z.string().max(400).optional(),
  concepts: z.array(conceptInputSchema).min(1).max(8),
});

export const planInputSchema = z.object({
  title: z.string().min(1).max(160),
  goal: z.string().max(400).optional(),
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        rationale: z.string().max(400).optional(),
        concept: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export const summaryInputSchema = z.object({
  headline: z.string().min(1).max(160),
  covered: z.array(z.string().max(200)).max(10).default([]),
  progress: z.array(z.string().max(240)).max(10).default([]),
  needsWork: z.array(z.string().max(200)).max(10).default([]),
  nextSteps: z.array(z.string().max(240)).max(6).default([]),
  resumeHint: z.string().max(300).optional(),
});

export type LessonSummary = z.infer<typeof summaryInputSchema>;

export function normalizeText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .replace(/[，。；：、,.;:'"“”‘’]/g, "");
}

export const KIND_LABEL: Record<string, string> = {
  chart: "图表",
  table: "对比表",
  steps: "步骤演示",
  exercise: "练习",
  simulator: "互动模拟器",
  note: "笔记",
  fallback: "文字",
};
