"use client";

/**
 * 搜索对话：像 ChatGPT 的搜索一样，点侧栏「搜索对话」或 ⌘/Ctrl+K 打开，
 * 输入即过滤，↑↓ 选择、Enter 打开、Esc 关闭。不占侧栏常驻空间。
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { cx } from "@/components/ui/kit";
import { formatDay } from "@/lib/utils";
import type { SessionSummary } from "@/lib/types";

export default function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 每次打开都重新取：新会话、重命名要立刻能搜到
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setLoading(true);
    let cancelled = false;
    fetch("/api/sessions?limit=200", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d: { sessions: SessionSummary[] }) => {
        if (!cancelled) setSessions(d.sessions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    const pool = q
      ? sessions.filter((s) => `${s.title} ${s.planTitle ?? ""}`.toLowerCase().includes(q))
      : sessions;
    return pool.slice(0, q ? 20 : 8);
  }, [sessions, q]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  const go = useCallback(
    (id: string) => {
      onClose();
      router.push(`/s/${id}`);
    },
    [onClose, router],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (results.length ? (i + 1) % results.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
      } else if (e.key === "Enter") {
        const target = results[active];
        if (target) {
          e.preventDefault();
          go(target.id);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, active, go, onClose]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="搜索对话"
        className="relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-lg)] animate-pop"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search className="size-4 shrink-0 text-ink3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索对话"
            aria-label="搜索对话"
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink3"
          />
          <kbd className="shrink-0 rounded-md border border-line bg-panel2 px-1.5 py-0.5 font-mono text-[12px] text-ink3">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink3">
              {loading ? "读取中…" : q ? `没有找到「${query.trim()}」相关的对话。` : "还没有对话。"}
            </p>
          ) : (
            results.map((s, i) => (
              <button
                key={s.id}
                type="button"
                data-index={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(s.id)}
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                  i === active ? "bg-accentsoft/60" : "hover:bg-panel2",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-ink">{s.title}</span>
                  {s.planTitle ? (
                    <span className="mt-0.5 block truncate text-[12px] text-ink3">{s.planTitle}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[12px] text-ink3">{formatDay(s.updatedAt)}</span>
                {i === active ? (
                  <CornerDownLeft className="size-3.5 shrink-0 text-ink3" />
                ) : null}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[12px] text-ink3">
          <span>{q ? `${results.length} 个结果` : "最近的对话"}</span>
          <span className="ml-auto flex items-center gap-2">
            <span>↑↓ 选择</span>
            <span>Enter 打开</span>
          </span>
        </div>
      </div>
    </div>
  );
}