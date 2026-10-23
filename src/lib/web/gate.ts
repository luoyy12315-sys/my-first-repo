import type { WebConfig } from "./config";

/** 手机号 / 邮箱 / 身份证 / 超长数字串：发出去之前先脱敏 */
export function redactPII(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[redacted]")
    .replace(/\b1[3-9]\d{9}\b/g, "[redacted]")
    .replace(/\b\d{17}[\dXx]\b/g, "[redacted]")
    .replace(/\b\d{15,}\b/g, "[redacted]");
}

const VERBAL = /^(帮我|请问|能不能|可以|麻烦|我想|我要|请|一下|告诉我|解释|讲讲|说说)+/;

/** Phase 2 的查询规划是确定性的：去口头语、必要时补年份。Phase 3 才用快模型。 */
export function planQueries(text: string, cfg: WebConfig, currentYear = new Date().getFullYear()): string[] {
  const base = redactPII(text)
    .replace(/[\r\n]+/g, " ")
    .replace(/[。？！?!]+$/g, "")
    .replace(VERBAL, "")
    .trim()
    .slice(0, 120);
  if (!base) return [];

  const queries: string[] = [base];
  const timeSensitive = /最新|最近|今年|现在|目前|价格|政策|法规|版本|发布|新闻|统计|截至|数据/.test(text);
  if (timeSensitive && !new RegExp(String(currentYear)).test(base)) {
    queries[0] = `${base} ${currentYear}`;
  }
  if (cfg.allowDomains.length) {
    const site = cfg.allowDomains[0].replace(/^\*\./, "");
    queries.push(`${queries[0]} site:${site}`);
  }
  return [...new Set(queries)].slice(0, 2);
}

export interface GateInput {
  mode: "off" | "manual";
  text: string;
  cfg: WebConfig;
  configured: boolean;
  usedInSession: number;
}

export interface GateResult {
  search: boolean;
  reason: string;
}

/**
 * Phase 2 只有手动模式：用户开了开关且 provider 可用才检索。
 * 自动意图识别（Phase 3）等评测数据齐了再做——现在做等于拿用户当测试集。
 */
export function shouldSearch(input: GateInput): GateResult {
  if (input.mode === "off") return { search: false, reason: "off" };
  if (!input.cfg.enabled) return { search: false, reason: "disabled" };
  if (!input.configured) return { search: false, reason: "not_configured" };
  if (input.usedInSession >= input.cfg.maxSearchesPerSession) {
    return { search: false, reason: "budget_exhausted" };
  }
  if (!input.text.trim()) return { search: false, reason: "empty" };
  return { search: true, reason: "manual" };
}

export const GATE_NOTICE: Record<string, string> = {
  disabled: "联网检索未启用，本次使用模型知识。",
  not_configured: "联网检索未配置，本次使用模型知识。",
  budget_exhausted: "本次会话的联网查证次数已用完。",
};
