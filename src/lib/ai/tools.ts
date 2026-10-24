/**
 * 教学工具（function calling）
 *
 * 模型不能直接写前端组件，只能调用这里的白名单工具；
 * 所有参数都要通过 zod 校验，答案与评分规则落在服务端。
 */
import {
  CHART_TYPES,
  chartInputSchema,
  conceptsInputSchema,
  exerciseInputSchema,
  normalizeText,
  planInputSchema,
  quizInputSchema,
  simulatorInputSchema,
  stepsInputSchema,
  summaryInputSchema,
  tableInputSchema,
  type ExerciseInput,
  type SimulatorInput,
} from "@/lib/blocks/schema";
import { buildAnswerSpec, type AnswerSpec } from "@/lib/learning/exercise";
import { verifyExercise } from "@/lib/ai/exercise-verify";
import { validateExpression } from "@/lib/learning/expr";
import {
  addConceptEdge,
  createBlock,
  createExercise,
  appendPlanCourses,
  createPlan,
  findPlanByTitle,
  findConceptByName,
  ensureConcept,
  getPlan,
  getSession,
  linkSessionTopic,
  saveSummary,
  setSessionPlan,
} from "@/lib/db/repo";
import type { BlockDTO, PlanDTO, PlanItemDTO } from "@/lib/types";
import { stripInlineMarkdown } from "@/lib/text";

export interface ToolContext {
  sessionId: string;
  messageId: string;
  defaultTopicId?: string | null;
}

export interface ToolOutcome {
  ok: boolean;
  /** 回传给模型的结果（模型据此继续对话） */
  result: string;
  blocks: BlockDTO[];
  notice?: string;
}

const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

/** 把 zod 校验错误压成一句话：既要让用户看懂，也要让模型知道该改哪 */
function zodIssues(err: { issues: { path: PropertyKey[]; message: string }[] }, max = 4): string {
  return err.issues
    .slice(0, max)
    .map((i) => `${i.path.join(".") || "(根)"}：${i.message}`)
    .join("；");
}

