/**
 * SSRF 防护。
 *
 * 规则（与 spec 一致）：
 * - 只允许 http/https；
 * - 解析 DNS 后校验 IP，阻断私网/回环/链路本地/保留地址；
 * - 每次重定向重新解析并校验，最多 3 跳；
 * - 响应体上限 2MB，超时可中断。
 *
 * 本地单用户场景允许把 provider 指向 127.0.0.1（自建 SearXNG），
 * 但那是用户在设置里显式配置的地址，与"模型或网页内容诱导抓内网"是两件事。
 */
import { lookup } from "node:dns/promises";
import net from "node:net";

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // fc00::/7
    if (v.startsWith("fe80")) return true; // 链路本地
    // IPv4-mapped
    const m = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateAddress(m[1]);
    return false;
  }
  return true; // 认不出来的一律当私网，宁可拒绝
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

async function assertPublicHost(hostname: string, allowPrivate: boolean) {
  if (hostname === "localhost") {
    if (allowPrivate) return;
    throw new SsrfError("禁止访问本机地址");
  }
  // 字面量 IP 直接判断，域名则先解析
  if (net.isIP(hostname)) {
    if (!allowPrivate && isPrivateAddress(hostname)) throw new SsrfError("禁止访问内网地址");
    return;
  }
  const addrs = await lookup(hostname, { all: true });
  if (!addrs.length) throw new SsrfError("域名无法解析");
  if (!allowPrivate && addrs.some((a) => isPrivateAddress(a.address))) {
    throw new SsrfError("域名解析到内网地址");
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  allowPrivate?: boolean;
  accept?: string[];
  maxRedirects?: number;
  headers?: Record<string, string>;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/** 抓取一个网页并返回文本；任何不合规都抛错，不静默降级成"抓到了" */
export async function safeFetchText(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<{ text: string; contentType: string; finalUrl: string }> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowPrivate = opts.allowPrivate ?? false;
  const accept = opts.accept ?? ["text/html", "text/plain"];
  let url = rawUrl;
  let redirects = 0;

  for (;;) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new SsrfError("URL 不合法");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new SsrfError("只允许 http/https");
    }
    await assertPublicHost(parsed.hostname, allowPrivate);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timeout")), opts.timeoutMs ?? 4000);
    let res: Response;
    try {
      res = await fetch(parsed, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "Lumina/0.1 (study assistant; respectful fetch)",
          accept: accept.join(","),
          ...opts.headers,
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new SsrfError("重定向缺少目标");
      if (++redirects > (opts.maxRedirects ?? 3)) throw new SsrfError("重定向次数过多");
      url = new URL(loc, parsed).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!accept.some((a) => type.includes(a))) throw new SsrfError(`不支持的内容类型：${type || "未知"}`);

    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) throw new SsrfError("响应体过大");
    return { text: new TextDecoder("utf-8").decode(buf), contentType: type, finalUrl: url };
  }
}

/** 粗暴但可靠的正文抽取：去脚本/样式/标签，压空白 */
export function extractReadableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
