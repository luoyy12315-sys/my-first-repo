"use client";

/**
 * 全局搜索：对话 / 计划 / 知识点 / 材料一起搜。
 * 侧栏「搜索」或移动端顶栏放大镜打开；输入即搜，↑↓ 选择、Enter 打开、Esc 关闭。
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CornerDownLeft, FileText, MessageSquare, Route, Search } from "lucide-react";
import { cx } from "@/components/ui/kit";
import { formatDay } from "@/lib/utils";
import type { SearchGroup, SearchHit, SessionSummary } from "@/lib/types";

const GROUP_ICON = {
  sessions: MessageSquare,
  plans: Route,
  concepts: BookOpen,
  materials: FileText,
} as const;

/** 标题里命中的片段加底色，扫结果时不用再读一遍上下文 */
function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.trim();
  if (!needle) return <>{text}</>;
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-accentsoft px-0.5 text-accentink">
        {text.slice(i, i + needle.length)}
      </mark>
      {text.slice(i + needle.length)}
    </>
  );
}

export default function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [recent, setRecent] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 打开时清空并取最近对话（空关键词时给点东西看）
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setGroups([]);
    setActive(0);
    setLoading(true);
    let cancelled = false;
    fetch("/api/sessions?limit=8", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d: { sessions: SessionSummary[] }) => {
        if (!cancelled) setRecent(d.sessions ?? []);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
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

  const q = query.trim();

  // 输入即搜（160ms 防抖，够快也不会每个键都打一次接口）
  useEffect(() => {
    if (!open) return;
    if (!q) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : { groups: [] }))
        .then((d: { groups: SearchGroup[] }) => setGroups(d.groups ?? []))
        .catch(() => {
          /* 关掉弹层或网络失败：保持上次结果，不弹错 */
        })
        .finally(() => setLoading(false));
    }, 160);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [q, open]);

  // 把分组摊平成一份列表，方向键跨组移动
  const flat: SearchHit[] = useMemo(
    () => groups.flatMap((g) => g.hits),
    [groups],
  );

  const shownGroups: SearchGroup[] = useMemo(() => {
    if (q) return groups;
    return recent.length
      ? [{ key: "sessions", label: "最近", hits: recent.map((s) => ({
          id: s.id,
          title: s.title,
          meta: s.planTitle ? `对话 · ${s.planTitle}` : "对话",
          href: `/s/${s.id}`,
          at: s.updatedAt,
        })) }]
      : [];
  }, [q, groups, recent]);

  const shownFlat: SearchHit[] = useMemo(() => {
    if (q) return flat;
    return shownGroups.flatMap((g) => g.hits);
  }, [q, flat, shownGroups]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (shownFlat.length ? (i + 1) % shownFlat.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (shownFlat.length ? (i - 1 + shownFlat.length) % shownFlat.length : 0));
      } else if (e.key === "Enter") {
        const target = shownFlat[active];
        if (target) {
          e.preventDefault();
          go(target.href);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  let cursor = -1;
  const total = shownFlat.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="搜索"
        className="relative w-full max-w-[600px] overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-lg)] animate-pop"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search className="size-4 shrink-0 text-ink3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索对话、计划、知识点、材料"
            aria-label="搜索"
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink3"
          />
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {shownFlat.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] text-ink3">
              {loading ? "搜索中…" : q ? `没有找到「${q}」相关的内容。` : "还没有对话。"}
            </p>
          ) : (
            shownGroups.map((g) => {
              const Icon = GROUP_ICON[g.key];
              return (
                <div key={g.key} className="mb-1 last:mb-0">
                  <p className="px-2.5 pb-1 pt-2 text-[12px] text-ink3">{g.label}</p>
                  {g.hits.map((h) => {
                    cursor += 1;
                    const index = cursor;
                    return (
                      <button
                        key={`${g.key}-${h.id}`}
                        type="button"
                        data-index={index}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(h.href)}
                        className={cx(
                          "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                          index === active ? "bg-accentsoft/60" : "hover:bg-panel2",
                        )}
                      >
                        <Icon className="size-3.5 shrink-0 text-ink3" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-ink">
                            <Highlight text={h.title} q={q} />
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-ink3">{h.meta}</span>
                        </span>
                        {h.at ? (
                          <span className="shrink-0 text-[12px] text-ink3">{formatDay(h.at)}</span>
                        ) : null}
                        {index === active ? (
                          <CornerDownLeft className="size-3.5 shrink-0 text-ink3" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {total > 0 ? (
          <div className="border-t border-line px-4 py-2 text-[12px] text-ink3">
            {q ? `共 ${total} 条结果` : "最近的对话"}
          </div>
        ) : null}
      </div>
    </div>
  );
}