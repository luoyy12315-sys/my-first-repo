import path from "node:path";

export interface ParsedMaterial {
  text: string;
  status: "parsed" | "failed" | "unsupported";
  error?: string;
}

const TEXT_EXT = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".log", ".tex"]);
const CODE_EXT = new Set([".js", ".ts", ".py", ".java", ".c", ".cpp", ".css", ".sql", ".yml", ".yaml"]);

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 材料解析。
 * 只声明"真的解析成功"的格式；解析失败的如实返回 failed，
 * 不支持的格式返回 unsupported —— 绝不返回编造的内容。
 */
export async function parseMaterial(file: File): Promise<ParsedMaterial> {
  const ext = path.extname(file.name).toLowerCase();
  const size = file.size;
  if (size > Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024) {
    return { text: "", status: "failed", error: `文件超过 ${process.env.MAX_UPLOAD_MB ?? 20}MB 限制` };
  }

  try {
    if (TEXT_EXT.has(ext) || CODE_EXT.has(ext)) {
      const text = await file.text();
      return { text, status: "parsed" };
    }
    if (ext === ".html" || ext === ".htm") {
      return { text: stripHtml(await file.text()), status: "parsed" };
    }
    if (ext === ".pdf") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mod = (await import("pdf-parse")) as unknown as {
        default?: (b: Buffer) => Promise<{ text: string }>;
      };
      if (typeof mod.default !== "function") {
        return { text: "", status: "unsupported", error: "PDF 解析器未正确加载（pdf-parse）" };
      }
      const out = await mod.default(buffer);
      const text = out.text?.trim() ?? "";
      if (!text) return { text: "", status: "failed", error: "PDF 中没有可提取的文本（可能是扫描件，需 OCR）" };
      return { text, status: "parsed" };
    }
    if (ext === ".docx") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mammoth = (await import("mammoth")) as unknown as {
        extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const out = await mammoth.extractRawText({ buffer });
      return { text: out.value?.trim() ?? "", status: "parsed" };
    }
    if (ext === ".doc") {
      return { text: "", status: "unsupported", error: "旧版 .doc 暂不支持，请另存为 .docx 或 PDF" };
    }
    if (ext === ".pptx") {
      return { text: "", status: "unsupported", error: "PPTX 解析尚未启用，可先导出为 PDF" };
    }
    return { text: "", status: "unsupported", error: `暂不支持 ${ext || "该"} 格式` };
  } catch (e) {
    return { text: "", status: "failed", error: (e as Error).message.slice(0, 300) };
  }
}

/** 按段落切块，保留可追溯的段落序号（页码仅在解析器真的提供时才写） */
export function chunkText(
  text: string,
  target = 1100,
): { text: string; heading: string | null; page: null }[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: { text: string; heading: string | null; page: null }[] = [];
  let buf = "";
  let heading: string | null = null;
  for (const p of paragraphs) {
    const looksHeading = p.length < 40 && !p.endsWith("。") && !p.endsWith(".");
    if (looksHeading && buf.length > 0) {
      chunks.push({ text: buf.trim(), heading, page: null });
      buf = "";
      heading = p.replace(/^#+\s*/, "");
      continue;
    }
    if (!heading && looksHeading) heading = p.replace(/^#+\s*/, "");
    if (buf.length + p.length > target && buf.length > 0) {
      chunks.push({ text: buf.trim(), heading, page: null });
      buf = "";
    }
    buf += (buf ? "\n\n" : "") + p;
  }
  if (buf.trim()) chunks.push({ text: buf.trim(), heading, page: null });
  return chunks.slice(0, 400);
}
