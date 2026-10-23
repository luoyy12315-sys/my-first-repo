"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Compass,
  FolderOpen,
  History,
  Library,
  Repeat2,
  Route,
  Settings,
  Sparkles,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { cx } from "@/components/ui/kit";
import type { SessionSummary } from "@/lib/types";

const NAV = [
  { href: "/", label: "学习", icon: Compass },
  { href: "/library", label: "学习档案", icon: Library },
  { href: "/review", label: "复习", icon: Repeat2 },
  { href: "/plan", label: "计划", icon: Route },
  { href: "/history", label: "历史", icon: History },
  { href: "/materials", label: "材料", icon: FolderOpen },
];

// 手机端保留同样的入口（设置仍在右上角齿轮），避免“人在材料页但导航无当前项”。
const MOBILE_NAV = NAV;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const immersive = pathname.startsWith("/w/");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { sessions: SessionSummary[] };
        setSessions(data.sessions.slice(0, 6));
      }
    } catch {
      /* 侧边栏属于次要信息，失败静默 */
    }
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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/s/") : pathname.startsWith(href);

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* ── 桌面侧边栏 ── */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-panel/60 backdrop-blur-sm md:flex">
        <div className="px-5 pt-6 pb-4">
          <Link href="/" className="group flex items-baseline gap-2">
            <span className="font-serif text-[21px] font-semibold tracking-tight text-ink">Lumina</span>
            <span className="text-[11px] tracking-wide text-ink3 transition-colors group-hover:text-ink2">
              ／学习工作台
            </span>
          </Link>
        </div>

        <nav className="mt-2 flex flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                  active
                    ? "bg-accentsoft font-medium text-accentink"
                    : "text-ink2 hover:bg-panel2 hover:text-ink",
                )}
              >
                <Icon className={cx("size-4", active ? "text-accent" : "text-ink3")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3 no-scrollbar">
          <p className="px-3 pb-2 text-[11px] uppercase tracking-wide text-ink3">最近</p>
          <div className="flex flex-col gap-0.5">
            {sessions.length === 0 ? (
              <p className="px-3 py-2 text-[12.5px] leading-relaxed text-ink3">
                还没有学习记录。提第一个问题就会出现在这里。
              </p>
            ) : (
              sessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/s/${s.id}`}
                  className={cx(
                    "rounded-lg px-3 py-1.5 transition-colors",
                    pathname === `/s/${s.id}`
                      ? "bg-panel2 text-ink"
                      : "text-ink2 hover:bg-panel2 hover:text-ink",
                  )}
                  title={s.planTitle ? `${s.title} · ${s.planTitle}` : s.title}
                >
                  <span className="block truncate text-[12.8px]">{s.title}</span>
                  {s.planTitle ? (
                    <span className="mt-0.5 block truncate text-[10px] text-ink3">{s.planTitle}</span>
                  ) : null}
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-line px-3 py-3">
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <Link
              href="/settings"
              className={cx(
                "flex items-center gap-2 rounded-full px-3 py-2 text-[13px] transition-colors",
                pathname.startsWith("/settings")
                  ? "bg-accentsoft text-accentink"
                  : "text-ink2 hover:bg-panel2 hover:text-ink",
              )}
            >
              <Settings className="size-4" />
              设置
            </Link>
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
            <Link
              href="/settings"
              className="rounded-full p-2 text-ink2 hover:bg-panel2 hover:text-ink"
              aria-label="设置"
            >
              <Settings className="size-4" />
            </Link>
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      {/* ── 移动端底部导航 ── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[60px] items-stretch border-t border-line bg-panel/95 backdrop-blur-md md:hidden">
        {MOBILE_NAV.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px]",
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
