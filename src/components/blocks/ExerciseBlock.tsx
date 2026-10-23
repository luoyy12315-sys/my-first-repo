"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Check,
  CircleHelp,
  Lightbulb,
  Maximize2,
  RefreshCw,
  SkipForward,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge, Button, Spinner, cx } from "@/components/ui/kit";
import NextActions from "@/components/chat/NextActions";
import Markdown from "@/components/Markdown";
import { AnswerInput, answerValueFor, type Draft } from "@/components/blocks/AnswerInput";
import { ERROR_LABEL, EXERCISE_TYPE_LABEL, type AttemptDTO, type ExercisePublic } from "@/lib/types";
import { toast } from "sonner";
import { uuid } from "@/lib/utils";

interface AttemptResult {
  attempt: AttemptDTO;
  graded: boolean;
  correct: boolean | null;
  score: number | null;
  duplicate: boolean;
  concept: { id: string; name: string; status: string; pMastery: number } | null;
}

const DISCUSS_CORRECT =
  "这道题我做对了，但我想确认自己是不是真的理解了——请用一个变式题或追问来检验我。";
const DISCUSS_WRONG = "这道题我做错了，请针对我出错的地方讲一遍，不要直接给答案。";
const DISCUSS_UNGRADED = "这道题我已提交但还没评阅，请帮我看看我的思路，不要直接给答案。";

