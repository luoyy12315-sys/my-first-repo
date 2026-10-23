"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * 路由级错误兜底：任何一个页面渲染异常，都停在这一页，
 * 而不是把整个应用替换成 Next 默认的英文错误页。
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-error]", error.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-badsoft">
        <AlertTriangle className="size-5 text-bad" />
      </span>
      <h1 className="font-serif text-xl text-ink">这个页面没能渲染出来</h1>
      <p className="text-[13px] leading-relaxed text-ink2">
        通常是某个教学内容的结构异常导致的。你的会话和学习数据都还在数据库里，不会因此丢失。
      </p>
      <p className="max-w-full break-words rounded-lg bg-panel2 px-3 py-2 font-mono text-[11px] text-ink3">
        {error.message.slice(0, 200)}
      </p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-full bg-accent px-4 py-2 text-[13px] text-white transition-all hover:brightness-110"
        >
          重试
        </button>
        <a
          href="/"
          className="rounded-full border border-line bg-panel px-4 py-2 text-[13px] text-ink transition-colors hover:border-linestrong"
        >
          回到首页
        </a>
      </div>
    </div>
  );
}
