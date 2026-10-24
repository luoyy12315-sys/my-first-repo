import { describe, expect, it } from "vitest";
import {
  hasCitationToken,
  parseCitations,
  renderCitationsForExport,
  stripPartialCitation,
} from "@/lib/ai/citations";
import { planQueries, redactPII, shouldSearch } from "@/lib/web/gate";
import { canonicalizeUrl, rankAndDedupe } from "@/lib/web/score";
import { isPrivateAddress } from "@/lib/web/fetch";
import type { WebConfig } from "@/lib/web/config";
import type { SourceDTO } from "@/lib/types";

const sources: SourceDTO[] = [
  {
    id: "m1",
    kind: "material",
    title: "《讲义》",
    retrievedAt: Date.now(),
    snippet: "机会成本是被放弃的最优选项价值",
    meta: { chunkId: "c1" },
  },
  {
    id: "w1",
    kind: "web",
    title: "统计局",
    url: "https://example.gov.cn/a",
    domain: "example.gov.cn",
    retrievedAt: Date.now(),
    snippet: "数据",
  },
];

describe("引用协议", () => {
  it("保留有效引用、按首次出现排序、无效引用被剥离", () => {
    const text = "甲来自[[w1]]，乙来自[[m1]]，丙来自[[w1]]，伪造的[[w9]]没了。";
    const r = parseCitations(text, sources);
    expect(r.used.map((s) => s.id)).toEqual(["w1", "m1"]);
    expect(r.invalidCount).toBe(1);
    expect(r.cleanText).toContain("[[w1]]");
    expect(r.cleanText).not.toContain("[[w9]]");
    // 只摘掉标记本身，句子其余部分原样保留
    expect(r.cleanText).toContain("伪造的没了");
  });

  it("大小写不敏感，且能识别重复 token", () => {
    const r = parseCitations("看[[W1]]还有[[w1]]", sources);
    expect(r.used).toHaveLength(1);
    expect(r.tokens).toEqual(["w1", "w1"]);
  });

  it("没有任何来源时所有引用都被剥离", () => {
    const r = parseCitations("随便标个[[m1]]", []);
    expect(r.used).toHaveLength(0);
    expect(r.invalidCount).toBe(1);
    expect(r.cleanText.trim()).toBe("随便标个");
  });

  it("流式半截 token 会被隐藏", () => {
    expect(stripPartialCitation("已经写完[[w1]]然后")).toBe("已经写完[[w1]]然后");
    expect(stripPartialCitation("写到一半[[w")).toBe("写到一半");
    expect(stripPartialCitation("没有引用")).toBe("没有引用");
  });

  it("复制/导出把 token 换成编号并附来源列表", () => {
    const out = renderCitationsForExport("结论[[w1]]与[[m1]]", sources);
    expect(out).toContain("[1]");
    expect(out).toContain("[2]");
    expect(out).toContain("来源：");
    expect(out).toContain("example.gov.cn");
  });

  it("hasCitationToken 不吃状态", () => {
    expect(hasCitationToken("有[[m1]]")).toBe(true);
    expect(hasCitationToken("有[[m1]]")).toBe(true);
    expect(hasCitationToken("没有")).toBe(false);
  });
});

const baseCfg: WebConfig = {
  enabled: true,
  endpoint: "http://127.0.0.1:8888/search",
  method: "GET",
  apiKey: "",
  authHeader: "",
  queryParam: "q",
  bodyTemplate: "",
  resultsPath: "",
  titleField: "",
  urlField: "",
  snippetField: "",
  maxSources: 3,
  timeoutMs: 4000,
  ttlDays: 7,
  defaultMode: "manual",
  allowDomains: [],
  denyDomains: [],
  maxSearchesPerSession: 6,
};

