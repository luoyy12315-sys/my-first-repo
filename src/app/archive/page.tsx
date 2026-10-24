"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, cx } from "@/components/ui/kit";
import LibraryPage from "../library/page";
import HistoryPage from "../history/page";
import MaterialsPage from "../materials/page";

const TABS = [
  { key: "concepts", label: "知识点" },
  { key: "sessions", label: "对话" },
  { key: "materials", label: "材料" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ArchivePage() {
  const [tab, setTab] = useState<TabKey>("concepts");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t as TabKey);
  }, []);

  const switchTo = (key: TabKey) => {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    url.searchParams.delete("c");
    window.history.replaceState({}, "", url.pathname + url.search);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title="学习档案"
        action={
          <Link
            href="/settings"
            className="text-[12px] text-ink3 underline-offset-2 hover:text-ink hover:underline"
          >
            设置
          </Link>
        }
      />

      <div className="mb-5 flex w-fit items-center gap-0.5 rounded-full bg-panel2 p-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => switchTo(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={cx(
              "rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
              tab === t.key ? "bg-panel text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink3 hover:text-ink2",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "concepts" ? <LibraryPage embedded /> : null}
      {tab === "sessions" ? <HistoryPage embedded /> : null}
      {tab === "materials" ? <MaterialsPage embedded /> : null}
    </div>
  );
}