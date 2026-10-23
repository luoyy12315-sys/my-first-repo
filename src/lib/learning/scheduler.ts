/**
 * 复习调度（FSRS 启发式简化版）
 *
 * 设计取舍：不引入完整 FSRS-5 权重训练，改用可解释的稳定性/难度更新规则，
 * 保证每条调度都能被人读懂，同时保留 difficulty/stability/reps/lapses 四个
 * 字段，未来可无缝替换为完整 FSRS 实现。
 * 字段命名参考 OpenTutor 的 learning_progress（MIT）。
 */
export type ReviewGrade = "again" | "hard" | "good" | "easy";

export interface ScheduleState {
  stability: number; // 记忆稳定度（天）
  difficulty: number; // 1..10
  reps: number;
  lapses: number;
}

export interface ScheduleResult extends ScheduleState {
  intervalDays: number;
  nextReviewAt: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const DAY = 86400000;

export function reviewGradeFromAttempt(args: {
  correct: boolean;
  usedHint: boolean;
  durationMs?: number | null;
}): ReviewGrade {
  if (!args.correct) return "again";
  if (args.usedHint) return "hard";
  if (args.durationMs != null && args.durationMs < 8000) return "easy";
  return "good";
}

export function scheduleNext(
  prev: ScheduleState,
  grade: ReviewGrade,
  now: number,
): ScheduleResult {
  let stability = prev.stability || 1;
  let difficulty = clamp(prev.difficulty || 5, 1, 10);
  let reps = prev.reps;
  let lapses = prev.lapses;

  switch (grade) {
    case "again":
      stability = Math.max(0.4, stability * 0.35);
      difficulty = clamp(difficulty + 0.2, 1, 10);
      lapses += 1;
      break;
    case "hard":
      stability = Math.max(0.6, stability * 1.15);
      difficulty = clamp(difficulty + 0.1, 1, 10);
      reps += 1;
      break;
    case "good":
      stability = stability * (1.5 + (0.3 * (10 - difficulty)) / 10);
      difficulty = clamp(difficulty - 0.05, 1, 10);
      reps += 1;
      break;
    case "easy":
      stability = stability * 2.2;
      difficulty = clamp(difficulty - 0.15, 1, 10);
      reps += 1;
      break;
  }

  stability = clamp(stability, 0.4, 365);
  const intervalDays = clamp(Math.round(stability), 1, 180);
  return {
    stability,
    difficulty,
    reps,
    lapses,
    intervalDays,
    nextReviewAt: now + intervalDays * DAY,
  };
}