export default function ExerciseBlock({
  blockId,
  exercise: initialExercise,
  expanded,
  onAsk,
  onOpenWorkspace,
  onNextStep,
  nextStepLabel,
}: {
  blockId: string;
  exercise?: ExercisePublic | null;
  expanded?: boolean;
  onAsk?: (text: string) => void;
  onOpenWorkspace?: () => void;
  onNextStep?: () => void | Promise<void>;
  nextStepLabel?: string;
}) {
  const router = useRouter();
  const [exercise, setExercise] = useState<ExercisePublic | null>(initialExercise ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [pending, setPending] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [viewedSolution, setViewedSolution] = useState(false);
  const [solution, setSolution] = useState<{ correctDisplay: string; explanation?: string | null } | null>(null);
  const [confirmSolution, setConfirmSolution] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [feedbackVote, setFeedbackVote] = useState<string | null>(null);
  const [brokenOpen, setBrokenOpen] = useState(false);
  const [brokenNote, setBrokenNote] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  const startedAt = useRef(Date.now());
  // 同一份作答复用同一个幂等键：连点 / 网络重试都只会产生一条记录
  const idemRef = useRef<{ sig: string; key: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exerciseId = exercise?.id;

  const load = useCallback(async () => {
    if (!exerciseId) return;
    try {
      const [exRes, blockRes] = await Promise.all([
        fetch(`/api/exercises/${exerciseId}`, { cache: "no-store" }),
        fetch(`/api/blocks/${blockId}`, { cache: "no-store" }),
      ]);
      if (!exRes.ok) throw new Error("练习读取失败");
      const exData = (await exRes.json()) as {
        exercise: ExercisePublic;
        attempts: (AttemptDTO & { userAnswer?: unknown })[];
      };
      setExercise(exData.exercise);
      if (blockRes.ok) {
        const b = (await blockRes.json()) as { block: { state?: { draft?: Draft; usedHint?: boolean } } };
        const st = b.block?.state as
          | { draft?: Draft; usedHint?: boolean; viewedSolution?: boolean }
          | undefined;
        if (st?.draft) setDraft(st.draft);
        if (st?.usedHint) setUsedHint(true);
        if (st?.viewedSolution) setViewedSolution(true);
      }
      const last = exData.attempts.at(-1);
      if (last) {
        setResult({
          attempt: last,
          graded: last.isCorrect !== null,
          correct: last.isCorrect,
          score: last.score,
          duplicate: false,
          concept: null,
        });
        setUsedHint(last.usedHint);
        setViewedSolution(last.viewedSolution);
      }
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [exerciseId, blockId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 草稿保存：只落组件状态，不是学习证据
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch(`/api/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: { draft, usedHint, viewedSolution } }),
      }).catch(() => undefined);
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, usedHint, viewedSolution, blockId]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const answerValue = useMemo(() => answerValueFor(exercise, draft), [draft, exercise]);

  const submit = async () => {
    if (!exercise || pending) return;
    if (answerValue == null) {
      toast.error("先作答再提交");
      return;
    }
    const sig = JSON.stringify(answerValue);
    if (!idemRef.current || idemRef.current.sig !== sig) {
      idemRef.current = { sig, key: uuid() };
    }
    setPending(true);
    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          exerciseId: exercise.id,
          answer: answerValue,
          usedHint,
          viewedSolution,
          durationMs: Date.now() - startedAt.current,
          idempotencyKey: idemRef.current.key,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "提交失败");
      }
      const data = (await res.json()) as AttemptResult;
      setResult(data);
      // 计划步骤的验证进度/自动完成可能刚刚变化，让会话与计划页一起刷新
      window.dispatchEvent(new Event("plans:changed"));
      window.dispatchEvent(new Event("session:progress"));
      if (data.graded) {
        if (data.correct) toast.success("答对了");
        else toast.message("这次没有答对", { description: "看看下面的反馈，再决定要不要重试。" });
      } else {
        toast.message("已提交，等待评阅");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const revealSolution = async () => {
    if (!exercise) return;
    try {
      const res = await fetch(`/api/exercises/${exercise.id}/solution`, { method: "POST" });
      const data = (await res.json()) as {
        correctDisplay?: string;
        explanation?: string | null;
        error?: string;
      };
      if (!res.ok || !data.correctDisplay) {
        toast.error(data.error ?? "解析获取失败");
        return;
      }
      setSolution({ correctDisplay: data.correctDisplay, explanation: data.explanation ?? null });
      setViewedSolution(true);
      setConfirmSolution(false);
      toast.message("已显示解析", { description: "本次作答将标记为非独立完成。" });
    } catch {
      toast.error("解析获取失败");
    }
  };

  const sendFeedback = async (vote: "easy" | "hard" | "broken", note?: string) => {
    if (!exercise) return;
    try {
      const res = await fetch(`/api/exercises/${exercise.id}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vote, note }),
      });
      const data = (await res.json()) as { voidedConcepts?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "反馈失败");
      setFeedbackVote(vote);
      setBrokenOpen(false);
      if (vote === "broken") {
        toast.message("已把这道题标记为有问题", {
          description: "它产生的作答证据已作废，掌握度按剩余证据重算。",
        });
      } else {
        toast.success(vote === "easy" ? "已记录：太简单" : "已记录：太难");
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const retry = async () => {
    if (!exercise || retrying) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/exercises/${exercise.id}/retry`, { method: "POST" });
      const data = (await res.json()) as { error?: string; type?: string };
      if (!res.ok) throw new Error(data.error ?? "换题失败");
      toast.success(`已换一题（${EXERCISE_TYPE_LABEL[(data.type as keyof typeof EXERCISE_TYPE_LABEL) ?? "single"]}）`);
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRetrying(false);
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

  const askHint = async () => {
    if (!exercise || hintLoading) return;
    setHintLoading(true);
    try {
      const res = await fetch(`/api/exercises/${exercise.id}/hint`, { method: "POST" });
      const data = (await res.json()) as { hint?: string | null; message?: string };
      if (data.hint) {
        setHint(data.hint);
        setUsedHint(true);
      } else {
        toast.message(data.message ?? "暂时没有可用的提示");
      }
    } catch {
      toast.error("提示获取失败");
    } finally {
      setHintLoading(false);
    }
  };

  if (loadError) {
    return (
      <div className="rounded-2xl border border-bad/30 bg-badsoft/40 p-4 text-[13px] text-bad">
        练习加载失败：{loadError}
        <button onClick={() => void load()} className="ml-2 underline">
          重试
        </button>
      </div>
    );
  }

  if (!exercise) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel p-4 text-[13px] text-ink3">
        <Spinner /> 正在读取练习…
      </div>
    );
  }

  if (skipped) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel2/50 p-4 text-[13px] text-ink3">
        <span>已跳过这道题（不会计入掌握度）。</span>
        <Button size="sm" variant="secondary" onClick={() => setSkipped(false)}>
          返回作答
        </Button>
      </div>
    );
  }

  const answered = result != null;
  const inputDisabled = pending;
  // 只有“已判定且答对”才提供离开本步的动作；答错/未评阅先建议讨论或重做。
  const canMoveNext = Boolean(result?.graded && result.correct);
  const hasNext = Boolean(canMoveNext && onNextStep);
  const answerActions = [
    ...(hasNext
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
            label: "讲讲这道题",
            primary: !hasNext,
            onClick: () =>
              onAsk!(
                result?.graded === false
                  ? DISCUSS_UNGRADED
                  : result?.correct
                    ? DISCUSS_CORRECT
                    : DISCUSS_WRONG,
              ),
          },
        ]
      : []),
    ...(exercise.conceptId
      ? [
          {
            label: "看知识点",
            icon: <BookOpen className="size-3" />,
            onClick: () => router.push(`/library?c=${exercise.conceptId}`),
          },
        ]
      : []),
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Badge tone="accent">{EXERCISE_TYPE_LABEL[exercise.type]}</Badge>
          <span className="text-[11.5px] text-ink3">
            难度 {"●".repeat(exercise.difficulty)}
            {"○".repeat(Math.max(0, 5 - exercise.difficulty))}
          </span>
          {exercise.solved ? <Badge tone="ok">已答对过</Badge> : null}
          {exercise.attemptCount && exercise.attemptCount > 0 && !exercise.solved ? (
            <span className="text-[11.5px] text-ink3">已尝试 {exercise.attemptCount} 次</span>
          ) : null}
        </div>
        {onOpenWorkspace && !expanded ? (
          <button
            onClick={onOpenWorkspace}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-ink3 hover:bg-panel2 hover:text-ink"
          >
            <Maximize2 className="size-3.5" />
            工作区
          </button>
        ) : null}
      </div>

      <div className="px-4 py-3.5">
        <Markdown>{exercise.prompt}</Markdown>

        {exercise.verification !== "passed" ? (
          <div className="mt-3 flex gap-2 rounded-xl border border-warn/25 bg-warnsoft/40 px-3 py-2.5 text-[12px] leading-relaxed text-ink2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
            <div>
              <span className="font-medium text-warn">
                {exercise.verification === "ambiguous" ? "题目口径可能有争议" : "本题未完成二次校验"}
              </span>
              {exercise.verificationNote ? `：${exercise.verificationNote}` : "。"}
              <span className="mt-0.5 block text-[11.5px] text-ink3">本次作答不计入掌握度。</span>
            </div>
          </div>
        ) : null}

        <div className="mt-3.5">
          <AnswerInput
            exercise={exercise}
            draft={draft}
            set={set}
            disabled={inputDisabled}
            submitted={answered}
          />
        </div>

        {hint ? (
          <div className="mt-3 flex gap-2 rounded-xl border border-warn/25 bg-warnsoft/50 px-3 py-2.5 text-[12.8px] leading-relaxed text-ink">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-warn" />
            <div>
              <span className="font-medium text-warn">提示：</span>
              {hint}
              <span className="mt-1 block text-[11.5px] text-ink3">
                {exercise.verification === "passed"
                  ? "使用提示后，本次仍计入证据但不算独立完成。"
                  : "本题不计入掌握度。"}
              </span>
            </div>
          </div>
        ) : null}

        {result ? (
          <ResultPanel
            result={result}
            exercise={exercise}
            explanationVisible={Boolean(solution) || viewedSolution || Boolean(result?.graded)}
          />
        ) : null}

        {confirmSolution && !solution ? (
          <div className="mt-3 rounded-xl border border-warn/30 bg-warnsoft/50 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink">
            查看解析会直接给出答案，本次作答将标记为「非独立完成」，<strong className="text-warn">不计入掌握度</strong>。
            确定要看吗？
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={revealSolution}>
                确认查看
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmSolution(false)}>
                我再想想
              </Button>
            </div>
          </div>
        ) : null}

        {solution ? (
          <div className="mt-3 rounded-xl border border-line bg-panel2/70 px-3.5 py-3">
            <p className="text-[12.5px] font-medium text-ink">解析</p>
            <p className="mt-1 text-[12.5px] text-ink2">{solution.correctDisplay}</p>
            {solution.explanation ? (
              <div className="mt-2">
                <Markdown className="text-[13px]">{solution.explanation}</Markdown>
              </div>
            ) : null}
            <p className="mt-2 text-[11px] text-ink3">已标记「非独立完成」，本次作答不计入掌握度。</p>
          </div>
        ) : null}
      </div>

      {answered && answerActions.length ? (
        <div className="border-t border-line px-4 py-2">
          <NextActions busy={nextBusy || pending} actions={answerActions} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        {!answered || result?.correct === false ? (
          <Button size="sm" onClick={submit} loading={pending} disabled={answerValue == null} icon={<Check className="size-3.5" />}>
            {result?.correct === false ? "重新提交" : "提交答案"}
          </Button>
        ) : null}
        {!answered ? (
          <>
            <Button size="sm" variant="ghost" onClick={askHint} loading={hintLoading} icon={<Lightbulb className="size-3.5" />}>
              给我提示
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<CircleHelp className="size-3.5" />}
              onClick={() => setConfirmSolution(true)}
            >
              查看解析
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-ink3"
              icon={<SkipForward className="size-3.5" />}
              onClick={() => {
                setSkipped(true);
                toast.message("已跳过", { description: "不计入掌握度。可以让 AI 换一题或换种讲法。" });
              }}
            >
              跳过
            </Button>
          </>
        ) : null}
        {answered ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw className="size-3.5" />}
              onClick={() => {
                setResult(null);
                setDraft({});
                setSolution(null);
                setConfirmSolution(false);
                setViewedSolution(false);
                setHint(null);
                setUsedHint(false);
                setSkipped(false);
                // 同答案重做也要产生新证据：换一个新的幂等键
                idemRef.current = null;
                startedAt.current = Date.now();
                // 服务端也要重置：否则"这次不再用提示"会被上次的标记顶掉
                if (exercise) {
                  void fetch(`/api/exercises/${exercise.id}/reset`, { method: "POST" }).catch(
                    () => undefined,
                  );
                }
              }}
            >
              再做一次
            </Button>
          </>
        ) : null}
      </div>

      {/* 题目反馈与换一题（C2）：让"题不对"成为可执行的信号，而不是硬做 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel2/30 px-4 py-2 text-[11.5px] text-ink3">
        <span>这道题：</span>
        {feedbackVote ? (
          <span className="text-ok">
            已反馈（{feedbackVote === "easy" ? "太简单" : feedbackVote === "hard" ? "太难" : "有问题"}）
          </span>
        ) : (
          <>
            <button onClick={() => void sendFeedback("easy")} className="rounded-full px-2 py-0.5 hover:bg-panel2 hover:text-ink">
              太简单
            </button>
            <button onClick={() => void sendFeedback("hard")} className="rounded-full px-2 py-0.5 hover:bg-panel2 hover:text-ink">
              太难
            </button>
            <button
              onClick={() => setBrokenOpen((v) => !v)}
              className="rounded-full px-2 py-0.5 hover:bg-badsoft hover:text-bad"
            >
              有问题
            </button>
          </>
        )}
        <button
          onClick={retry}
          disabled={retrying}
          className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-accentink hover:bg-accentsoft disabled:opacity-50"
        >
          <RefreshCw className={cx("size-3", retrying && "animate-spin")} />
          {retrying ? "生成中…" : "换一题（换题型）"}
        </button>
      </div>

      {brokenOpen ? (
        <div className="border-t border-line bg-badsoft/30 px-4 py-2.5">
          <p className="mb-1.5 text-[12px] text-ink2">
            这道题哪里有问题？（会作废它产生的证据，掌握度按剩余证据重算）
          </p>
          <div className="flex gap-2">
            <input
              value={brokenNote}
              onChange={(e) => setBrokenNote(e.target.value)}
              placeholder="例如：条件不足 / 答案有误 / 与讲解冲突"
              className="flex-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-bad"
            />
            <Button size="sm" variant="danger" onClick={() => void sendFeedback("broken", brokenNote)}>
              提交
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResultPanel({
  result,
  exercise,
  explanationVisible,
}: {
  result: AttemptResult;
  exercise: ExercisePublic;
  explanationVisible: boolean;
}) {
  const { attempt, correct, graded, concept } = result;
  const tone = !graded ? "neutral" : correct ? "ok" : "bad";
  return (
    <div
      className={cx(
        "mt-3.5 rounded-xl border px-3.5 py-3",
        tone === "ok"
          ? "border-ok/30 bg-oksoft/50"
          : tone === "bad"
            ? "border-bad/30 bg-badsoft/40"
            : "border-line bg-panel2/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cx(
            "flex size-5 items-center justify-center rounded-full text-white",
            tone === "ok" ? "bg-ok" : tone === "bad" ? "bg-bad" : "bg-ink3",
          )}
        >
          {tone === "ok" ? <Check className="size-3" /> : tone === "bad" ? <X className="size-3" /> : "…"}
        </span>
        <span className="text-[13px] font-medium text-ink">
          {graded ? (correct ? "答对了" : "没有答对") : "已提交，未评阅"}
          {typeof attempt.score === "number" && graded && !correct ? (
            <span className="ml-1 font-normal text-ink3">（得分 {Math.round(attempt.score * 100)}%）</span>
          ) : null}
        </span>
        {attempt.errorType ? (
          <Badge tone="warn" className="ml-1">
            错因：{ERROR_LABEL[attempt.errorType] ?? attempt.errorType}
          </Badge>
        ) : null}
        <span className="ml-auto text-[11px] text-ink3">第 {attempt.attemptNo} 次提交</span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink2">{attempt.feedback}</p>
      {attempt.correctDisplay ? (
        <p className="mt-1.5 text-[12.5px] text-ink2">{attempt.correctDisplay}</p>
      ) : null}
      {explanationVisible && attempt.explanation ? (
        <div className="mt-2 border-t border-line/70 pt-2">
          <Markdown className="text-[13px]">{attempt.explanation}</Markdown>
        </div>
      ) : null}
      {concept ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/70 pt-2 text-[11.5px] text-ink3">
          <span>知识点「{concept.name}」</span>
          <Badge tone={correct ? "accent" : "warn"}>
            掌握度 {concept.pMastery.toFixed(2)}
          </Badge>
          <span>· 已随本次作答更新</span>
        </div>
      ) : null}
      {exercise.type === "open" && !graded ? (
        <p className="mt-1.5 text-[11.5px] text-ink3">开放题未评阅时不计入掌握度证据。</p>
      ) : null}
    </div>
  );
}
