"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, ExternalLink, FileText, Globe, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge, Spinner, cx } from "@/components/ui/kit";
import type { SourceDTO } from "@/lib/types";

const FEEDBACK_KINDS: { value: string; label: string }[] = [
  { value: "irrelevant", label: "不相关" },
  { value: "outdated", label: "已过期" },
  { value: "paywall", label: "打不开" },
  { value: "wrong", label: "内容有误" },
];

function formatDate(ts?: number | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function Card({ src, index }: { src: SourceDTO; index: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const isWeb = src.kind === "web";
  const meta = (src.meta ?? {}) as { page?: number | null; heading?: string | null; materialName?: string };

  const submit = async (kind: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/source-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceId: src.id,
          url: src.url ?? undefined,
          domain: src.domain ?? undefined,
          kind,
        }),
      });
      if (!res.ok) throw new Error("提交失败");
      setSent(true);
      setMenuOpen(false);
      toast.success("已记录", { description: "这条反馈会留作后续来源质量排查依据。" });
    } catch {
      toast.error("提交失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      id={`source-${src.id}`}
      className="group/src relative flex gap-2.5 rounded-xl border border-line bg-panel px-3 py-2.5"
    >
      <div className="mt-0.5 shrink-0">
        {isWeb ? (
          <Globe className="size-3.5 text-accent" />
        ) : (
          <FileText className="size-3.5 text-accent" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={isWeb ? "accent" : "neutral"}>{isWeb ? "网络" : "材料"}</Badge>
          <span className="truncate text-[12.5px] font-medium text-ink">{src.title}</span>
          {src.stale ? <Badge tone="warn">可能已过期</Badge> : null}
          {meta.page ? <Badge tone="neutral">第 {meta.page} 页</Badge> : null}
        </div>

        <p className="mt-0.5 text-[12px] text-ink3">
          {isWeb ? (
            <>
              {src.domain ?? "未知站点"}
              {formatDate(src.publishedAt) ? ` · 发布 ${formatDate(src.publishedAt)}` : ""}
              {" · "}检索于 {formatDate(src.retrievedAt)}
            </>
          ) : (
            <>
              本地材料{meta.heading ? ` · ${meta.heading}` : ""} · 引用标记 [{src.id.toUpperCase()}]
            </>
          )}
        </p>

        {src.snippet ? (
          <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-ink2">{src.snippet}</p>
        ) : null}

        <div className="mt-1.5 flex items-center gap-2">
          {isWeb && src.url ? (
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-accentink hover:underline"
            >
              打开原页 <ExternalLink className="size-3" />
            </a>
          ) : meta.page || src.title ? (
            <Link
              href={`/materials?chunk=${encodeURIComponent(String((src.meta as { chunkId?: string })?.chunkId ?? ""))}`}
              className="inline-flex items-center gap-1 text-[12px] text-accentink hover:underline"
            >
              打开材料 <BookOpen className="size-3" />
            </Link>
          ) : null}
        </div>
      </div>

      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="mt-0.5 h-6 shrink-0 rounded-full p-1 text-ink3 opacity-60 transition-opacity hover:bg-panel2 hover:text-ink sm:opacity-0 sm:group-hover/src:opacity-100"
        aria-label="这条来源有问题"
        title="这条来源有问题"
      >
        {sent ? <AlertTriangle className="size-3.5" /> : <MoreHorizontal className="size-3.5" />}
      </button>

      {menuOpen ? (
        <div className="absolute right-2 top-9 z-40 w-40 overflow-hidden rounded-2xl border border-line bg-panel p-1.5 shadow-[var(--shadow-lg)] animate-pop">
          <p className="px-2 pb-1 pt-0.5 text-[12px] text-ink3">这条来源有问题</p>
          {FEEDBACK_KINDS.map((k) => (
            <button
              key={k.value}
              disabled={busy}
              onClick={() => void submit(k.value)}
              className="block w-full rounded-xl px-2 py-1.5 text-left text-[12.5px] text-ink2 transition-colors hover:bg-panel2 hover:text-ink disabled:opacity-50"
            >
              {k.label}
            </button>
          ))}
        </div>
      ) : null}

      <span className="absolute -left-1.5 top-1.5 hidden text-[12px] text-ink3 group-hover/src:inline">
        [{index + 1}]
      </span>
    </div>
  );
}

export default function SourceCards({
  sources,
  loading,
  status,
}: {
  sources?: SourceDTO[];
  loading?: boolean;
  status?: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-ink3">
        <Spinner /> 正在查证网络来源…
      </div>
    );
  }
  if (!sources || sources.length === 0) {
    return status ? <p className="text-[12px] text-ink3">{status}</p> : null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[12px] text-ink3">参考了 {sources.length} 个来源</p>
      {sources.map((s, i) => (
        <div key={s.id} className={cx("flex gap-2", i > 0 && "")}>
          <div className="min-w-0 flex-1">
            <Card src={s} index={i} />
          </div>
        </div>
      ))}
    </div>
  );
}