"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.message);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf8f4",
          color: "#1a1917",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, marginBottom: 8, fontFamily: 'Georgia, "Songti SC", serif' }}>
            应用遇到了一个错误
          </h1>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "#57534b", marginBottom: 16 }}>
            数据没有丢失。刷新通常就能恢复；如果反复出现，说明某个教学内容的结构让界面崩了。
          </p>
          <button
            onClick={reset}
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              border: 0,
              background: "#1f6f63",
              color: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            重新加载
          </button>
        </div>
      </body>
    </html>
  );
}
