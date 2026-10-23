"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/**
 * 正文里的 `[[m1]]` / `[[w1]]` 是引用标记（服务端已校验 id 是否存在，
 * 伪造的会在落库前被剥离）。渲染时换成一个指向来源卡片的角标。
 * 流式过程中可能只来了一半 `[[w`，调用方先用 stripPartialCitation 藏起来。
 */
function linkCitations(text: string): string {
  return text.replace(/\[\[([mw])(\d{1,2})\]\]/gi, (_m, kind: string, num: string) => {
    const id = `${kind.toLowerCase()}${num}`;
    return `[\`${kind.toUpperCase()}${num}\`](#source-${id})`;
  });
}

export default function Markdown({
  children,
  className,
  citations = true,
}: {
  children: string;
  className?: string;
  /** 是否把 [[m1]] / [[w1]] 渲染成引用角标 */
  citations?: boolean;
}) {
  const text = useMemo(() => (citations ? linkCitations(children) : children), [children, citations]);
  return (
    <div className={`md ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, output: "html" }]]}
        components={{
          a: ({ href, children: c }) => {
            const isCitation = typeof href === "string" && href.startsWith("#source-");
            if (isCitation) {
              return (
                <a href={href} className="citation-chip" title="跳到来源卡片">
                  {c}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {c}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}