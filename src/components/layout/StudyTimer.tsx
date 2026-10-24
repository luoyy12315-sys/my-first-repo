"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { dayKey } from "@/lib/study/time";

/** 只在"真的在学习"的页面计时：对话、复习、计划里的课程 */
const LEARNING_ROUTES = [/^\/s\//, /^\/review(\/|$)/, /^\/plan\/[^/]+\/course\//];

const CHUNK = 30; // 每 30 秒发一次心跳
const MAX_PER_BEAT = 120; // 和接口上限一致

/**
 * 学习时长心跳：页面可见时每秒累加，攒够 30 秒就发一次；切走/关页时把余数也发掉。
 * 不记录任何内容，只有「本地日期 + 秒数」。
 */
export default function StudyTimer() {
  const pathname = usePathname();
  const counting = LEARNING_ROUTES.some((re) => re.test(pathname ?? ""));
  const pending = useRef(0);

  useEffect(() => {
    if (!counting) return;
    pending.current = 0;

    const flush = () => {
      const seconds = Math.min(pending.current, MAX_PER_BEAT);
      if (seconds <= 0) return;
      pending.current = 0;
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

    const onLeave = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onLeave);
    window.addEventListener("pagehide", onLeave);

    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onLeave);
      window.removeEventListener("pagehide", onLeave);
      flush();
    };
  }, [counting]);

  return null;
}