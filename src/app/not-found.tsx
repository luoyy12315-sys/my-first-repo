import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <p className="text-[12px] uppercase tracking-[0.18em] text-ink3">404</p>
      <h1 className="font-serif text-[26px] leading-tight text-ink">这个页面不存在</h1>
      <p className="max-w-sm text-[13px] leading-relaxed text-ink2">
        地址可能打错了，或者这条链接已经失效。
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/"
          className="rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:brightness-110"
        >
          回到首页
        </Link>
        <Link
          href="/archive?tab=sessions"
          className="rounded-full border border-line bg-panel px-4 py-2 text-[13px] text-ink2 transition-colors hover:border-linestrong"
        >
          看学习历史
        </Link>
      </div>
    </div>
  );
}