export const TEACHING_TOOLS = [
  {
    name: "save_concepts",
    description:
      "把本轮讲解涉及、且已经属于当前课程的知识点关联到会话（不创建新知识点）。目标学习中课程结构由用户确认；无限学习不要调用。",
    parameters: obj(
      {
        topic: { type: "string", description: "本次讲解的主题（仅作说明）" },
        topicDescription: { type: "string", description: "主题的一句话说明（可选）" },
        concepts: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: obj(
            {
              name: { type: "string", description: "知识点名称，必须是当前课程已有知识点" },
              definition: { type: "string", description: "一句话定义（可选）" },
              prerequisites: {
                type: "array",
                items: { type: "string" },
                description: "前置知识点名称（可选，需是当前课程已有知识点）",
              },
            },
            ["name"],
          ),
        },
      },
      ["topic", "concepts"],
    ),
  },
  {
    name: "present_exercise",
    description:
      "给学生出一道可交互练习。答案只提交给系统、不能写进对话文字里。目标学习中 concept 应对应本课程已有知识点；无限学习中的练习只用于当下理解，不写入正式档案。",
    parameters: obj(
      {
        concept: {
          type: "string",
          description: "目标学习中这道题考查的课程知识点名称（可选；无限学习中会被忽略）",
        },
        topic: { type: "string", description: "所属知识主题（可选）" },
        type: {
          type: "string",
          enum: ["single", "multi", "blank", "judge", "order", "numeric", "steps", "open"],
        },
        prompt: { type: "string", description: "题干，可用 markdown 与 $LaTeX$" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "选择题/排序题的项目。单选多选为选项，排序题为待排序项",
        },
        steps: {
          type: "array",
          items: { type: "string" },
          description: "steps 题型的各步骤说明",
        },
        blanks: { type: "integer", description: "填空题的空数（默认按答案数量）" },
        unit: { type: "string", description: "计算题单位（可选）" },
        answer: {
          type: "string",
          description:
            "标准答案（只给系统）。single 写选项下标如 0；multi 写 0,2；blank 每个空用 | 分隔多个可接受答案、空之间用 || 分隔，如 3|三||-2；judge 写 true/false；order 写正确顺序的下标如 2,0,1；numeric 写数字如 3.14；steps 每步用 || 分隔；open 写参考答案要点",
        },
        accept: {
          type: "array",
          items: { type: "string" },
          description:
            "额外可接受的等价写法（可选）。blank/steps 与 answer 同结构（空之间 ||，同一空的写法用 |）；numeric 写等价数值",
        },
        tolerance: { type: "number", description: "计算题允许误差（可选，默认 1%）" },
        hint: { type: "string", description: "渐进提示，不能直接给答案" },
        explanation: { type: "string", description: "提交后展示的解析" },
        difficulty: { type: "integer", minimum: 1, maximum: 5, description: "难度 1-5" },
        rubric: {
          type: "array",
          items: { type: "string" },
          description: "open 题型的评分维度",
        },
      },
      ["type", "prompt", "answer"],
    ),
  },
  {
    name: "present_quiz",
    description:
      "一次出 2-5 道小测，适合阶段验收；可以覆盖多个相关知识点（每题可带自己的 concept/topic）。每道题必须是确定性题型（single/multi/blank/judge/order/numeric/steps），不要用 open；答案只给系统，不能写进题干或正文。",
    parameters: obj(
      {
        title: { type: "string", description: "小测标题" },
        concept: { type: "string", description: "整套题的默认知识点（可选；单题 concept 可覆盖）" },
        topic: { type: "string", description: "整套题的默认主题（可选）" },
        questions: {
          type: "array",
          minItems: 2,
          maxItems: 5,
          items: obj(
            {
              concept: { type: "string", description: "本题知识点（可选；覆盖整套默认）" },
              topic: { type: "string", description: "本题主题（可选）" },
              type: {
                type: "string",
                enum: ["single", "multi", "blank", "judge", "order", "numeric", "steps"],
              },
              prompt: { type: "string", description: "题干，可用 markdown 与 $LaTeX$" },
              options: { type: "array", items: { type: "string" } },
              steps: { type: "array", items: { type: "string" } },
              blanks: { type: "integer" },
              unit: { type: "string" },
              answer: {
                type: "string",
                description:
                  "标准答案（只给系统）。single 写下标；multi 写 0,2；blank 每空用 | 分隔、空之间用 ||；judge 写 true/false；order 写顺序下标；numeric 写数字；steps 每步用 || 分隔",
              },
              accept: { type: "array", items: { type: "string" } },
              tolerance: { type: "number" },
              hint: { type: "string" },
              explanation: { type: "string" },
              difficulty: { type: "integer", minimum: 1, maximum: 5 },
            },
            ["type", "prompt", "answer"],
          ),
        },
      },
      ["title", "questions"],
    ),
  },
  {
    name: "present_chart",
    description:
      "用结构化数据画图。支持：line 折线、bar 柱状、area 面积、scatter 散点、pie 饼图（只能一个 series）、radar 雷达、waterfall 瀑布（points 用 kind=delta/total）、candlestick K线（用 candles，不要用 series）、combo 组合/双轴（每条 series 指定 type 和/或 axis=left|right）。x 可以是数字或字符串：月份、年份、资产类别直接写字符串，不要硬编码成 1/2/3。数据规则：题目或材料给出的数字用 dataKind=\"real\"；教学举例必须用 dataKind=\"illustrative\" 并在 dataNote 说明。缺少数值时可以给示意数据，不要因此拒绝画图。",
    parameters: obj(
      {
        title: { type: "string" },
        chartType: { type: "string", enum: [...CHART_TYPES] },
        xLabel: { type: "string" },
        yLabel: { type: "string" },
        xType: { type: "string", enum: ["category", "number", "time"] },
        stacked: { type: "boolean", description: "柱状/面积图是否堆叠" },
        series: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: obj(
            {
              name: { type: "string" },
              type: { type: "string", enum: ["line", "bar", "area"] },
              axis: { type: "string", enum: ["left", "right"] },
              points: {
                type: "array",
                minItems: 1,
                items: obj(
                  {
                    x: { anyOf: [{ type: "number" }, { type: "string" }] },
                    y: { type: "number" },
                    kind: { type: "string", enum: ["delta", "total"] },
                  },
                  ["x", "y"],
                ),
              },
            },
            ["name", "points"],
          ),
        },
        candles: {
          type: "array",
          minItems: 1,
          items: obj(
            {
              label: { type: "string" },
              open: { type: "number" },
              high: { type: "number" },
              low: { type: "number" },
              close: { type: "number" },
            },
            ["label", "open", "high", "low", "close"],
          ),
        },
        dataKind: {
          type: "string",
          enum: ["real", "illustrative"],
          description: "real=题目/材料中的真实数字；illustrative=教学示意数据（界面会标注）",
        },
        dataNote: { type: "string", description: "数据来源说明，例如「示意数据，非真实财报」" },
        note: { type: "string", description: "一句话解读，说明该图的结论" },
      },
      ["title", "chartType"],
    ),
  },
  {
    name: "present_table",
    description: "用表格做概念对比（A vs B、方法差异、条件对照），比长段落更好读。",
    parameters: obj(
      {
        title: { type: "string" },
        columns: { type: "array", minItems: 2, items: { type: "string" } },
        rows: {
          type: "array",
          minItems: 1,
          items: { type: "array", items: { type: "string" } },
        },
        note: { type: "string" },
      },
      ["title", "columns", "rows"],
    ),
  },
  {
    name: "present_steps",
    description: "展示解题/操作的分步骤演示（真实步骤，不是空泛标题）。适合算法、证明、实验流程、记账流程。",
    parameters: obj(
      {
        title: { type: "string" },
        steps: {
          type: "array",
          minItems: 2,
          maxItems: 10,
          items: obj({ title: { type: "string" }, detail: { type: "string" } }, ["title"]),
        },
        note: { type: "string" },
      },
      ["title", "steps"],
    ),
  },
  {
    name: "open_simulator",
    description:
      "创建一个可调参数的互动模拟器（参数滑块 + 实时计算结果 + 曲线）。公式用普通数学表达式，变量名必须与参数 key 一致，可用 sin/cos/sqrt/ln/exp/abs/pow/min/max 与 pi、e。用于让学生亲手改参数观察规律。",
    parameters: obj(
      {
        title: { type: "string" },
        description: { type: "string", description: "这个模拟器让学生观察什么" },
        params: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: obj(
            {
              key: { type: "string", description: "变量名，如 a、v0、rate" },
              label: { type: "string", description: "中文标签，如「初速度」" },
              min: { type: "number" },
              max: { type: "number" },
              step: { type: "number" },
              default: { type: "number" },
              unit: { type: "string" },
            },
            ["key", "label", "min", "max", "step", "default"],
          ),
        },
        outputs: {
          type: "array",
          items: obj(
            {
              key: { type: "string" },
              label: { type: "string" },
              expression: { type: "string" },
              unit: { type: "string" },
              digits: { type: "integer" },
            },
            ["key", "label", "expression"],
          ),
        },
        plot: obj(
          {
            xKey: { type: "string", description: "作为横轴的参数 key" },
            expression: { type: "string", description: "纵轴表达式" },
            xLabel: { type: "string" },
            yLabel: { type: "string" },
          },
          ["xKey", "expression"],
        ),
        insight: { type: "string", description: "学生操作后应发现的规律（可留空，等学生自己发现）" },
      },
      ["title", "params"],
    ),
  },
  {
    name: "save_plan",
    description:
      "仅在目标学习、且学生明确要求制定/调整学习计划时调用。生成的是待确认的计划草稿：计划 → 课程（courses）→ 知识点（concepts），不会直接开始教学，也不会自动把当前会话绑到计划。",
    parameters: obj(
      {
        title: { type: "string", description: "学习计划名称" },
        goal: { type: "string", description: "学习目标（一句话）" },
        courses: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: obj(
            {
              title: { type: "string", description: "课程/学习单元名称" },
              description: { type: "string", description: "这门课学什么（可选）" },
              concepts: {
                type: "array",
                minItems: 1,
                maxItems: 12,
                items: obj(
                  {
                    name: { type: "string", description: "知识点名称，具体而可教" },
                    definition: { type: "string", description: "一句话定义（可选）" },
                  },
                  ["name"],
                ),
              },
            },
            ["title", "concepts"],
          ),
        },
      },
      ["title", "courses"],
    ),
  },
  {
    name: "write_summary",
    description:
      "本次学习结束/阶段总结时写学习小结。progress 只能写本次真实发生且有证据的内容，不要编造统计数据。",
    parameters: obj(
      {
        headline: { type: "string" },
        covered: { type: "array", items: { type: "string" } },
        progress: { type: "array", items: { type: "string" } },
        needsWork: { type: "array", items: { type: "string" } },
        nextSteps: { type: "array", items: { type: "string" } },
        resumeHint: { type: "string" },
      },
      ["headline"],
    ),
  },
] as const;

