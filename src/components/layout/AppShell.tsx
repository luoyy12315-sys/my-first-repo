"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Compass,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Repeat2,
  Route,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { cx } from "@/components/ui/kit";
import type { SessionSummary } from "@/lib/types";

const NAV = [
  { href: "/", label: "学习", icon: Compass },
  { href: "/plan", label: "计划", icon: Route },
  { href: "/review", label: "复习", icon: Repeat2 },
  { href: "/archive", label: "档案", icon: Library },
];

const COLLAPSE_KEY = "lumina-sidebar-collapsed";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const immersive = pathname.startsWith("/w/");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { sessions: SessionSummary[] };
        // 搜索要覆盖更早的会话，展示仍然只取最近几条
        setSessions(data.sessions.slice(0, 40));
      }
    } catch {
      /* 侧边栏属于次要信息，失败静默 */
    }
  }, []);

  // 折叠状态记在本机：换页、刷新都保持不变
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  useEffect(() => {
    if (immersive) return;
    void load();
    // 会话被重命名 / 新建 / 删除后，主区发一个事件，侧栏立即跟上，
    // 否则同一会话会出现"主区新名字、侧栏旧名字"。
    const onChange = () => void load();
    window.addEventListener("sessions:changed", onChange);
    return () => window.removeEventListener("sessions:changed", onChange);
  }, [pathname, load, immersive]);

  // 不在这里落库：空会话点了又不用会污染侧栏和历史。
  // 统一回首页输入框，真正发出第一条消息时再创建会话。
  if (immersive) {
    return <>{children}</>;
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/s/");
    if (href === "/archive") {
      return ["/archive", "/library", "/history", "/materials"].some((p) => pathname.startsWith(p));
    }
    return pathname.startsWith(href);
  };

  const q = query.trim().toLowerCase();
  const visibleSessions = useMemo(() => {
    if (!q) return sessions.slice(0, 6);
    return sessions
      .filter((s) => `${s.title} ${s.planTitle ?? ""}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [sessions, q]);

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* 键盘用户不必先 Tab 过 12 个侧栏项才能到正文 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-white"
      >
        跳到主内容
      </a>
      {/* ── 桌面侧边栏（可折叠成图标栏） ── */}
      <aside
        className={cx(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-panel/60 backdrop-blur-sm transition-[width] duration-200 md:flex",
          collapsed ? "w-[68px]" : "w-[248px]",
        )}
      >
        <div className={cx("flex items-center gap-1 pb-2 pt-5", collapsed ? "justify-center px-2" : "justify-between pl-5 pr-2")}>
          <Link
            href="/"
            className="font-serif text-[21px] font-semibold tracking-tight text-ink transition-opacity hover:opacity-70"
            title="Lumina"
          >
            {collapsed ? <Sparkles className="size-[18px] text-accent" /> : "Lumina"}
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-expanded={!collapsed}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
            className="grid size-8 shrink-0 place-items-center rounded-full text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        <div className={collapsed ? "px-3 pb-2" : "px-3 pb-2"}>
          <Link
            href="/"
            title="新对话"
            className={cx(
              "flex items-center justify-center gap-1.5 rounded-full bg-accent text-[13px] font-medium text-white transition-all hover:brightness-110",
              collapsed ? "size-10" : "px-3 py-2",
            )}
          >
            <Plus className="size-4" />
            {collapsed ? <span className="sr-only">新对话</span> : "新对话"}
          </Link>
        </div>

        <nav className={cx("mt-1 flex flex-col gap-0.5", collapsed ? "px-2" : "px-3")}>
          {NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={cx(
                  "flex items-center rounded-full transition-colors",
                  collapsed ? "h-10 justify-center" : "gap-2.5 px-3 py-2",
                  active
                    ? "bg-accentsoft font-medium text-accentink"
                    : "text-ink2 hover:bg-panel2 hover:text-ink",
                )}
              >
                <Icon className={cx("size-4", active ? "text-accent" : "text-ink3")} />
                {collapsed ? (
                  <span className="sr-only">{item.label}</span>
                ) : (
                  <span className="text-[13.5px]">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {collapsed ? (
          <div className="min-h-0 flex-1" />
        ) : (
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 no-scrollbar">
            <label className="mb-3 flex items-center gap-2 rounded-full border border-line bg-panel2/60 px-3 py-1.5 focus-within:border-accent">
              <Search className="size-3.5 shrink-0 text-ink3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuery("");
                }}
                placeholder="搜索对话"
                aria-label="搜索对话"
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink3"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="清空搜索"
                  className="shrink-0 rounded-full text-ink3 hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </label>

            <p className="px-3 pb-2 text-[12px] text-ink3">{q ? "搜索结果" : "最近"}</p>
            <div className="flex flex-col gap-0.5">
              {visibleSessions.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-ink3">{q ? "没有匹配的对话。" : "还没有对话。"}</p>
              ) : (
                visibleSessions.map((s) => (
                  <Link
                    key={s.id}
                    href={`/s/${s.id}`}
                    className={cx(
                      "rounded-xl px-3 py-1.5 transition-colors",
                      pathname === `/s/${s.id}`
                        ? "bg-panel2 text-ink"
                        : "text-ink2 hover:bg-panel2 hover:text-ink",
                    )}
                    title={s.planTitle ? `${s.title} · ${s.planTitle}` : s.title}
                  >
                    <span className="block truncate text-[12.8px]">{s.title}</span>
                    {s.planTitle ? (
                      <span className="mt-0.5 block truncate text-[12px] text-ink3">{s.planTitle}</span>
                    ) : null}
                  </Link>
                ))
              )}
            </div>
          </div>
        )}

        <div className={cx("border-t border-line py-3", collapsed ? "px-2" : "px-3")}>
          <div className={cx("flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
            <Link
              href="/settings"
              title="设置"
              className={cx(
                "flex items-center rounded-full text-[13px] transition-colors",
                collapsed ? "size-10 justify-center" : "gap-2 px-3 py-2",
                pathname.startsWith("/settings")
                  ? "bg-accentsoft text-accentink"
                  : "text-ink2 hover:bg-panel2 hover:text-ink",
              )}
            >
              <Settings className="size-4" />
              {collapsed ? <span className="sr-only">设置</span> : <span>设置</span>}
            </Link>
            <ThemeToggle compact={collapsed} />
          </div>
        </div>
      </aside>

      {/* ── 移动端顶栏 ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-md md:hidden">
          <Link href="/" className="flex shrink-0 items-center gap-1.5">
            <Sparkles className="size-4 text-accent" />
            <span className="font-serif text-[17px] font-semibold text-ink">Lumina</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle compact />
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 pb-20 outline-none md:pb-0">
          {children}
        </main>
      </div>

      {/* ── 移动端底部导航 ── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[60px] items-stretch border-t border-line bg-panel/95 backdrop-blur-md md:hidden">
        {NAV.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[12px]",
                active ? "text-accent" : "text-ink3",
              )}
            >
              <Icon className="size-[19px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
