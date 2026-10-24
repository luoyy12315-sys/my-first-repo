"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, cx } from "@/components/ui/kit";
import Markdown from "@/components/Markdown";
import NextActions from "@/components/chat/NextActions";
import { AnswerInput, answerValueFor, type Draft } from "@/components/blocks/AnswerInput";
import { uuid } from "@/lib/utils";
import {
  ERROR_LABEL,
  EXERCISE_TYPE_LABEL,
  type AttemptDTO,
  type ExercisePublic,
} from "@/lib/types";

interface QuizResultItem extends AttemptDTO {
  exerciseId: string;
  correctDisplay?: string | null;
  explanation?: string | null;
}

interface QuizResult {
  summary: {
    total: number;
    correctCount: number;
    gradedCount: number;
    score: number;
    allCorrect: boolean;
    evidenceCount: number;
  };
  results: QuizResultItem[];
}

export default function QuizBlock({
  blockId,
  title,
  exercises,
  onAsk,
  onNextStep,
  nextStepLabel,
}: {
  blockId: string;
  title?: string;
  exercises: ExercisePublic[];
  onAsk?: (text: string) => void;
  onNextStep?: () => void | Promise<void>;
  nextStepLabel?: string;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Draft>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [pending, setPending] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  const idemRef = useRef<{ sig: string; key: string } | null>(null);

  const answeredCount = useMemo(
    () =>
      exercises.filter((ex) => answerValueFor(ex, answers[ex.id] ?? {}) != null).length,
    [exercises, answers],
  );
  const allAnswered = exercises.length > 0 && answeredCount === exercises.length;
  const conceptIds = new Set(exercises.map((e) => e.conceptId).filter((id): id is string => Boolean(id)));
  const singleConcept = conceptIds.size === 1 ? exercises.find((e) => e.conceptId) ?? null : null;

  const setAnswer = <K extends keyof Draft>(exerciseId: string, key: K, value: Draft[K]) =>
    setAnswers((prev) => ({
      ...prev,
      [exerciseId]: { ...(prev[exerciseId] ?? {}), [key]: value },
    }));

  const submit = async () => {
    if (pending || !exercises.length) return;
    if (!allAnswered) {
      toast.error(`还有 ${exercises.length - answeredCount} 题未作答`);
      return;
    }
    const payload = exercises.map((ex) => ({
      exerciseId: ex.id,
      answer: answerValueFor(ex, answers[ex.id] ?? {}),
    }));
    const sig = JSON.stringify(payload);
    if (!idemRef.current || idemRef.current.sig !== sig) {
      idemRef.current = { sig, key: uuid() };
    }
    setPending(true);
    try {
      const res = await fetch(`/api/quizzes/${blockId}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: payload,
          idempotencyKey: idemRef.current.key,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as QuizResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "提交失败");
      setResult(data);
      window.dispatchEvent(new Event("plans:changed"));
      window.dispatchEvent(new Event("session:progress"));
      const s = data.summary;
      if (s.allCorrect) toast.success(`全部答对：${s.correctCount}/${s.total}`);
      else toast.message(`答对 ${s.correctCount}/${s.total} 题`, { description: "先看错题解析，再决定要不要重做。" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const reset = () => {
    setResult(null);
    setAnswers({});
    idemRef.current = null;
    for (const ex of exercises) {
      void fetch(`/api/exercises/${ex.id}/reset`, { method: "POST" }).catch(() => undefined);
    }
  };

  const handleNext = async () => {
    if (!onNextStep || nextBusy) return;
    setNextBusy(true);
    try {
      await onNextStep();
    } finally {
      setNextBusy(false);
    }
  };

  const allCorrect = result?.summary.allCorrect ?? false;
  const unlinked = exercises.length > 0 && exercises.every((exercise) => !exercise.conceptId);
  const canAdvance = Boolean(
    result && allCorrect && (result.summary.evidenceCount === result.summary.total || unlinked),
  );
  const wrongNumbers = result
    ? result.results
        .map((r, i) => (!r.isCorrect ? i + 1 : null))
        .filter((n): n is number => n !== null)
    : [];
  const discussPrompt = allCorrect
    ? "这套小测我全对了，但我想确认自己是不是真的理解——请用变式题或追问再检验一次，不要重复原题。"
    : `这套小测我错了第 ${wrongNumbers.join("、")} 题。请针对错题换个讲法解释，不要直接给答案。`;
  const actions = result
    ? [
        ...(canAdvance && onNextStep
          ? [
              {
                label: nextStepLabel ?? "继续下一步",
                primary: true,
                onClick: () => void handleNext(),
              },
            ]
          : []),
        ...(onAsk
          ? [
              {
                label: "讲讲这套题",
                primary: !canAdvance,
                onClick: () => onAsk(discussPrompt),
              },
            ]
          : []),
        ...(singleConcept?.conceptId
          ? [
              {
                label: "看知识点",
                icon: <BookOpen className="size-3" />,
                onClick: () => router.push(`/library?c=${singleConcept.conceptId}`),
              },
            ]
          : []),
      ]
    : [];

  if (!exercises.length) {
    return (
      <div className="rounded-2xl border border-line bg-panel2/50 p-4 text-[13px] text-ink3">
        小测题目读取失败。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Badge tone="accent">小测 · {exercises.length} 题</Badge>
          {unlinked ? <Badge tone="neutral">对话练习 · 不写入档案</Badge> : null}
          {conceptIds.size > 1 ? (
            <Badge tone="neutral">覆盖 {conceptIds.size} 个知识点</Badge>
          ) : null}
          <span className="truncate text-[13px] font-medium text-ink">{title ?? "阶段小测"}</span>
        </div>
        <span className="text-[12px] text-ink3">
          {result
            ? `答对 ${result.summary.correctCount}/${result.summary.total} 题`
            : `已作答 ${answeredCount}/${exercises.length}`}
        </span>
      </div>

      {exercises.map((exercise, index) => {
        const item = result?.results.find((r) => r.exerciseId === exercise.id);
        return (
          <div key={exercise.id} className="border-t border-line px-4 py-4 first:border-t-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-ink3">
                第 {index + 1} 题 · 共 {exercises.length} 题
              </span>
              <Badge tone="neutral">{EXERCISE_TYPE_LABEL[exercise.type]}</Badge>
              <span className="text-[12px] text-ink3">
                难度 {"●".repeat(exercise.difficulty)}
                {"○".repeat(Math.max(0, 5 - exercise.difficulty))}
              </span>
              {exercise.verification !== "passed" ? (
                <Badge tone="warn">
                  {exercise.verification === "ambiguous" ? "口径可能有争议" : "未完成二次校验"}
                </Badge>
              ) : null}
              {exercise.conceptId && exercise.conceptName ? (
                <Link
                  href={`/library?c=${exercise.conceptId}`}
                  className="max-w-[240px] truncate text-[12px] text-ink3 underline-offset-2 hover:text-accentink hover:underline"
                >
                  档案 · {exercise.conceptName}
                </Link>
              ) : null}
            </div>

            <Markdown>{exercise.prompt}</Markdown>

            <div className="mt-3">
              <AnswerInput
                exercise={exercise}
                draft={answers[exercise.id] ?? {}}
                set={(key, value) => setAnswer(exercise.id, key, value)}
                disabled={pending || Boolean(result)}
                submitted={Boolean(result)}
              />
            </div>

            {item ? <QuizItemResult item={item} exercise={exercise} /> : null}
          </div>
        );
      })}

      {result ? (
        <div className="border-t border-line bg-panel2/35 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cx(
                "flex size-6 items-center justify-center rounded-full text-white",
                allCorrect ? "bg-ok" : "bg-warn",
              )}
            >
              {allCorrect ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            </span>
            <p className="text-[13.5px] font-medium text-ink">
              答对 {result.summary.correctCount}/{result.summary.total} 题
            </p>
            <span className="text-[12px] text-ink3">
              平均得分 {Math.round(result.summary.score * 100)}%
            </span>
            {result.summary.evidenceCount < result.summary.total && !unlinked ? (
              <span className="text-[12px] text-ink3">
                · {result.summary.total - result.summary.evidenceCount} 题未计入掌握度
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-ink3">
            {unlinked
              ? "这组题用于对话中的即时检验，不写入正式学习档案，也不改变课程进度。"
              : canAdvance
                ? "全部答对并计入掌握度。可以继续下一步，或让 AI 用变式题再验证一次。"
                : allCorrect
                  ? "全部答对，但本组有题目未通过二次校验，未计入掌握度；先讨论或重做后再推进。"
                  : "先看每题反馈与解析；答错或未评阅的题目不会给离开本步的按钮。"}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        {!result ? (
          <Button
            size="sm"
            onClick={() => void submit()}
            loading={pending}
            disabled={!allAnswered}
            icon={<Check className="size-3.5" />}
          >
            提交小测
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={reset} icon={<RefreshCw className="size-3.5" />}>
            再做一次
          </Button>
        )}
        {!result ? (
          <span className="text-[12px] text-ink3">
            {allAnswered ? "所有题目已作答，可以提交" : `还有 ${exercises.length - answeredCount} 题未作答`}
          </span>
        ) : null}
      </div>

      {result && actions.length ? (
        <div className="border-t border-line px-4 py-2">
          <NextActions busy={nextBusy} actions={actions} />
        </div>
      ) : null}
    </div>
  );
}

function QuizItemResult({
  item,
  exercise,
}: {
  item: QuizResultItem;
  exercise: ExercisePublic;
}) {
  const graded = item.isCorrect !== null;
  const correct = item.isCorrect === true;
  return (
    <div
      className={cx(
        "mt-3 rounded-xl border px-3.5 py-3",
        !graded
          ? "border-line bg-panel2/50"
          : correct
            ? "border-ok/30 bg-oksoft/50"
            : "border-bad/30 bg-badsoft/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cx(
            "flex size-5 items-center justify-center rounded-full text-white",
            !graded ? "bg-ink3" : correct ? "bg-ok" : "bg-bad",
          )}
        >
          {!graded ? "…" : correct ? <Check className="size-3" /> : <X className="size-3" />}
        </span>
        <span className="text-[12.5px] font-medium text-ink">
          {!graded ? "已提交，未评阅" : correct ? "答对了" : "没有答对"}
        </span>
        {item.errorType ? <Badge tone="warn">错因：{ERROR_LABEL[item.errorType] ?? item.errorType}</Badge> : null}
        {exercise.verification !== "passed" ? (
          <Badge tone="neutral">本题未计入掌握度</Badge>
        ) : null}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink2">
        {item.feedback}
      </p>
      {item.correctDisplay ? (
        <p className="mt-1 text-[12px] text-ink2">{item.correctDisplay}</p>
      ) : null}
      {item.explanation ? (
        <div className="mt-2 border-t border-line/70 pt-2">
          <Markdown className="text-[13px]">{item.explanation}</Markdown>
        </div>
      ) : null}
    </div>
  );
}