/**
 * 模型生成的 JSON 常见问题：字符串里有裸换行、尾逗号、外面包了 Markdown、
 * 被 max_tokens 截断。能修就修；修不了再把明确原因回传给模型重试。
 */
function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function repairJson(raw: string): unknown {
  let s = raw.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1];
  const start = s.indexOf("{");
  if (start === -1) return undefined;
  s = s.slice(start);

  let out = "";
  let inString = false;
  let escaped = false;
  let completeAt = 0;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      const code = ch.charCodeAt(0);
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`;
      else out += ch;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      out += ch;
      if (!stack.length) completeAt = out.length;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === "}" || s[j] === "]") continue;
    }
    out += ch;
  }

  // 被截断：先补上未闭合的字符串（注意结尾是单个反斜杠时要先转义），再补括号
  if (inString) {
    if (escaped) out += "\\";
    out += '"';
  }
  while (stack.length) out += stack.pop();
  if (completeAt > 0) out = out.slice(0, completeAt);
  return tryParseJson(out);
}

export function parseToolArgs(raw: string): unknown {
  if (!raw || !raw.trim()) return {};
  const direct = tryParseJson(raw);
  if (direct !== undefined) return direct;
  const repaired = repairJson(raw);
  if (repaired !== undefined) {
    console.warn("[tool] 参数 JSON 已自动修复");
    return repaired;
  }
  console.warn("[tool] 参数 JSON 解析失败:", raw.slice(0, 240).replace(/\s+/g, " "));
  throw new Error("工具参数不是合法 JSON");
}

interface ToolLearningContext {
  session: ReturnType<typeof getSession>;
  plan: PlanDTO | null;
  course: PlanItemDTO | null;
}

function learningContext(sessionId: string): ToolLearningContext {
  const session = getSession(sessionId);
  const plan = session?.planId ? getPlan(session.planId) : null;
  const course = plan?.items.find((item) => item.id === session?.planItemId) ?? null;
  return { session, plan, course };
}

/**
 * 解析一道题应该计入哪个知识点。
 * 无限学习永远返回 null；目标学习只认本课程已有知识点，绝不临场造档案。
 */
function resolveExerciseConcept(
  sessionId: string,
  requested?: string,
): {
  conceptId: string | null;
  conceptName: string | null;
  reason?: "not_in_course" | "not_bound" | "infinite";
} {
  const { session, plan, course } = learningContext(sessionId);
  if (!session) return { conceptId: null, conceptName: null, reason: "not_bound" };
  if (session.mode === "infinite") return { conceptId: null, conceptName: null, reason: "infinite" };
  if (session.mode === "review") {
    return session.focusConceptId
      ? { conceptId: session.focusConceptId, conceptName: session.focusConceptName }
      : { conceptId: null, conceptName: null, reason: "not_bound" };
  }
  if (!plan || plan.status === "draft") {
    return { conceptId: null, conceptName: null, reason: "not_bound" };
  }
  if (!course) return { conceptId: null, conceptName: null, reason: "not_bound" };
  if (requested?.trim()) {
    const wanted = normalizeText(requested);
    const match = course.concepts.find((c) => normalizeText(c.name) === wanted);
    if (match) return { conceptId: match.id, conceptName: match.name };
    // 模型点名的知识点不在本课程：宁可不计入，也不要错记到别的知识点上
    return { conceptId: null, conceptName: null, reason: "not_in_course" };
  }
  return {
    conceptId: course.nextConceptId ?? session.focusConceptId ?? null,
    conceptName: course.nextConceptName ?? session.focusConceptName ?? null,
  };
}

export async function executeTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolOutcome> {
  const args = parseToolArgs(rawArgs);

  switch (name) {
    case "save_concepts": {
      const parsed = conceptsInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          result: `知识点参数不合法（${zodIssues(parsed.error)}）。`,
          blocks: [],
          notice: "知识点参数不合法，本次未登记。",
        };
      }
      const { session, plan, course } = learningContext(ctx.sessionId);
      if (!session || session.mode === "infinite") {
        return {
          ok: true,
          result: "无限学习不写入正式学习档案。本次知识点未登记；如学生明确要求整理，请先调用 save_plan 生成待确认的计划草稿。",
          blocks: [],
        };
      }
      if (session.mode !== "goal") {
        return { ok: true, result: "复习会话不新建知识点；请直接检验当前知识点。", blocks: [] };
      }
      if (!plan || plan.status !== "active" || !course) {
        return {
          ok: false,
          result: "当前会话没有绑定已确认的课程，不能登记知识点。请先让用户在计划页确认计划并从课程进入。",
          blocks: [],
          notice: "计划尚未确认或未绑定课程，本次未写入档案。",
        };
      }
      const linked: { id: string; name: string }[] = [];
      const skipped: string[] = [];
      const idByName = new Map<string, string>();
      for (const c of parsed.data.concepts) {
        const existing = findConceptByName(c.name);
        // 目标学习的课程结构由用户确认；这里只关联课程里已有的知识点，不临场扩目录
        if (!existing || existing.courseId !== course.id) {
          skipped.push(c.name);
          continue;
        }
        // 只标记“已讲解”，不改变课程结构；仍然要等作答证据才算掌握
        ensureConcept({
          topicId: existing.topicId,
          name: existing.name,
          courseId: course.id,
          introduced: true,
        });
        linkSessionTopic(ctx.sessionId, existing.topicId, 0.7);
        idByName.set(c.name, existing.id);
        linked.push({ id: existing.id, name: existing.name });
      }
      for (const c of parsed.data.concepts) {
        const from = idByName.get(c.name);
        if (!from) continue;
        for (const p of c.prerequisites ?? []) {
          const pid = idByName.get(p);
          if (pid) addConceptEdge(pid, from, "prereq");
        }
      }
      if (!linked.length) {
        return {
          ok: true,
          result: `这些知识点不在当前课程中，未自动写入：${skipped.join("、")}。如需加入，请在计划页编辑课程目录。`,
          blocks: [],
          notice: "知识点不在当前课程，未改动档案。",
        };
      }
      return {
        ok: true,
        result: `已关联课程「${course.title}」中的知识点：${linked.map((c) => c.name).join("、")}。`,
        blocks: [],
        notice:
          skipped.length > 0
            ? `已关联 ${linked.length} 个课程知识点；${skipped.length} 个不在当前课程中，未自动加入。`
            : `已关联 ${linked.length} 个课程知识点 · ${course.title}`,
      };
    }

    case "present_exercise": {
      const parsed = exerciseInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          result: "练习参数不合法，未能创建。请检查后重新调用。",
          blocks: [],
          notice: "练习结构校验失败，已跳过该练习。",
        };
      }
      let spec;
      try {
        spec = buildAnswerSpec(parsed.data);
      } catch (e) {
        return {
          ok: false,
          result: `答案格式无法解析：${(e as Error).message}`,
          blocks: [],
          notice: "练习答案格式无效，已跳过该练习（未伪造可交互组件）。",
        };
      }

      // 出题质量门：答案键、选项唯一性、题干自洽、泄题/歧义
      const verification = await verifyExercise(parsed.data, spec.spec, ctx.sessionId);
      if (verification.status === "failed") {
        // 不生成可交互题，但保留题干，降级为文字练习
        const parts = [parsed.data.prompt];
        if (parsed.data.options?.length) {
          parts.push(parsed.data.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n"));
        }
        if (parsed.data.steps?.length) {
          parts.push(parsed.data.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
        }
        parts.push("（这道题未通过二次校验，仅作文字练习，不计入掌握度。）");
        const fallback = createBlock({
          sessionId: ctx.sessionId,
          messageId: ctx.messageId,
          kind: "note",
          title: "练习题未通过校验",
          payload: { kind: "note", headline: parts.join("\n\n") },
        });
        return {
          ok: false,
          result: `题目未通过二次校验：${verification.note ?? "答案键不可信"}，已降级为文字练习。`,
          blocks: [fallback],
          notice: "这道题的答案键未通过二次校验，已降级为文字练习（不计入掌握度）。",
        };
      }
      const resolved = resolveExerciseConcept(ctx.sessionId, parsed.data.concept);
      const conceptId = resolved.conceptId;
      if (conceptId && resolved.conceptName) {
        const concept = findConceptByName(resolved.conceptName);
        if (concept) linkSessionTopic(ctx.sessionId, concept.topicId, 0.6);
      }
      const block = createBlock({
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        kind: "exercise",
        title: stripInlineMarkdown(parsed.data.prompt).slice(0, 40),
        payload: { hint: parsed.data.hint ?? null, type: parsed.data.type },
      });
      const exercise = createExercise({
        sessionId: ctx.sessionId,
        blockId: block.id,
        conceptId,
        type: parsed.data.type,
        prompt: parsed.data.prompt,
        options: parsed.data.options ?? [],
        answer: spec.spec,
        rubric: parsed.data.rubric ?? null,
        explanation: parsed.data.explanation ?? null,
        difficulty: parsed.data.difficulty ?? 2,
        verification: verification.status,
        verificationNote: verification.note,
      });
      const notices: string[] = [];
      if (verification.status === "ambiguous") {
        notices.push(`题目口径可能有歧义（${verification.note ?? "已标注"}），本次作答不计入掌握度。`);
      } else if (verification.status === "unverified") {
        notices.push(verification.note ?? "本题未完成二次校验，不计入掌握度。");
      }
      if (resolved.reason === "infinite") {
        notices.push("无限学习中的练习只用于即时反馈，不写入正式学习档案。");
      } else if (resolved.reason === "not_in_course") {
        notices.push("本题知识点不在当前课程中，未计入课程进度。");
      } else if (resolved.reason === "not_bound") {
        notices.push("当前会话未绑定已确认课程，本题不计入课程进度。");
      }
      return {
        ok: true,
        result: `练习已展示（id=${exercise.id}，题型=${parsed.data.type}，校验=${verification.status}${conceptId ? `，知识点=${resolved.conceptName}` : "，未关联课程知识点"}）。答案解析已保存在服务端，请在对话里引导学生作答，不要直接说出答案。`,
        blocks: [block],
        notice: notices.length ? notices.join(" ") : undefined,
      };
    }

    case "present_quiz": {
      const parsed = quizInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          result: `小测结构不合法（${zodIssues(parsed.error)}）。`,
          blocks: [],
          notice: "小测结构不合法，已跳过。",
        };
      }
      const questions: { input: ExerciseInput; spec: AnswerSpec }[] = [];
      for (let i = 0; i < parsed.data.questions.length; i++) {
        const question = exerciseInputSchema.safeParse(parsed.data.questions[i]);
        if (!question.success) {
          return {
            ok: false,
            result: `第 ${i + 1} 题结构不合法，整套小测未创建。`,
            blocks: [],
            notice: `第 ${i + 1} 题结构校验失败，小测未生成。`,
          };
        }
        if (question.data.type === "open") {
          return {
            ok: false,
            result: "多题小测暂不支持 open 题，整套未创建。",
            blocks: [],
            notice: "多题小测第一版只支持确定性题型，未生成。",
          };
        }
        try {
          questions.push({
            input: question.data,
            spec: buildAnswerSpec(question.data).spec,
          });
        } catch (e) {
          return {
            ok: false,
            result: `第 ${i + 1} 题答案格式无法解析：${(e as Error).message}`,
            blocks: [],
            notice: "小测中有题的答案格式无效，整套未生成。",
          };
        }
      }

      // 与单题一致的二次校验：并发出题审校，failed 则整套不生成
      const verifications = await Promise.all(
        questions.map((q) => verifyExercise(q.input, q.spec, ctx.sessionId)),
      );
      const failedIndex = verifications.findIndex((v) => v.status === "failed");
      if (failedIndex >= 0) {
        return {
          ok: false,
          result: `第 ${failedIndex + 1} 题未通过二次校验，整套小测未创建。`,
          blocks: [],
          notice: "小测中有题未通过二次校验，未生成；请重试或减少题量。",
        };
      }

      // 每题可以用自己的 concept 覆盖整套默认值；只认课程里已有的知识点
      const resolved = questions.map((q) =>
        resolveExerciseConcept(ctx.sessionId, q.input.concept ?? parsed.data.concept),
      );
      for (const r of resolved) {
        if (!r.conceptName) continue;
        const concept = findConceptByName(r.conceptName);
        if (concept) linkSessionTopic(ctx.sessionId, concept.topicId, 0.6);
      }
      const conceptNames = [
        ...new Set(resolved.map((r) => r.conceptName).filter((n): n is string => Boolean(n))),
      ];
      const unlinked = resolved.filter((r) => !r.conceptId).length;

      const block = createBlock({
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        kind: "quiz",
        title: stripInlineMarkdown(parsed.data.title).slice(0, 80),
        payload: {
          title: parsed.data.title,
          concept: conceptNames.join("、") || null,
          concepts: conceptNames,
          count: questions.length,
        },
      });
      questions.forEach((q, i) => {
        const verification = verifications[i];
        createExercise({
          sessionId: ctx.sessionId,
          blockId: block.id,
          conceptId: resolved[i].conceptId,
          type: q.input.type,
          prompt: q.input.prompt,
          options: q.input.options ?? [],
          answer: q.spec,
          rubric: null,
          explanation: q.input.explanation ?? null,
          difficulty: q.input.difficulty ?? 2,
          // failed 已经在上方整组拦截；这里只是让类型收窄
          verification: verification.status === "failed" ? "unverified" : verification.status,
          verificationNote: verification.note,
        });
      });
      const uncertain = verifications.filter((v) => v.status !== "passed").length;
      const notes: string[] = [];
      if (uncertain) notes.push(`其中 ${uncertain} 题未通过二次校验，不计入掌握度`);
      if (unlinked) notes.push(`${unlinked} 题未关联课程知识点，不计入课程进度`);
      if (resolved.every((r) => r.reason === "infinite")) {
        notes.push("无限学习中的小测只用于即时反馈，不写入正式学习档案");
      }
      return {
        ok: true,
        result: `小测已展示（${questions.length} 题，关联 ${conceptNames.length} 个知识点，id=${block.id}）。答案已保存在服务端，请在对话里引导学生逐题作答，不要直接说出答案。`,
        blocks: [block],
        notice: notes.length
          ? `已生成 ${questions.length} 题小测：${notes.join("；")}`
          : `已生成 ${questions.length} 题小测（${conceptNames.length} 个知识点）`,
      };
    }

    case "present_chart": {
      const parsed = chartInputSchema.safeParse(args);
      if (!parsed.success) {
        const detail = zodIssues(parsed.error);
        return {
          ok: false,
          result: `图表数据不合法（${detail}）。请修正参数后重新调用 present_chart；当前不支持这个图型时改用 present_table。`,
          blocks: [],
          notice: "这张图这次没生成好，我换一种方式讲。",
        };
      }
      const block = createBlock({
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        kind: "chart",
        title: parsed.data.title,
        payload: parsed.data,
      });
      return { ok: true, result: "图表已展示", blocks: [block] };
    }

    case "present_table": {
      const parsed = tableInputSchema.safeParse(args);
      if (!parsed.success) {
        const detail = zodIssues(parsed.error);
        return {
          ok: false,
          result: `表格结构不合法（${detail}）。请修正后重新调用 present_table。`,
          blocks: [],
          notice: "这张表这次没生成好，我换一种方式讲。",
        };
      }
      const block = createBlock({
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        kind: "table",
        title: parsed.data.title,
        payload: parsed.data,
      });
      return { ok: true, result: "对比表已展示", blocks: [block] };
    }

    case "present_steps": {
      const parsed = stepsInputSchema.safeParse(args);
      if (!parsed.success) {
        const detail = zodIssues(parsed.error);
        return {
          ok: false,
          result: `步骤结构不合法（${detail}）。请修正后重新调用 present_steps。`,
          blocks: [],
          notice: "这一步的格式没生成好，我重新组织一下。",
        };
      }
      const block = createBlock({
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        kind: "steps",
        title: parsed.data.title,
        payload: parsed.data,
      });
      return { ok: true, result: "步骤演示已展示", blocks: [block] };
    }

    case "open_simulator": {
      const parsed = simulatorInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          result: `模拟器参数不合法：${parsed.error.issues.map((i) => i.message).join("；")}`,
          blocks: [],
          notice: "模拟器参数校验失败，已降级为文字说明。",
        };
      }
      const sim: SimulatorInput = parsed.data;
      const vars: Record<string, number> = {};
      for (const p of sim.params) vars[p.key] = p.default;
      const checks = [
        sim.expression ? validateExpression(sim.expression, vars) : { ok: true },
        ...(sim.outputs ?? []).map((o) => validateExpression(o.expression, vars)),
        ...(sim.plot ? [validateExpression(sim.plot.expression, vars)] : []),
      ];
      if (checks.some((c) => !c.ok)) {
        const err = checks.find((c) => !c.ok)?.error;
        return {
          ok: false,
          result: `模拟器表达式无法计算（${err}），请修正后重试。`,
          blocks: [],
          notice: "这个模拟器暂时没搭好，我改用文字说明。",
        };
      }
      const block = createBlock({
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        kind: "simulator",
        title: sim.title,
        payload: sim,
        state: { params: vars },
      });
      return { ok: true, result: "模拟器已打开（参数可调，计算在本地实时完成）", blocks: [block] };
    }

    case "save_plan": {
      const parsed = planInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          result: `计划结构不合法（${zodIssues(parsed.error)}）。`,
          blocks: [],
          notice: "计划结构不合法，本次未生成计划。",
        };
      }
      const { session } = learningContext(ctx.sessionId);
      if (!session || session.mode === "review") {
        return {
          ok: false,
          result: "复习会话不能生成学习计划。",
          blocks: [],
          notice: "复习会话不能生成学习计划。",
        };
      }
      const existing = findPlanByTitle(parsed.data.title);
      if (existing && existing.status !== "draft") {
        return {
          ok: false,
          result: `已有同名计划「${existing.title}」。如需调整，请在计划页编辑；要新建计划请换一个名称。`,
          blocks: [],
          notice: "同名正式计划已存在，本次未生成重复计划。",
        };
      }
      const plan = existing
        ? (appendPlanCourses(existing.id, parsed.data.courses) ?? existing)
        : createPlan({
            title: parsed.data.title,
            note: parsed.data.goal,
            status: "draft",
            courses: parsed.data.courses,
          });
      // 规划对话归属于它生成的计划；否则历史会显示「未归计划」，计划详情也不统计这次对话。
      // 已是课程会话（planId 指向另一门课）时不抢绑定，避免破坏当前学习上下文。
      if (!session.planId) setSessionPlan(ctx.sessionId, plan.id);
      const conceptCount = plan.items.reduce((n, item) => n + item.concepts.length, 0);
      const missing: string[] = [];
      for (const course of parsed.data.courses) {
        const target = plan.items.find(
          (item) => normalizeText(item.title) === normalizeText(course.title),
        );
        for (const concept of course.concepts) {
          if (!target?.concepts.some((c) => normalizeText(c.name) === normalizeText(concept.name))) {
            missing.push(concept.name);
          }
        }
      }
      const block = createBlock({
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        kind: "steps",
        title: `计划草稿：${plan.title}`,
        payload: {
          planId: plan.id,
          draft: true,
          title: `计划草稿：${plan.title}`,
          items: plan.items.map((item) => ({
            title: item.title,
            rationale: item.description,
          })),
          note: "这是待确认的计划草稿。确认课程与知识点后，才会进入正式学习。",
        },
      });
      return {
        ok: true,
        result: `已生成计划草稿（${plan.items.length} 门课程，${conceptCount} 个知识点，id=${plan.id}）。现在不要直接开始教学；请引导用户到「目标学习」确认或修改课程目录。`,
        blocks: [block],
        notice: missing.length
          ? `计划草稿已生成；${missing.length} 个知识点已属于其他课程，未重复加入：${missing.join("、")}`
          : "计划草稿已生成，待确认后开始学习",
      };
    }

    case "write_summary": {
      const parsed = summaryInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          result: `小结结构不合法（${zodIssues(parsed.error)}）。`,
          blocks: [],
          notice: "小结结构不合法，本次未保存。",
        };
      }
      saveSummary(ctx.sessionId, parsed.data);
      const block = createBlock({
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        kind: "note",
        title: parsed.data.headline,
        payload: { kind: "summary", ...parsed.data },
      });
      return { ok: true, result: "学习小结已保存", blocks: [block] };
    }

    default:
      return {
        ok: false,
        result: `未知工具：${name}`,
        blocks: [],
        notice: "有一个工具调用没成功，我换一种方式继续。",
      };
  }
}
