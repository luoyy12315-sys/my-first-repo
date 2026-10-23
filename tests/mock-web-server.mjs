/**
 * 测试用搜索替身（不是真实搜索）。
 * 目的：让端到端测试能确定性地断言
 * - off 模式零请求
 * - 手动模式有来源
 * - 相同 query 第二次命中缓存（计数不增加）
 * - 超时 / 401 / 429 / 空结果 时的诚实降级
 *
 * 启动：node tests/mock-web-server.mjs        默认 normal 模式，端口 4319
 * 切换：http://127.0.0.1:4319/mode?m=timeout
 * 计数：http://127.0.0.1:4319/count          实际处理的搜索请求数
 * 归零：http://127.0.0.1:4319/reset
 */
import http from "node:http";
import { URL } from "node:url";

let mode = process.env.MOCK_WEB_MODE ?? "normal";
let count = 0;

const RESULTS = [
  {
    title: "2026 年个人所得税专项附加扣除标准",
    url: "https://example.gov.cn/tax/2026",
    // 摘要刻意写得比较长：真实 provider 返回足够内容时不会再抓正文，测试也更确定
    content:
      "专项附加扣除包括子女教育、继续教育、大病医疗、住房贷款利息、住房租金、赡养老人、3 岁以下婴幼儿照护七项，标准按年度公布。扣除标准由国务院另行确定并公布，实际扣除需要凭有效凭证填写申报表，未提供凭证的项目不得申报；同一纳税年度内更换租房与住房贷款两类扣除不能同时享受，请以税务机关口径为准。",
    publishedDate: "2026-01-15T00:00:00Z",
    score: 0.9,
  },
  {
    title: "国家统计局：2026 年上半年居民收入数据",
    url: "https://example.stats.gov.cn/report/2026h1",
    content:
      "上半年全国居民人均可支配收入同比增长，出行与教育消费支出占比居前，具体数据以统计部门发布为准。发布时同步说明了统计口径与抽样方法，季度之间存在季节波动，单月数据不宜直接外推全年趋势；历史序列可在国家统计局数据库按年度或季度查询核对。",
    publishedDate: "2026-07-10T00:00:00Z",
    score: 0.7,
  },
  {
    title: "解读：如何查询最新政策原文",
    url: "https://example-news.org/policy/lookup",
    content:
      "政策原文应以发布机关官网为准，转载版本可能存在滞后，建议核对发布日期与文号。检索时如果只输入政策名称，容易命中解读类文章而非原文，可加上发文机关简称或「通知」「公告」等文种关键词缩小范围；查到原文后还应确认施行日期与过渡安排。",
    publishedDate: "2025-11-02T00:00:00Z",
    score: 0.5,
  },
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4319");

  if (url.pathname === "/mode") {
    mode = url.searchParams.get("m") ?? "normal";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ mode }));
    return;
  }
  if (url.pathname === "/count") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ mode, count }));
    return;
  }
  if (url.pathname === "/reset") {
    count = 0;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ count }));
    return;
  }

  // SearXNG 风格的搜索接口
  if (url.pathname === "/search" || url.pathname.endsWith("/search")) {
    count += 1;
    if (mode === "timeout") {
      // 故意不响应，触发客户端超时
      return;
    }
    if (mode === "401") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (mode === "429") {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "rate limited" }));
      return;
    }
    const results = mode === "empty" ? [] : RESULTS;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ results }));
    return;
  }

  // 被检索到的页面正文（供 enrich 抓取）
  if (url.pathname.startsWith("/page/")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      `<html><head><style>x{}</style></head><body><script>alert(1)</script><h1>页面标题</h1><p>${"这是页面正文内容，用于验证摘要补全。".repeat(8)}</p></body></html>`,
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(4319, "127.0.0.1", () => {
  console.log("[mock-web] listening on http://127.0.0.1:4319 (mode=" + mode + ")");
});