"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { dayKey } from "@/lib/study/time";

/** 只在"真的在学习"的页面计时：对话、复习、计划里的课程 */
const LEARNING_ROUTES = [/^\/s\//, /^\/review(\/|$)/, /^\/plan\/[^/]+\/course\//];

const CHUNK = 30; // 每攒够 30 秒才算一次学习
const MAX_PER_BEAT = 120;
const PENDING_KEY = "lumina-study-pending";

function readPending(): number {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { day?: string; seconds?: number };
    return parsed.day === dayKey(Date.now()) ? Math.max(0, Math.floor(parsed.seconds ?? 0)) : 0;
  } catch {
    return 0;
  }
}

function writePending(seconds: number) {
  try {
    if (seconds > 0) sessionStorage.setItem(PENDING_KEY, JSON.stringify({ day: dayKey(Date.now()), seconds }));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* 隐私模式写不了就算了 */
  }
}

/**
 * 学习时长心跳：页面可见时每秒累加，**攒满 30 秒才发**；
 * 不满 30 秒的零头留在 sessionStorage 里，换页后接着攒。
 * 这样"随便点进来两秒"不会在图表上凭空多出一根柱子。
 */
export default function StudyTimer() {
  const pathname = usePathname();
  const counting = LEARNING_ROUTES.some((re) => re.test(pathname ?? ""));
  const pending = useRef(0);

  useEffect(() => {
    if (!counting) return;
    pending.current = readPending();

    const flush = () => {
      const seconds = Math.min(pending.current, MAX_PER_BEAT);
      if (seconds < CHUNK) return; // 不足一次学习：不发，继续攒
      pending.current -= seconds;
      writePending(pending.current);
      const payload = JSON.stringify({ day: dayKey(Date.now()), seconds });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/study/time", new Blob([payload], { type: "application/json" }));
      } else {
        void fetch("/api/study/time", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          keepalive: true,
        });
      }
    };

    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      pending.current += 1;
      if (pending.current >= CHUNK) flush();
    }, 1000);

    const persist = () => writePending(pending.current);
    const onHidden = () => {
      if (document.visibilityState !== "hidden") return;
      flush();
      persist();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", persist);

    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", persist);
      flush();
      persist();
    };
  }, [counting]);

  return null;
}