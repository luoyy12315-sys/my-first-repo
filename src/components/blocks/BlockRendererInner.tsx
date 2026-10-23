"use client";

import ChartBlock from "./ChartBlock";
import ExerciseBlock from "./ExerciseBlock";
import QuizBlock from "./QuizBlock";
import SimulatorBlock from "./SimulatorBlock";
import { NoteBlock, StepsBlock, TableBlock } from "./StaticBlocks";
import type { BlockWithExercise } from "@/lib/api/serialize";

export default function BlockRendererInner({
  block,
  expanded,
  onAsk,
  onOpenWorkspace,
  onNextStep,
  nextStepLabel,
}: {
  block: BlockWithExercise;
  expanded?: boolean;
  onAsk?: (text: string) => void;
  onOpenWorkspace?: () => void;
  onNextStep?: () => void | Promise<void>;
  nextStepLabel?: string;
}) {
  const raw = (block.payload ?? {}) as Record<string, unknown>;
  // 标题可能存在于 payload，也可能只存在于 block 记录上（例如 save_plan 生成的路线块）
  const payload = {
    ...raw,
    title: (raw.title as string | undefined) ?? block.title ?? undefined,
  };

  switch (block.kind) {
    case "chart":
      return <ChartBlock payload={payload as never} />;
    case "table":
      return <TableBlock payload={payload as never} />;
    case "steps":
      return <StepsBlock payload={payload as never} />;
    case "note":
      return <NoteBlock payload={payload as never} />;
    case "simulator":
      return <SimulatorBlock block={block} expanded={expanded} onAsk={onAsk} />;
    case "exercise":
      return (
        <ExerciseBlock
          blockId={block.id}
          exercise={block.exercise ?? null}
          expanded={expanded}
          onAsk={onAsk}
          onOpenWorkspace={onOpenWorkspace}
          onNextStep={onNextStep}
          nextStepLabel={nextStepLabel}
        />
      );
    case "quiz":
      return (
        <QuizBlock
          blockId={block.id}
          title={block.title ?? undefined}
          exercises={block.quizExercises ?? []}
          onAsk={onAsk}
          onNextStep={onNextStep}
          nextStepLabel={nextStepLabel}
        />
      );
    default:
      return (
        <div className="rounded-xl border border-line bg-panel2/50 p-3 text-[12.5px] text-ink3">
          该组件类型（{String(block.kind)}）暂不支持渲染。
        </div>
      );
  }
}
