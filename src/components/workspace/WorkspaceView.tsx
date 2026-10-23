"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUp, Loader2 } from "lucide-react";
import BlockRenderer from "@/components/blocks/BlockRenderer";
import { Badge, EmptyState, Spinner, cx } from "@/components/ui/kit";
import { toast } from "sonner";
import type { BlockWithExercise } from "@/lib/api/serialize";
import { stripInlineMarkdown } from "@/lib/text";

export default function WorkspaceView({ blockId }: { blockId: string }) {
  const router = useRouter();
  const sessionId = useSearchParams().get("s");
  const [block, setBlock] = useState<BlockWithExercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspace/${blockId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("组件不存在或已随会话删除");
      const data = (await res.json()) as { block: BlockWithExercise };
      setBlock(data.block);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [blockId]);

  useEffect(() => {
    void load();
  }, [load]);

  const back = () => router.push(block?.sessionId ? `/s/${block.sessionId}` : sessionId ? `/s/${sessionId}` : "/");

  const submitAsk = async () => {
    const text = ask.trim();
    if (!text || asking) return;
    setAsking(true);
    try {
      const res = await fetch(`/api/workspace/${blockId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as { error?: string; sessionId?: string };
      if (!res.ok) throw new Error(data.error ?? "提问失败");
      toast.success("已发送，回到对话查看回复");
      router.push(`/s/${data.sessionId ?? block?.sessionId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAsking(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState
          title={error}
          description="工作区内容可能已随会话删除。"
          action={
            <button onClick={back} className="text-[13px] text-accentink underline">
              返回
            </button>
          }
        />
      </div>
    );
  }

  if (!block) {
    return (
      <div className="flex h-dvh items-center justify-center gap-2 text-[13px] text-ink3">
        <Spinner /> 正在恢复工作区…
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-3 backdrop-blur-md md:px-6">
        <button
          onClick={back}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] text-ink2 transition-colors hover:bg-panel2 hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          返回对话
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[15px] text-ink">
            {stripInlineMarkdown(block.title ?? "学习工作区")}
          </p>
        </div>
        <Badge tone="neutral">
          {block.kind === "simulator" ? "互动模拟器" : block.kind === "exercise" ? "练习" : block.kind}
        </Badge>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-3 py-5 md:px-6">
        <BlockRenderer block={block} expanded onAsk={(t) => setAsk(t)} />
        <p className="mt-4 text-[11.5px] leading-relaxed text-ink3">
          工作区状态会自动保存（参数、作答草稿），刷新或离开再回来可继续。注意：临时调参和草稿不会计入掌握度，只有正式提交的作答才会。
        </p>
      </main>

      <div className="sticky bottom-0 border-t border-line bg-bg/90 px-3 py-3 backdrop-blur-md md:px-6">
        <div className="mx-auto flex w-full max-w-4xl items-end gap-2 rounded-2xl border border-line bg-panel px-3 py-2 focus-within:border-accent/60">
          <textarea
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submitAsk();
              }
            }}
            rows={1}
            placeholder="就这个组件问点什么（一次性生成，回复写回当前会话）"
            className="max-h-32 min-h-[32px] flex-1 resize-none bg-transparent py-1.5 text-[14px] text-ink outline-none placeholder:text-ink3"
          />
          <button
            onClick={submitAsk}
            disabled={!ask.trim() || asking}
            className={cx(
              "mb-0.5 flex size-8 items-center justify-center rounded-full bg-accent text-white transition-all hover:brightness-110 disabled:opacity-35",
            )}
          >
            {asking ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
