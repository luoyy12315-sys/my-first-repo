"use client";

import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { cx } from "@/components/ui/kit";
import Markdown from "@/components/Markdown";
import type { AnswerReveal } from "@/lib/learning/exercise";
import type { ExercisePublic } from "@/lib/types";

export type Draft = {
  single?: number | null;
  multi?: number[];
  blank?: string[];
  judge?: boolean | null;
  order?: number[];
  numeric?: string;
  steps?: string[];
  open?: string;
};

const LETTERS = "ABCDEFGHIJ";

/** 选项在「未判题 / 判对 / 判错 / 漏选的正确项」下的视觉状态 */
type OptionState = "idle" | "selected" | "correct" | "missed" | "wrong";

const OPTION_CLASS: Record<OptionState, string> = {
  idle: "border-line hover:border-linestrong hover:bg-panel2/50",
  selected: "border-accent bg-accentsoft/60",
  correct: "border-ok bg-oksoft/70",
  missed: "border-ok/45 bg-oksoft/30",
  wrong: "border-bad bg-badsoft/60",
};

export function answerValueFor(exercise: ExercisePublic | null, draft: Draft): unknown | null {
  if (!exercise) return null;
  switch (exercise.type) {
    case "single":
      return draft.single ?? null;
    case "multi":
      return (draft.multi ?? []).length ? draft.multi : null;
    case "blank":
      return (draft.blank ?? []).some((v) => v?.trim()) ? draft.blank : null;
    case "judge":
      return draft.judge ?? null;
    case "order":
      return (draft.order ?? []).length === exercise.options.length ? draft.order : null;
    case "numeric":
      return draft.numeric?.trim() ? draft.numeric.trim() : null;
    case "steps":
      return (draft.steps ?? []).some((v) => v?.trim()) ? draft.steps : null;
    case "open":
      return draft.open?.trim() ? draft.open.trim() : null;
  }
}

