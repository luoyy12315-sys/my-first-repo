"use client";

import BlockRendererInner from "./BlockRendererInner";
import ErrorBoundary from "./ErrorBoundary";
import type { BlockWithExercise } from "@/lib/api/serialize";

export default function BlockRenderer(props: {
  block: BlockWithExercise;
  expanded?: boolean;
  onAsk?: (text: string) => void;
  onOpenWorkspace?: () => void;
  onNextStep?: () => void | Promise<void>;
  nextStepLabel?: string;
}) {
  return (
    <ErrorBoundary label={`block:${props.block.kind}`}>
      <BlockRendererInner {...props} />
    </ErrorBoundary>
  );
}
