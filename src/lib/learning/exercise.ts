/**
 * 判题引擎
 *
 * - 确定性题型（单选/多选/填空/判断/排序/计算/分步骤）在服务端完成校验。
 * - 开放题没有唯一答案：不伪造"正确/错误"，返回 graded=false 交由 AI 按评分维度评阅；
 *   AI 不可用时该次作答不写入掌握度证据（只留档）。
 */
import { normalizeText, type ExerciseInput } from "@/lib/blocks/schema";
import type { ErrorType, ExerciseType } from "@/lib/types";

export type AnswerSpec =
  | { kind: "single"; index: number; options: string[] }
  | { kind: "multi"; indices: number[]; options: string[] }
  | { kind: "blank"; blanks: string[][]; count: number }
  | { kind: "judge"; value: boolean }
  | { kind: "order"; order: number[]; items: string[] }
  | { kind: "numeric"; value: number; tolerance: number; unit?: string; alternates?: number[] }
  | { kind: "steps"; blanks: string[][]; steps: string[] }
  | { kind: "open"; rubric: string[]; modelAnswer?: string };

export interface GradeResult {
  graded: boolean;
  correct: boolean;
  score: number;
  maxScore: number;
  feedback: string;
  correctDisplay?: string;
  explanation?: string;
  /** 错因：只影响"接下来怎么教"，不参与掌握度 */
  errorType?: ErrorType | null;
}

function toHalfWidth(s: string): string {
  return s.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/**
 * 解析学生填的数字。
 * 支持全角数字、千分位、百分号与空格；**空串/纯符号必须返回 NaN**——
 * 早期实现用 Number("") 会得到 0，等于把"没填"判成"填了 0"。
 */
const num = (s: string) => {
  const raw = toHalfWidth(String(s ?? "")).trim();
  if (!raw) return NaN;
  const cleaned = raw.replace(/[,\s_]/g, "");
  const m = cleaned.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(?:[eE][+-]?\d+)?%?$/);
  return m ? Number(m[1]) : NaN;
};

/**
 * 数值题的默认容差：相对 0.1%，但绝对量设上限 1。
 * 旧默认是 1%（百万级答案等于允许 ±1 万），既可能放过错答案，也会让"差一分钱"之类的真实错误被判对。
 */
export function numericTolerance(value: number, configured?: number | null): number {
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) return configured;
  if (!Number.isFinite(value)) return 1e-6;
  return Math.min(Math.max(1e-6, Math.abs(value) * 0.001), 1);
}

/** 未作答（空串 / 空数组 / 全是空白）：不判错，也不产生证据 */
function isEmptySubmission(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw === "boolean" || typeof raw === "number") return false;
  if (typeof raw === "string") return toHalfWidth(raw).trim() === "";
  if (Array.isArray(raw)) {
    return raw.length === 0 || raw.every((x) => (typeof x === "string" ? x.trim() === "" : x == null));
  }
  return false;
}

/** accept 与 answer 同构：空之间用 ||，同一个空的等价写法用 | */
function mergeAccept(parts: string[][], accept?: string[]): string[][] {
  const merged = parts.map((p) => [...p]);
  if (!accept?.length) return merged;
  for (const raw of accept) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const groups = trimmed
      .split("||")
      .map((p) => p.split("|").map((s) => s.trim()).filter(Boolean));
    if (groups.length === merged.length && groups.every((g) => g.length > 0)) {
      groups.forEach((g, i) => merged[i].push(...g));
    } else if (merged.length === 1) {
      merged[0].push(trimmed);
    }
  }
  return merged;
}

/**
 * 一段文本是否匹配某个空。
 * 短答案必须归一化后完全一致（否则「成本」会命中「机会成本」）；
 * 只有足够长的答案才允许包含关系，且长度不能差太多。
 */
function matchesAccepted(userRaw: string, accepted: string[]): boolean {
  const u = normalizeText(userRaw);
  if (!u) return false;
  const userNum = num(userRaw);
  return accepted.some((cand) => {
    const c = normalizeText(cand);
    if (!c) return false;
    if (u === c) return true;
    // 数值等价：1000.00 = 1000、50% = 50、全角/千分位不影响判分。
    // 这里只认"同一个数"的等价写法，不放宽成数值题的容差——填空题差 0.5 通常就是答错。
    const candNum = num(cand);
    if (Number.isFinite(userNum) && Number.isFinite(candNum)) {
      if (Math.abs(userNum - candNum) <= 1e-9 * Math.max(1, Math.abs(candNum))) return true;
    }
    if (Math.min(u.length, c.length) < 8) return false;
    const [short, long] = u.length <= c.length ? [u, c] : [c, u];
    return long.includes(short) && short.length >= long.length * 0.75;
  });
}

