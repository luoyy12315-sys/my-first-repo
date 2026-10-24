/**
 * 阶段二图表浏览器验收：打开真实模型生成的会话，在 390px 宽度下检查
 * - 图表真的渲染出来了（recharts 容器或 K 线 SVG）
 * - 没有横向溢出
 * - 没有未捕获异常
 *
 * 前置：e2e-phase2.json 已生成，且对应实例仍在运行。
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3212";
const REPORT = path.resolve("docs/audit/e2e-phase2.json");
const OUT = path.resolve("docs/audit/ui-charts.json");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const exe = fs.existsSync(EDGE) ? EDGE : CHROME;

const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
const cases = report.cases.filter((c) => c.sessionId && c.blocks?.some((b) => b.kind === "chart"));

const browser = await chromium.launch({ executablePath: exe, headless: true });
const results = [];

for (const c of cases) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  try {
    await page.goto(`${BASE}/s/${c.sessionId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const charts = await page
      .locator(".recharts-wrapper, svg[aria-label='K 线图']")
      .count();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    const titleVisible = await page.getByText(c.blocks.find((b) => b.kind === "chart")?.title ?? "", { exact: false }).count();
    results.push({
      id: c.id,
      chartTypes: c.chartTypes,
      charts,
      overflow,
      titleVisible: titleVisible > 0,
      errors: errors.slice(0, 3),
    });
    console.log(
      `[${c.id}] 图表=${charts} 溢出=${overflow}px 标题可见=${titleVisible > 0} 错误=${errors.length}`,
    );
  } catch (e) {
    results.push({ id: c.id, error: e instanceof Error ? e.message : String(e) });
    console.log(`[${c.id}] ERROR ${e instanceof Error ? e.message : e}`);
  } finally {
    await page.close();
  }
}

await browser.close();

const ok = results.filter((r) => r.charts > 0 && r.overflow <= 1 && r.errors.length === 0);
const summary = { total: results.length, ok: ok.length, results };
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2), "utf8");
console.log(`\n汇总：${ok.length}/${results.length} 通过`);
console.log(`Saved: ${OUT}`);
