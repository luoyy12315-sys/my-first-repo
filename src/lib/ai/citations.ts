/**
 * 引用协议：正文里用 `[[m1]]` / `[[w1]]` 标注依据。
 *
 * 三条硬规则（与 spec 一致）：
 * 1. 只认本轮真实注入的来源 id，模型编造的必须剥离；
 * 2. 只校验"id 是否存在"，不假装能证明来源支持该结论；
 * 3. 全部无效时不补引用（补引用等于伪造）。
 */
import type { SourceDTO } from "@/lib/types";

const TOKEN = /\[\[([mw])(\d{1,2})\]\]/gi;

export interface CitationResult {
  /** 保留 token 的正文（无效 token 已剥离） */
  cleanText: string;
  /** 按首次出现顺序去重的来源 */
  used: SourceDTO[];
  /** 被剥离的无效引用个数 */
  invalidCount: number;
  /** 正文里出现过的有效 token（调试与统计用） */
  tokens: string[];
}

export function parseCitations(text: string, sources: SourceDTO[]): CitationResult {
  const byId = new Map(sources.map((s) => [s.id.toLowerCase(), s]));
  const used: SourceDTO[] = [];
  const usedIds = new Set<string>();
  const tokens: string[] = [];
  let invalidCount = 0;

  const cleanText = text.replace(TOKEN, (match, kind: string, num: string) => {
    const id = `${kind.toLowerCase()}${num}`;
    const src = byId.get(id);
    if (!src) {
      invalidCount += 1;
      // 无效引用直接抹掉：宁可少一个上标，也不制造死链
      return "";
    }
    tokens.push(id);
    if (!usedIds.has(id)) {
      usedIds.add(id);
      used.push(src);
    }
    return match;
  });

  return { cleanText, used, invalidCount, tokens };
}

/**
 * 流式渲染用：模型可能把 `[[w1]]` 切成 `[[w` + `1]]`，
 * 这时先把未闭合的 `[[…` 藏起来，避免用户看到半截标记。
 */
export function stripPartialCitation(text: string): string {
  const idx = text.lastIndexOf("[[");
  if (idx === -1) return text;
  const tail = text.slice(idx);
  // 尾巴里没有闭合 → 从 `[[` 起全部隐藏
  return tail.includes("]]") ? text : text.slice(0, idx);
}

/** 复制/导出：token 转成 [1] 并附来源列表 */
export function renderCitationsForExport(text: string, sources: SourceDTO[]): string {
  const order = new Map(sources.map((s, i) => [s.id.toLowerCase(), i + 1]));
  const body = text.replace(TOKEN, (_match, kind: string, num: string) => {
    const n = order.get(`${kind.toLowerCase()}${num}`);
    return n ? `[${n}]` : "";
  });
  if (!sources.length) return body;
  const list = sources
    .map((s, i) => {
      const where = s.kind === "web" ? s.url ?? s.domain ?? "" : s.meta?.materialName ?? s.title;
      return `${i + 1}. ${s.title}${where ? ` — ${where}` : ""}`;
    })
    .join("\n");
  return `${body}\n\n---\n来源：\n${list}`;
}

/** 正文里是否还有有效引用（用于"有来源但没标注"的提示） */
export function hasCitationToken(text: string): boolean {
  TOKEN.lastIndex = 0;
  return TOKEN.test(text);
}