export function buildAnswerSpec(input: ExerciseInput): { spec: AnswerSpec; display: string } {
  const options = input.options ?? [];
  // answer 在旧数据里可能是 null；这里统一成字符串，由各题型自己拒绝空答案
  const ans = String(input.answer ?? "").trim();
  switch (input.type) {
    case "single": {
      const index = Math.round(num(ans));
      if (!Number.isFinite(index) || index < 0 || index >= options.length) {
        throw new Error("单选答案索引无效");
      }
      return {
        spec: { kind: "single", index, options },
        display: `正确答案：${String.fromCharCode(65 + index)}. ${options[index]}`,
      };
    }
    case "multi": {
      const indices = ans
        .split(/[,，\s]+/)
        .filter(Boolean)
        .map((x) => Math.round(num(x)))
        .filter((n) => Number.isFinite(n) && n >= 0 && n < options.length);
      if (!indices.length) throw new Error("多选答案无效");
      const uniq = [...new Set(indices)].sort((a, b) => a - b);
      return {
        spec: { kind: "multi", indices: uniq, options },
        display: `正确答案：${uniq.map((i) => String.fromCharCode(65 + i)).join("、")}`,
      };
    }
    case "blank": {
      const parts = ans.split("||").map((p) => p.split("|").map((s) => s.trim()).filter(Boolean));
      if (parts.some((p) => p.length === 0)) throw new Error("填空答案为空");
      return {
        spec: { kind: "blank", blanks: mergeAccept(parts, input.accept), count: parts.length },
        display: `参考答案：${parts.map((p) => p.join(" / ")).join("；")}`,
      };
    }
    case "judge": {
      const v = /^(true|对|正确|是|yes|1)$/i.test(ans);
      const f = /^(false|错|错误|否|no|0)$/i.test(ans);
      if (!v && !f) throw new Error("判断题答案必须是 true/false");
      return { spec: { kind: "judge", value: v }, display: `正确答案：${v ? "正确" : "错误"}` };
    }
    case "order": {
      const order = ans
        .split(/[,，\s]+/)
        .filter(Boolean)
        .map((x) => Math.round(num(x)));
      if (order.length !== options.length || new Set(order).size !== options.length) {
        throw new Error("排序答案必须是所有项目的完整顺序");
      }
      if (order.some((i) => !Number.isFinite(i) || i < 0 || i >= options.length)) {
        throw new Error("排序答案索引越界");
      }
      return {
        spec: { kind: "order", order, items: options },
        display: `正确顺序：${order.map((i) => options[i]).join(" → ")}`,
      };
    }
    case "numeric": {
      const value = num(ans);
      if (!Number.isFinite(value)) throw new Error("计算题答案必须是数字");
      const tol = numericTolerance(value, input.tolerance);
      const alternates = (input.accept ?? []).map(num).filter((n) => Number.isFinite(n));
      return {
        spec: { kind: "numeric", value, tolerance: tol, unit: input.unit, alternates },
        display: `正确答案：${value}${input.unit ? " " + input.unit : ""}`,
      };
    }
    case "steps": {
      const steps = input.steps ?? [];
      const parts = ans.split("||").map((p) => p.split("|").map((s) => s.trim()).filter(Boolean));
      if (parts.length !== steps.length) throw new Error("分步骤答案数量与步骤数不一致");
      return {
        spec: { kind: "steps", blanks: mergeAccept(parts, input.accept), steps },
        display: `参考答案：${parts.map((p) => p.join(" / ")).join("；")}`,
      };
    }
    case "open": {
      return {
        spec: { kind: "open", rubric: input.rubric ?? [], modelAnswer: ans },
        display: "开放题：无唯一答案，按评分维度评阅",
      };
    }
  }
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function gradeAnswerInner(
  _type: ExerciseType,
  spec: AnswerSpec,
  raw: unknown,
  ctx: { usedHint: boolean },
): GradeResult {
  const fail = (feedback: string): GradeResult => ({
    graded: true,
    correct: false,
    score: 0,
    maxScore: 1,
    feedback,
  });

  /** 未判定：既不算对也不算错，不写入掌握度证据 */
  const unanswered = (feedback: string): GradeResult => ({
    graded: false,
    correct: false,
    score: 0,
    maxScore: 1,
    feedback,
  });

  // 空提交不是"答错"：早期实现里 Number("")=0、判断题空串兜底成 false，
  // 会让"正确答案是错"的判断题在什么都没选时被判对。这里统一按"未作答"处理。
  if (spec.kind !== "open" && isEmptySubmission(raw)) {
    return unanswered("还没有作答，本次不计入掌握度证据。");
  }

  switch (spec.kind) {
    case "single": {
      const idx = Number(raw);
      if (!Number.isFinite(idx)) return fail("没有识别到你的选择，请重新选择后提交。");
      if (idx === spec.index) {
        return {
          graded: true,
          correct: true,
          score: 1,
          maxScore: 1,
          feedback: ctx.usedHint
            ? "答案正确。不过这次你用了提示——把它记成「借助提示完成」，下次试着独立做一遍。"
            : "正确。",
        };
      }
      const picked = spec.options[idx] ?? "未知选项";
      return fail(
        `你选的是「${picked}」，这个选项不对。先对照题干的关键条件，再看下面的解析，找出你漏掉的那一步。`,
      );
    }

    case "multi": {
      const picked = [...new Set(asArray(raw).map((x) => Number(x)).filter((n) => Number.isFinite(n)))].sort(
        (a, b) => a - b,
      );
      const expected = spec.indices;
      const missing = expected.filter((i) => !picked.includes(i));
      const extra = picked.filter((i) => !expected.includes(i));
      if (!missing.length && !extra.length) {
        return { graded: true, correct: true, score: 1, maxScore: 1, feedback: "全对，选项判断准确。" };
      }
      const bits: string[] = [];
      if (missing.length) bits.push(`漏选了 ${missing.map((i) => String.fromCharCode(65 + i)).join("、")}`);
      if (extra.length) bits.push(`多选了 ${extra.map((i) => String.fromCharCode(65 + i)).join("、")}`);
      return {
        graded: true,
        correct: false,
        score: 0,
        maxScore: 1,
        feedback: `${bits.join("，")}。多选题每个选项都要独立判断是否成立，别只看像不像。`,
      };
    }

    case "blank": {
      const answers = asArray(raw).map(textOf);
      if (answers.length !== spec.count || answers.every((a) => a.trim() === "")) {
        return fail(`需要填 ${spec.count} 个空，你提交了 ${answers.length} 个。`);
      }
      const wrongIdx: number[] = [];
      answers.forEach((a, i) => {
        const accepted = spec.blanks[i] ?? [];
        if (!matchesAccepted(a, accepted)) wrongIdx.push(i + 1);
      });
      if (!wrongIdx.length) {
        return {
          graded: true,
          correct: true,
          score: 1,
          maxScore: 1,
          feedback: ctx.usedHint ? "填空正确（提示辅助完成）。" : "填空正确。",
        };
      }
      return fail(`第 ${wrongIdx.join("、")} 空不正确。回到定义逐字核对关键词，别凭印象填。`);
    }

    case "judge": {
      let v: boolean;
      if (typeof raw === "boolean") {
        v = raw;
      } else {
        const text = toHalfWidth(textOf(raw)).trim().toLowerCase();
        const truthy = /^(true|对|正确|是|yes|y|1)$/.test(text);
        const falsy = /^(false|错|错误|否|no|n|0)$/.test(text);
        // 认不出的输入不能再兜底成 false——那等于替学生选了一个答案
        if (!truthy && !falsy) {
          return unanswered("没有识别到「对 / 错」的判断，请重新选择后提交。");
        }
        v = truthy;
      }
      if (v === spec.value) {
        return { graded: true, correct: true, score: 1, maxScore: 1, feedback: "判断正确。" };
      }
      return fail(
        spec.value
          ? "这道题的陈述其实成立。你可能是被其中一个限定词误导了——把「一定/所有」这类词圈出来再看。"
          : "这道题的陈述不成立。它故意把条件偷换了，找出被偷换的那一处。",
      );
    }

    case "order": {
      const got = asArray(raw).map((x) => Number(x));
      if (got.length !== spec.order.length) return fail("排序尚未完成，请把所有项目都排进去。");
      const firstWrong = got.findIndex((v, i) => v !== spec.order[i]);
      if (firstWrong === -1) {
        return { graded: true, correct: true, score: 1, maxScore: 1, feedback: "顺序正确，流程理解到位。" };
      }
      return fail(
        `第 ${firstWrong + 1} 个位置放错了。这里的判断依据是「上一步的产出是不是下一步的输入」，按这个标准重新捋一遍。`,
      );
    }

    case "numeric": {
      const v = num(textOf(raw));
      if (!Number.isFinite(v)) {
        return fail("没有读到有效数字。如果是分数或公式，请写成小数或直接给出数值。");
      }
      const diff = Math.abs(v - spec.value);
      const ok =
        diff <= spec.tolerance + 1e-9 ||
        (spec.alternates ?? []).some((a) => Math.abs(v - a) <= spec.tolerance + 1e-9);
      if (ok) {
        return {
          graded: true,
          correct: true,
          score: 1,
          maxScore: 1,
          feedback: `数值正确${spec.unit ? `（${spec.unit}）` : ""}。`,
        };
      }
      const rel = spec.value !== 0 ? diff / Math.abs(spec.value) : diff;
      const hint0 =
        rel < 0.2
          ? "量级对得上，是计算过程里某一步出了偏差（常见：符号、单位换算、四舍五入太早）。"
          : rel < 2
            ? "结果偏离较大，先检查公式代入的量是否是题目给的那个量，再看单位。"
            : "结果差了数量级，八成是单位或小数点位置搞错了。";
      return fail(`答案 ${v} 不对。${hint0}`);
    }

    case "steps": {
      const answers = asArray(raw).map(textOf);
      if (answers.length !== spec.steps.length) {
        return fail(`这道题有 ${spec.steps.length} 个步骤，请逐步填写。`);
      }
      const perStep = 1 / spec.steps.length;
      let score = 0;
      const wrong: number[] = [];
      answers.forEach((a, i) => {
        const accepted = spec.blanks[i] ?? [];
        if (matchesAccepted(a, accepted)) score += perStep;
        else wrong.push(i + 1);
      });
      const correct = wrong.length === 0;
      return {
        graded: true,
        correct,
        score: Math.min(1, score),
        maxScore: 1,
        feedback: correct
          ? "每一步都对，推导链完整。"
          : `第 ${wrong.join("、")} 步出错。分步题的好处就在这里：错误被定位到了具体环节，不用整题重做。`,
      };
    }

    case "open": {
      return {
        graded: false,
        correct: false,
        score: 0,
        maxScore: 1,
        feedback: "开放题已保存，正在按评分维度评阅。",
      };
    }
  }
}

/**
 * 从判题结果推断错因。
 * 只用客观信息（漏选/量级/题型），不做心理归因；开放题交给评阅模型。
 */
export function inferErrorType(_type: ExerciseType, spec: AnswerSpec, raw: unknown): ErrorType | null {
  switch (spec.kind) {
    case "multi": {
      const picked = Array.isArray(raw) ? raw.map((x) => Number(x)) : [];
      const extra = picked.filter((i) => !spec.indices.includes(i));
      // 多选了不该选的 → 概念边界不清；只是漏选 → 审题/覆盖不全
      return extra.length ? "concept_confusion" : "misread";
    }
    case "numeric": {
      const v = Number(String(raw ?? "").replace(/[，,\s]/g, ""));
      if (!Number.isFinite(v)) return "expression";
      const rel = Math.abs(v - spec.value) / Math.max(1e-9, Math.abs(spec.value));
      return rel <= 0.2 ? "calculation" : "concept_confusion";
    }
    case "blank":
      return "expression";
    case "order":
      return "misread";
    case "steps":
      return "calculation";
    case "judge":
    case "single":
      // 只知道选错、不知道错因；不硬贴“概念混淆”，避免误导下一轮讲法
      return null;
    case "open":
      return "expression";
  }
}

export function gradeAnswer(
  type: ExerciseType,
  spec: AnswerSpec,
  raw: unknown,
  ctx: { usedHint: boolean },
): GradeResult {
  const result = gradeAnswerInner(type, spec, raw, ctx);
  if (result.graded && !result.correct) {
    result.errorType = inferErrorType(type, spec, raw);
  }
  return result;
}

/** 提交后展示给用户的"正确答案"文案（提交前绝不下发） */
/**
 * 判题后才能下发的结构化答案：只给选项下标，够前端把选项标成对/错。
 * 与 describeAnswer 同源，避免两处各推一套答案。
 * 填空/排序等没有"选项高亮"的题型返回 null，仍走文字版标准答案。
 */
export type AnswerReveal =
  | { kind: "single"; index: number }
  | { kind: "multi"; indices: number[] }
  | { kind: "judge"; value: boolean };

export function describeReveal(spec: AnswerSpec): AnswerReveal | null {
  switch (spec.kind) {
    case "single":
      return { kind: "single", index: spec.index };
    case "multi":
      return { kind: "multi", indices: [...spec.indices].sort((a, b) => a - b) };
    case "judge":
      return { kind: "judge", value: spec.value };
    default:
      return null;
  }
}

export function describeAnswer(spec: AnswerSpec): string {
  switch (spec.kind) {
    case "single":
      return `正确答案：${String.fromCharCode(65 + spec.index)}. ${spec.options[spec.index] ?? ""}`;
    case "multi":
      return `正确答案：${spec.indices.map((i) => String.fromCharCode(65 + i)).join("、")}`;
    case "blank":
      return `参考答案：${spec.blanks.map((p) => p.join(" / ")).join("；")}`;
    case "judge":
      return `正确答案：${spec.value ? "正确" : "错误"}`;
    case "order":
      return `正确顺序：${spec.order.map((i) => spec.items[i]).join(" → ")}`;
    case "numeric":
      return `正确答案：${spec.value}${spec.unit ? " " + spec.unit : ""}`;
    case "steps":
      return `参考答案：${spec.blanks.map((p) => p.join(" / ")).join("；")}`;
    case "open":
      return "开放题：按评分维度评阅";
  }
}
