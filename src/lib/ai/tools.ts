/**
 * 教学工具（function calling）
 *
 * 模型不能直接写前端组件，只能调用这里的白名单工具；
 * 所有参数都要通过 zod 校验，答案与评分规则落在服务端。
 */
import {
  chartInputSchema,
  conceptsInputSchema,
  exerciseInputSchema,
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
  appendPlanItems,
  createPlan,
  findPlanByTitle,
  findConceptByName,
  ensureConcept,
  ensureTopic,
  getSession,
  linkSessionTopic,
  saveSummary,
  setSessionPlan,
} from "@/lib/db/repo";
import type { BlockDTO } from "@/lib/types";
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

export const TEACHING_TOOLS = [
  {
    name: "save_concepts",
    description:
      "把本次讲解涉及的知识点登记到学习档案（自动去重、建立主题与前置关系）。讲到具体知识点时调用，一次覆盖本次涉及的 1-8 个知识点。",
    parameters: obj(
      {
        topic: { type: "string", description: "知识主题，例如「导数」「复式记账」「Python 列表」" },
        topicDescription: { type: "string", description: "主题的一句话说明（可选）" },
        concepts: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: obj(
            {
              name: { type: "string", description: "知识点名称，尽量具体（如「链式法则」而不是「求导」）" },
              definition: { type: "string", description: "一句话定义（可选）" },
              prerequisites: {
                type: "array",
                items: { type: "string" },
                description: "前置知识点名称（可选，需是真实前置关系）",
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
      "给学生出一道可交互练习。答案只提交给系统、不能写进对话文字里。题型按教学目标选：single=单选 multi=多选 blank=填空 judge=判断 order=排序 numeric=计算 steps=分步骤 open=开放题。",
    parameters: obj(
      {
        concept: { type: "string", description: "这道题考查的知识点名称（用于把作答计入该知识点的掌握度）" },
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
      ["concept", "type", "prompt", "answer"],
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
      "用真实数据画图（折线/柱状/散点）。数据必须来自题目条件或可靠计算，不得编造。适合展示趋势、函数形状、对比关系。",
    parameters: obj(
      {
        title: { type: "string" },
        chartType: { type: "string", enum: ["line", "bar", "scatter"] },
        xLabel: { type: "string" },
        yLabel: { type: "string" },
        series: {
          type: "array",
          minItems: 1,
          items: obj(
            {
              name: { type: "string" },
              points: {
                type: "array",
                minItems: 1,
                items: obj({ x: { type: "number" }, y: { type: "number" } }, ["x", "y"]),
              },
            },
            ["name", "points"],
          ),
        },
        note: { type: "string", description: "一句话解读，说明该图的结论" },
      },
      ["title", "series"],
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
    description: "当学生设定了学习目标/时间，或明确要求系统化学习时，生成可编辑的学习路线（3-12 步）。",
    parameters: obj(
      {
        title: { type: "string" },
        goal: { type: "string" },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: obj(
            {
              title: { type: "string" },
              rationale: { type: "string" },
              concept: {
                type: "string",
                description: "这一步对应的知识点名称（尽量填写，用于和档案/作答证据绑定）",
              },
            },
            ["title"],
          ),
        },
      },
      ["title", "items"],
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

function parseArgs(raw: string): unknown {
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // 有些模型会把 JSON 包在 ```json 里
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ignore */
      }
    }
  }
  throw new Error("工具参数不是合法 JSON");
}

export async function executeTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolOutcome> {
  const args = parseArgs(rawArgs);

  switch (name) {
    case "save_concepts": {
      const parsed = conceptsInputSchema.safeParse(args);
      if (!parsed.success) return { ok: false, result: "参数校验失败，未登记知识点", blocks: [] };
      const topic = ensureTopic(parsed.data.topic, parsed.data.topicDescription);
      const created: { id: string; name: string; status: string }[] = [];
      const idByName = new Map<string, string>();
      for (const c of parsed.data.concepts) {
        const concept = ensureConcept({
          topicId: topic.id,
          name: c.name,
          definition: c.definition,
          introduced: true,
        });
        // 复用已有概念时，把该概念实际所属的主题也关联到本会话
        linkSessionTopic(ctx.sessionId, concept.topicId, 0.7);
        idByName.set(c.name, concept.id);
      }
      for (const c of parsed.data.concepts) {
        const from = idByName.get(c.name)!;
        for (const p of c.prerequisites ?? []) {
          const pid =
            idByName.get(p) ??
            ensureConcept({ topicId: topic.id, name: p, introduced: true }).id;
          addConceptEdge(pid, from, "prereq");
        }
      }
      for (const c of parsed.data.concepts) created.push({ id: idByName.get(c.name)!, name: c.name, status: "ok" });
      return {
        ok: true,
        result: `已登记知识点：${created.map((c) => c.name).join("、")}（主题：${parsed.data.topic}）`,
        blocks: [],
        notice: `已关联 ${created.length} 个知识点 · ${parsed.data.topic}`,
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
      let conceptId: string | null = null;
      if (parsed.data.concept) {
        // 知识点已存在时沿用它的主题；只有新概念才创建/使用模型给的主题。
        const existing = findConceptByName(parsed.data.concept);
        const topicId = existing ? existing.topicId : ensureTopic(parsed.data.topic || "未分类").id;
        linkSessionTopic(ctx.sessionId, topicId, 0.6);
        conceptId = existing
          ? existing.id
          : ensureConcept({ topicId, name: parsed.data.concept, introduced: true }).id;
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
      const verifyNotice =
        verification.status === "ambiguous"
          ? `题目口径可能有歧义（${verification.note ?? "已标注"}），本次作答不计入掌握度。`
          : verification.status === "unverified"
            ? verification.note ?? "本题未完成二次校验，不计入掌握度。"
            : undefined;
      return {
        ok: true,
        result: `练习已展示（id=${exercise.id}，题型=${parsed.data.type}，校验=${verification.status}）。答案解析已保存在服务端，请在对话里引导学生作答，不要直接说出答案。`,
        blocks: [block],
        notice: verifyNotice,
      };
    }

    case "present_quiz": {
      const parsed = quizInputSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, result: "小测结构不合法，未创建。", blocks: [] };
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

      // 每题可以用自己的 concept/topic 覆盖整套默认值；用于多知识点混合小测
      const resolved: { conceptId: string; conceptName: string }[] = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const conceptName = (q.input.concept ?? parsed.data.concept ?? "").trim();
        if (!conceptName) {
          return {
            ok: false,
            result: `第 ${i + 1} 题没有指定知识点，整套小测未创建。`,
            blocks: [],
            notice: "每道题都需要知识点（可用整套默认值）。",
          };
        }
        const topicName = (q.input.topic ?? parsed.data.topic ?? "未分类").trim() || "未分类";
        const existing = findConceptByName(conceptName);
        const topicId = existing ? existing.topicId : ensureTopic(topicName).id;
        linkSessionTopic(ctx.sessionId, topicId, 0.6);
        const conceptId = existing
          ? existing.id
          : ensureConcept({ topicId, name: conceptName, introduced: true }).id;
        resolved.push({ conceptId, conceptName });
      }
      const conceptNames = [...new Set(resolved.map((r) => r.conceptName))];

      const block = createBlock({
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        kind: "quiz",
        title: stripInlineMarkdown(parsed.data.title).slice(0, 80),
        payload: {
          title: parsed.data.title,
          concept: parsed.data.concept ?? conceptNames.join("、"),
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
      return {
        ok: true,
        result: `小测已展示（${questions.length} 题，覆盖 ${conceptNames.length} 个知识点，id=${block.id}）。答案已保存在服务端，请在对话里引导学生逐题作答，不要直接说出答案。`,
        blocks: [block],
        notice: uncertain
          ? `已生成 ${questions.length} 题小测（${conceptNames.length} 个知识点），其中 ${uncertain} 题未通过二次校验，不计入掌握度`
          : `已生成 ${questions.length} 题小测（${conceptNames.length} 个知识点）`,
      };
    }

    case "present_chart": {
      const parsed = chartInputSchema.safeParse(args);
      if (!parsed.success) return { ok: false, result: "图表数据不合法", blocks: [] };
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
      if (!parsed.success) return { ok: false, result: "表格结构不合法", blocks: [] };
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
      if (!parsed.success) return { ok: false, result: "步骤结构不合法", blocks: [] };
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
          notice: `模拟器表达式有误，已降级为文字说明：${err}`,
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
      if (!parsed.success) return { ok: false, result: "计划结构不合法", blocks: [] };
      // 同一个目标被重复生成时，补步骤而不是再开一条同名路线。
      // 只绑定档案里已经存在的知识点；不为未来课程预建空壳概念。
      const items = parsed.data.items.map((i) => {
        let conceptId: string | null = null;
        if (i.concept) {
          const existingConcept = findConceptByName(i.concept);
          if (existingConcept) {
            conceptId = existingConcept.id;
            linkSessionTopic(ctx.sessionId, existingConcept.topicId, 0.5);
          }
        }
        return {
          title: i.title,
          rationale: i.rationale,
          conceptId,
        };
      });
      const existing = findPlanByTitle(parsed.data.title);
      const plan = existing
        ? (appendPlanItems(existing.id, items) ?? existing)
        : createPlan({ title: parsed.data.title, note: parsed.data.goal, items });
      // 目标学习会话自动归到刚生成的计划下；已有归属则不改
      if (!getSession(ctx.sessionId)?.planId) setSessionPlan(ctx.sessionId, plan.id);
      const block = createBlock({
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        kind: "steps",
        title: `学习路线：${parsed.data.title}`,
        payload: { planId: plan.id, items: parsed.data.items, note: parsed.data.goal },
      });
      return {
        ok: true,
        result: `已生成学习路线（${plan.items.length} 步），用户可在「学习计划」中调整。`,
        blocks: [block],
        notice: "学习路线已保存，可在「学习计划」中修改",
      };
    }

    case "write_summary": {
      const parsed = summaryInputSchema.safeParse(args);
      if (!parsed.success) return { ok: false, result: "小结结构不合法", blocks: [] };
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
      return { ok: false, result: `未知工具：${name}`, blocks: [] };
  }
}
