"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import SearchDialog from "./SearchDialog";
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
  const [peek, setPeek] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const immersive = pathname.startsWith("/w/");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { sessions: SessionSummary[] };
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
    setPeek(false);
    setCollapsed((v) => {
      const next = !v;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  // ⌘/Ctrl+K 打开搜索，和 ChatGPT 一样
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  /** 侧栏内容：expanded=false 时只留图标（用于折叠后的窄栏） */
  const sidebarBody = (expanded: boolean) => (
    <>
      <div
        className={cx(
          "flex items-center gap-1 pb-2",
          expanded ? "justify-between pl-5 pr-2 pt-5" : "justify-center px-2 pt-5",
        )}
      >
        <Link
          href="/"
          className="font-serif text-[21px] font-semibold tracking-tight text-ink transition-opacity hover:opacity-70"
          title="Lumina"
        >
          {expanded ? "Lumina" : <Sparkles className="size-[18px] text-accent" />}
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

      <div className="px-3 pb-2">
        <Link
          href="/"
          title="新对话"
          onClick={() => setPeek(false)}
          className={cx(
            "flex items-center justify-center gap-1.5 rounded-full bg-accent text-[13px] font-medium text-white transition-all hover:brightness-110",
            expanded ? "px-3 py-2" : "size-10",
          )}
        >
          <Plus className="size-4" />
          {expanded ? "新对话" : <span className="sr-only">新对话</span>}
        </Link>
      </div>

      <div className="px-3 pb-1">
        {expanded ? (
          <button
            type="button"
            onClick={() => {
              setPeek(false);
              setSearchOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] text-ink2 transition-colors hover:bg-panel2 hover:text-ink"
          >
            <Search className="size-4 text-ink3" />
            <span>搜索对话</span>
            <kbd className="ml-auto rounded-md border border-line bg-panel2 px-1.5 py-0.5 font-mono text-[12px] text-ink3">
              ⌘K
            </kbd>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="搜索对话"
            title="搜索对话"
            className="flex h-10 w-full items-center justify-center rounded-full text-ink2 transition-colors hover:bg-panel2 hover:text-ink"
          >
            <Search className="size-4 text-ink3" />
          </button>
        )}
      </div>

      <nav className={cx("mt-1 flex flex-col gap-0.5", expanded ? "px-3" : "px-2")}>
        {NAV.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              onClick={() => setPeek(false)}
              className={cx(
                "flex items-center rounded-full transition-colors",
                expanded ? "gap-2.5 px-3 py-2" : "h-10 justify-center",
                active
                  ? "bg-accentsoft font-medium text-accentink"
                  : "text-ink2 hover:bg-panel2 hover:text-ink",
              )}
            >
              <Icon className={cx("size-4", active ? "text-accent" : "text-ink3")} />
              {expanded ? (
                <span className="text-[13.5px]">{item.label}</span>
              ) : (
                <span className="sr-only">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {expanded ? (
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 no-scrollbar">
          <p className="px-3 pb-2 text-[12px] text-ink3">最近</p>
          <div className="flex flex-col gap-0.5">
            {sessions.length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-ink3">还没有对话。</p>
            ) : (
              sessions.slice(0, 6).map((s) => (
                <Link
                  key={s.id}
                  href={`/s/${s.id}`}
                  onClick={() => setPeek(false)}
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
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <div className={cx("border-t border-line py-3", expanded ? "px-3" : "px-2")}>
        <div className={cx("flex items-center gap-2", expanded ? "justify-between" : "flex-col")}>
          <Link
            href="/settings"
            title="设置"
            className={cx(
              "flex items-center rounded-full text-[13px] transition-colors",
              expanded ? "gap-2 px-3 py-2" : "size-10 justify-center",
              pathname.startsWith("/settings")
                ? "bg-accentsoft text-accentink"
                : "text-ink2 hover:bg-panel2 hover:text-ink",
            )}
          >
            <Settings className="size-4" />
            {expanded ? <span>设置</span> : <span className="sr-only">设置</span>}
          </Link>
          <ThemeToggle compact={!expanded} />
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* 键盘用户不必先 Tab 过 12 个侧栏项才能到正文 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-white"
      >
        跳到主内容
      </a>

      {/* ── 桌面侧边栏：折叠后鼠标悬停临时展开（和 ChatGPT 一样） ── */}
      <aside
        onMouseEnter={() => {
          if (collapsed) setPeek(true);
        }}
        onMouseLeave={() => setPeek(false)}
        className={cx(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-panel/60 backdrop-blur-sm md:flex",
          collapsed ? "w-[68px]" : "w-[248px]",
        )}
      >
        {sidebarBody(!collapsed)}
        {collapsed && peek ? (
          <div
            className="absolute left-0 top-0 z-40 flex h-dvh w-[248px] flex-col border-r border-line bg-panel shadow-[var(--shadow-lg)] animate-panel"
            onMouseLeave={() => setPeek(false)}
          >
            {sidebarBody(true)}
          </div>
        ) : null}
      </aside>

      {/* ── 移动端顶栏 ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-md md:hidden">
          <Link href="/" className="flex shrink-0 items-center gap-1.5">
            <Sparkles className="size-4 text-accent" />
            <span className="font-serif text-[17px] font-semibold text-ink">Lumina</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="搜索对话"
              title="搜索对话"
              className="grid size-8 place-items-center rounded-full text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
            >
              <Search className="size-4" />
            </button>
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

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}