/** 单选/多选/判断/填空/排序/计算/分步骤/开放题的共享作答控件 */
export function AnswerInput({
  exercise,
  draft,
  set,
  disabled,
  submitted,
  reveal,
}: {
  exercise: ExercisePublic;
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  disabled: boolean;
  submitted: boolean;
  /** 服务端在判定后下发的答案下标；未判定时为 null/undefined */
  reveal?: AnswerReveal | null;
}) {
  const type = exercise.type;
  // 只有已提交且拿到答案时才标对错；用户改选后重新提交会拿到新的结果
  const shown = submitted ? reveal ?? null : null;

  const singleState = (i: number, selected: boolean): OptionState => {
    if (!shown || shown.kind !== "single") return selected ? "selected" : "idle";
    if (shown.index === i) return "correct";
    return selected ? "wrong" : "idle";
  };

  const multiState = (i: number, selected: boolean): OptionState => {
    if (!shown || shown.kind !== "multi") return selected ? "selected" : "idle";
    const isCorrect = shown.indices.includes(i);
    if (isCorrect) return selected ? "correct" : "missed";
    return selected ? "wrong" : "idle";
  };

  if (type === "single") {
    return (
      <div className="flex flex-col gap-2">
        {exercise.options.map((opt, i) => {
          const selected = draft.single === i;
          const state = singleState(i, selected);
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => set("single", i)}
              aria-pressed={selected}
              aria-invalid={state === "wrong" ? true : undefined}
              className={cx(
                "flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all",
                OPTION_CLASS[state],
              )}
            >
              <span
                className={cx(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[12px] font-medium",
                  state === "correct"
                    ? "border-ok bg-ok text-white"
                    : state === "missed"
                      ? "border-ok text-ok"
                      : state === "wrong"
                        ? "border-bad bg-bad text-white"
                        : selected
                          ? "border-accent bg-accent text-white"
                          : "border-line text-ink3",
                )}
              >
                {LETTERS[i]}
              </span>
              <span className="min-w-0 flex-1 text-[14px] leading-6 text-ink">
                <Markdown className="[&_.md]:text-[14px]">{opt}</Markdown>
              </span>
              {state === "correct" ? <Check className="mt-1 size-4 shrink-0 text-ok" aria-label="正确" /> : null}
              {state === "missed" ? (
                <Check className="mt-1 size-4 shrink-0 text-ok/60" aria-label="未选中的正确项" />
              ) : null}
              {state === "wrong" ? <X className="mt-1 size-4 shrink-0 text-bad" aria-label="错误" /> : null}
            </button>
          );
        })}
      </div>
    );
  }

  if (type === "multi") {
    const chosen = draft.multi ?? [];
    return (
      <div className="flex flex-col gap-2">
        {exercise.options.map((opt, i) => {
          const selected = chosen.includes(i);
          const state = multiState(i, selected);
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() =>
                set("multi", selected ? chosen.filter((x) => x !== i) : [...chosen, i].sort((a, b) => a - b))
              }
              aria-pressed={selected}
              className={cx(
                "flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all",
                OPTION_CLASS[state],
              )}
            >
              <span
                className={cx(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] border text-[12px]",
                  state === "correct"
                    ? "border-ok bg-ok text-white"
                    : state === "missed"
                      ? "border-ok text-ok"
                      : state === "wrong"
                        ? "border-bad bg-bad text-white"
                        : selected
                          ? "border-accent bg-accent text-white"
                          : "border-line text-ink3",
                )}
              >
                {selected || state === "missed" ? <Check className="size-3" /> : LETTERS[i]}
              </span>
              <span className="min-w-0 flex-1 text-[14px] leading-6 text-ink">
                <Markdown className="[&_.md]:text-[14px]">{opt}</Markdown>
              </span>
              {state === "wrong" ? <X className="mt-1 size-4 shrink-0 text-bad" aria-label="多选错误" /> : null}
            </button>
          );
        })}
        <p className="text-[12px] text-ink3">
          可多选，全部选对才算对。{shown?.kind === "multi" ? "绿色为正确选项。" : ""}
        </p>
      </div>
    );
  }

  if (type === "judge") {
    return (
      <div className="flex gap-2">
        {[
          { v: true, label: "正确" },
          { v: false, label: "错误" },
        ].map((o) => {
          const selected = draft.judge === o.v;
          const state: OptionState =
            shown?.kind === "judge"
              ? shown.value === o.v
                ? "correct"
                : selected
                  ? "wrong"
                  : "idle"
              : selected
                ? "selected"
                : "idle";
          return (
            <button
              key={String(o.v)}
              disabled={disabled}
              onClick={() => set("judge", o.v)}
              aria-pressed={selected}
              className={cx(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-4 py-3 text-[14px] transition-all",
                state === "correct"
                  ? "border-ok bg-oksoft/70 text-ok"
                  : state === "wrong"
                    ? "border-bad bg-badsoft/60 text-bad"
                    : state === "selected"
                      ? "border-accent bg-accentsoft/60 text-accentink"
                      : "border-line text-ink hover:bg-panel2/60",
              )}
            >
              {o.label}
              {state === "correct" ? <Check className="size-3.5" /> : null}
              {state === "wrong" ? <X className="size-3.5" /> : null}
            </button>
          );
        })}
      </div>
    );
  }

  if (type === "blank") {
    const arr = draft.blank ?? Array(exercise.blanks).fill("");
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: exercise.blanks }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[12px] text-ink3">第 {i + 1} 空</span>
            <input
              value={arr[i] ?? ""}
              disabled={disabled}
              onChange={(e) => {
                const next = [...arr];
                next[i] = e.target.value;
                set("blank", next);
              }}
              placeholder="填入关键词"
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-[14px] text-ink outline-none focus:border-accent"
            />
          </div>
        ))}
      </div>
    );
  }

  if (type === "order") {
    const order = draft.order ?? [];
    const remaining = exercise.options.map((_, i) => i).filter((i) => !order.includes(i));
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-dashed border-line bg-panel2/40 p-2.5">
          <p className="mb-1.5 px-1 text-[12px] uppercase tracking-wide text-ink3">待排序 · 点击加入</p>
          <div className="flex flex-wrap gap-1.5">
            {remaining.length === 0 ? (
              <span className="px-1 py-1 text-[12px] text-ink3">已全部加入</span>
            ) : (
              remaining.map((i) => (
                <button
                  key={i}
                  disabled={disabled}
                  onClick={() => set("order", [...order, i])}
                  className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12.5px] text-ink hover:border-accent hover:text-accentink"
                >
                  {exercise.options[i]}
                </button>
              ))
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          {order.length === 0 ? (
            <p className="px-1 py-2 text-[12.5px] text-ink3">按正确顺序依次点击上方项目。</p>
          ) : (
            order.map((idx, pos) => (
              <div key={idx} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2">
                <span className="w-5 text-center text-[12px] tabular-nums text-ink3">{pos + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{exercise.options[idx]}</span>
                <button
                  disabled={disabled || pos === 0}
                  onClick={() => {
                    const next = [...order];
                    [next[pos - 1], next[pos]] = [next[pos], next[pos - 1]];
                    set("order", next);
                  }}
                  className="rounded p-1 text-ink3 hover:bg-panel2 disabled:opacity-30"
                  aria-label="上移"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  disabled={disabled || pos === order.length - 1}
                  onClick={() => {
                    const next = [...order];
                    [next[pos + 1], next[pos]] = [next[pos], next[pos + 1]];
                    set("order", next);
                  }}
                  className="rounded p-1 text-ink3 hover:bg-panel2 disabled:opacity-30"
                  aria-label="下移"
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  disabled={disabled}
                  onClick={() => set("order", order.filter((x) => x !== idx))}
                  className="rounded p-1 text-ink3 hover:bg-panel2"
                  aria-label="移出"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (type === "numeric") {
    return (
      <div className="flex items-center gap-2">
        <input
          value={draft.numeric ?? ""}
          disabled={disabled}
          inputMode="decimal"
          onChange={(e) => set("numeric", e.target.value)}
          placeholder="输入数值"
          className="w-full max-w-[240px] rounded-xl border border-line bg-panel px-3 py-2 font-mono text-[15px] text-ink outline-none focus:border-accent"
        />
        {exercise.unit ? <span className="text-[13px] text-ink3">{exercise.unit}</span> : null}
      </div>
    );
  }

  if (type === "steps") {
    const arr = draft.steps ?? Array(exercise.steps.length).fill("");
    return (
      <div className="flex flex-col gap-2.5">
        {exercise.steps.map((s, i) => (
          <div key={i} className="rounded-xl border border-line bg-panel2/30 p-2.5">
            <p className="mb-1.5 text-[12.5px] text-ink2">
              <span className="mr-1 text-ink3">第 {i + 1} 步</span>
              {s}
            </p>
            <input
              value={arr[i] ?? ""}
              disabled={disabled}
              onChange={(e) => {
                const next = [...arr];
                next[i] = e.target.value;
                set("steps", next);
              }}
              placeholder="这一步的结果"
              className="w-full rounded-lg border border-line bg-panel px-3 py-1.5 text-[13.5px] text-ink outline-none focus:border-accent"
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <textarea
      value={draft.open ?? ""}
      disabled={disabled}
      onChange={(e) => set("open", e.target.value)}
      rows={5}
      placeholder="写下你的理解。开放题按评分维度评阅，不要求唯一答案。"
      className="w-full resize-y rounded-xl border border-line bg-panel px-3 py-2.5 text-[14px] leading-relaxed text-ink outline-none focus:border-accent"
    />
  );
}
