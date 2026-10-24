/**
 * 阶段二：把关键图表的实际渲染截图，便于人工检查视觉质量。
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3212";
const REPORT = path.resolve("docs/audit/e2e-phase2.json");
const OUT = path.resolve("docs/audit/screens");
fs.mkdirSync(OUT, { recursive: true });

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const exe = fs.existsSync(EDGE) ? EDGE : CHROME;

const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
const wanted = ["pie", "waterfall", "candlestick", "dual-axis", "cvp"];
const cases = report.cases.filter((c) => wanted.includes(c.id) && c.sessionId);

const browser = await chromium.launch({ executablePath: exe, headless: true });
for (const c of cases) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${BASE}/s/${c.sessionId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const title = c.blocks.find((b) => b.kind === "chart")?.title ?? c.id;
  const block = page
    .locator("div.rounded-2xl")
    .filter({ has: page.getByText(title, { exact: false }) })
    .last();
  const target = (await block.count()) ? block : page.locator("body");
  await target.screenshot({ path: path.join(OUT, `${c.id}.png`) });
  console.log(`[${c.id}] ${title}`);
  await page.close();
}
await browser.close();
console.log(`Saved to ${OUT}`);
