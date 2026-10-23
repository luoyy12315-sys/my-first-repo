/**
 * 知识追踪（BKT, Bayesian Knowledge Tracing）
 *
 * 算法移植自 OpenTutor（MIT, Copyright (c) 2026 Zijin Zhang）
 *   apps/api/services/learning_science/knowledge_tracer.py
 * 原始论文：Corbett & Anderson (1994), "Knowledge tracing: Modeling the
 * acquisition of procedural knowledge".
 *
 * 本文件为 TypeScript 移植 + 改造：
 *  - 增加"提示依赖 / 独立完成 / 查看解析"三类证据的差异化权重（原实现无此概念）
 *  - 增加可解释的状态判定规则与原因文本
 * 掌握状态永远由"证据"推导，不由模型断言直接写入。
 */
import type { ConceptStatus, ExerciseType } from "@/lib/types";

export interface BktParams {
  pL0: number; // 先验：已掌握该知识点的概率
  pT: number; // 每次练习机会学会的概率
  pG: number; // 猜对概率（按题型）
  pS: number; // 会做却失误的概率
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function defaultParams(type: ExerciseType, difficulty = 2): BktParams {
  const pG =
    type === "judge"
      ? 0.5
      : type === "single"
        ? 0.25
        : type === "multi"
          ? 0.12
          : type === "blank" || type === "steps"
            ? 0.08
            : type === "numeric"
              ? 0.06
              : 0.05;
  return {
    pL0: 0.1,
    pT: clamp(0.22 - (difficulty - 2) * 0.02, 0.1, 0.3),
    pG,
    pS: 0.1,
  };
}

/** 单次观测后的后验，再做学习转移 → 下一次的先验 */
export function bktStep(prior: number, correct: boolean, p: BktParams): number {
  const L = clamp(prior, 0.001, 0.999);
  const numerator = correct ? L * (1 - p.pS) : L * p.pS;
  const denominator = correct ? L * (1 - p.pS) + (1 - L) * p.pG : L * p.pS + (1 - L) * (1 - p.pG);
  if (denominator <= 0) return L;
  const posterior = numerator / denominator;
  return clamp(posterior + (1 - posterior) * p.pT, 0.001, 0.999);
}

export interface ConceptState {
  status: ConceptStatus;
  pMastery: number;
  evidenceCount: number;
  independentCorrect: number;
  hintUses: number;
  wrongStreak: number;
  distinctExercises: number;
  lastStudiedAt: number | null;
}

export interface EvidenceInput {
  correct: boolean;
  score: number;
  independent: boolean; // 未查看解析
  hintUsed: boolean;
  exerciseId?: string;
  type: ExerciseType;
  difficulty?: number;
}

export interface EvidenceOutcome {
  next: ConceptState;
  changed: boolean;
  reason: string;
  countedForMastery: boolean;
}

/**
 * 把一次作答并入知识点状态。
 * 规则（可解释、可回溯）：
 *  1. 查看解析后作答 → 不计入掌握度（避免"抄答案变掌握"）。
 *  2. 用了提示 → 仍计入，但把猜测率提高（证据变弱），且不算独立完成。
 *  3. 状态只能由证据组合推导，单次答对不足以判定"暂时掌握"。
 */
export function applyEvidence(
  prev: ConceptState,
  ev: EvidenceInput,
  now: number,
  seenExercises: Set<string> = new Set(),
): EvidenceOutcome {
  if (!ev.independent) {
    return {
      next: { ...prev, lastStudiedAt: now },
      changed: false,
      reason: "查看了参考答案后作答，本次不计入掌握度证据",
      countedForMastery: false,
    };
  }

  const params = defaultParams(ev.type, ev.difficulty ?? 2);
  // 提示 = 更强的"猜对"可能，证据更弱
  const effective: BktParams = ev.hintUsed
    ? { ...params, pG: clamp(params.pG + 0.18, 0, 0.9), pS: clamp(params.pS + 0.05, 0, 0.9) }
    : params;

  const pMastery = bktStep(prev.pMastery, ev.correct, effective);
  const evidenceCount = prev.evidenceCount + 1;
  const distinct = new Set(seenExercises);
  if (ev.exerciseId) distinct.add(ev.exerciseId);

  const independentCorrect =
    prev.independentCorrect + (ev.correct && !ev.hintUsed ? 1 : 0);
  const hintUses = prev.hintUses + (ev.hintUsed ? 1 : 0);
  const wrongStreak = ev.correct ? 0 : prev.wrongStreak + 1;

  const draft: ConceptState = {
    ...prev,
    pMastery,
    evidenceCount,
    independentCorrect,
    hintUses,
    wrongStreak,
    distinctExercises: distinct.size,
    lastStudiedAt: now,
  };
  const { status, reason } = deriveStatus(draft, prev.status);

  return {
    next: { ...draft, status },
    changed: status !== prev.status,
    reason,
    countedForMastery: true,
  };
}

/** 状态推导：所有阈值都写明，便于用户质疑与人工纠正 */
export function deriveStatus(
  s: Pick<
    ConceptState,
    | "evidenceCount"
    | "pMastery"
    | "independentCorrect"
    | "distinctExercises"
    | "wrongStreak"
    | "hintUses"
  >,
  previous: ConceptStatus,
): { status: ConceptStatus; reason: string } {
  if (s.evidenceCount === 0) return { status: "untouched", reason: "尚无作答证据" };

  // 已判定掌握：出错一次就降级，避免"一次通过永久掌握"的假象
  if (previous === "mastered" && s.wrongStreak >= 1) {
    return { status: "initial", reason: "此前判定为暂时掌握，但最近一次作答出错，降级待复测" };
  }

  if (
    s.pMastery >= 0.85 &&
    s.independentCorrect >= 3 &&
    s.distinctExercises >= 3 &&
    s.wrongStreak === 0
  ) {
    return {
      status: "mastered",
      reason: `p(掌握)=${s.pMastery.toFixed(2)}，独立正确 ${s.independentCorrect} 次、覆盖 ${s.distinctExercises} 道不同题目，且当前无连续错误`,
    };
  }
  if (s.pMastery >= 0.6 && s.independentCorrect >= 1) {
    return {
      status: "initial",
      reason: `p(掌握)=${s.pMastery.toFixed(2)}，已有 ${s.independentCorrect} 次独立正确作答`,
    };
  }
  if (s.wrongStreak >= 2) {
    return { status: "needs_work", reason: `连续 ${s.wrongStreak} 次作答出错，需要换讲法巩固` };
  }
  if (s.evidenceCount >= 2 && s.pMastery < 0.4) {
    return { status: "needs_work", reason: `已作答 ${s.evidenceCount} 次，p(掌握) 仍为 ${s.pMastery.toFixed(2)}` };
  }
  return {
    status: "learning",
    reason: `已有 ${s.evidenceCount} 次作答证据，p(掌握)=${s.pMastery.toFixed(2)}`,
  };
}

/** 时间衰减：长期未复测时提示需要重新验证（不直接改 p 值，避免"时间打败证据"） */
export function stalenessDays(lastStudiedAt: number | null, now: number): number {
  if (!lastStudiedAt) return Infinity;
  return Math.floor((now - lastStudiedAt) / 86400000);
}