describe("检索门控（Phase 2 只有手动模式）", () => {
  const input = { text: "查一下最新政策", cfg: baseCfg, configured: true, usedInSession: 0 };

  it("off 不检索", () => {
    expect(shouldSearch({ ...input, mode: "off" })).toEqual({ search: false, reason: "off" });
  });
  it("未启用不检索", () => {
    expect(shouldSearch({ ...input, mode: "manual", cfg: { ...baseCfg, enabled: false } }).reason).toBe("disabled");
  });
  it("provider 未配置不检索", () => {
    expect(shouldSearch({ ...input, mode: "manual", configured: false }).reason).toBe("not_configured");
  });
  it("预算用尽停止", () => {
    expect(shouldSearch({ ...input, mode: "manual", usedInSession: 6 }).reason).toBe("budget_exhausted");
  });
  it("手动模式且条件齐备才检索", () => {
    expect(shouldSearch({ ...input, mode: "manual" })).toEqual({ search: true, reason: "manual" });
  });
});

describe("查询规划与脱敏", () => {
  it("去掉口头语并补当前年份", () => {
    const q = planQueries("帮我查一下最新的个税政策", baseCfg, 2026);
    expect(q[0]).toContain("2026");
    expect(q[0]).not.toContain("帮我");
    expect(q.length).toBeLessThanOrEqual(2);
  });

  it("白名单域名追加 site: 变体并去重", () => {
    const q = planQueries("税率", { ...baseCfg, allowDomains: ["gov.cn"] }, 2026);
    expect(q.some((x) => x.includes("site:gov.cn"))).toBe(true);
    expect(new Set(q).size).toBe(q.length);
  });

  it("PII 在发送前被脱敏", () => {
    const red = redactPII("邮箱 a@b.com 手机 13800138000 身份证 110101199001011234 长串 123456789012345678");
    expect(red).not.toContain("a@b.com");
    expect(red).not.toContain("13800138000");
    expect(red).not.toContain("110101199001011234");
    expect(red).not.toContain("123456789012345678");
  });
});

describe("评分与去重", () => {
  it("规范化 URL 去掉跟踪参数与 www", () => {
    expect(canonicalizeUrl("https://www.a.com/x/?utm_source=q&id=1#top")).toBe("https://a.com/x?id=1");
  });

  it("黑名单域名直接丢弃、白名单加分", () => {
    const ranked = rankAndDedupe(
      [
        {
          title: "坏站",
          url: "https://spam.com/a",
          snippet: "无关内容。".repeat(20),
        },
        {
          title: "好站",
          url: "https://good.com/a",
          snippet: "关键词命中 关键词命中 的正文内容，长度足够用于通过质量阈值的检查逻辑。".repeat(6),
        },
      ],
      "关键词",
      { ...baseCfg, denyDomains: ["spam.com"], allowDomains: ["good.com"] },
      3,
    );
    expect(ranked.map((r) => r.domain)).toEqual(["good.com"]);
  });

  it("同一域名最多 2 条，且低分结果丢弃", () => {
    const same = (i: number) => ({
      title: `t${i}`,
      url: `https://one.com/a${i}`,
      snippet: "关键词 命中 内容长度足够以通过质量阈值的检查逻辑，这里再补一些文字凑长度。".repeat(10),
    });
    const ranked = rankAndDedupe(
      [same(1), same(2), same(3), { title: "薄", url: "https://one.com/z", snippet: "关键词" }],
      "关键词",
      baseCfg,
      5,
    );
    expect(ranked.length).toBeLessThanOrEqual(2);
  });

  it("完全相同（规范化后）的 URL 只保留一条", () => {
    const ranked = rankAndDedupe(
      [
        {
          title: "a",
          url: "https://x.com/p?utm_source=a",
          snippet: "关键词 内容长度足够以通过阈值检查的正文片段文本。".repeat(10),
        },
        {
          title: "b",
          url: "https://www.x.com/p",
          snippet: "关键词 内容长度足够以通过阈值检查的正文片段文本。".repeat(10),
        },
      ],
      "关键词",
      baseCfg,
      5,
    );
    expect(ranked).toHaveLength(1);
  });
});

describe("SSRF 判定", () => {
  it("私网/回环/链路本地/保留段一律判定为危险", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("公网地址判定为安全", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "172.32.0.1", "93.184.216.34", "2606:4700::1111"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
  it("认不出来的地址按危险处理", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });
});