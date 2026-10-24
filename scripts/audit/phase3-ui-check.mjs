/**
 * 阶段三 UI 验收（临时脚本，tests/_*.mjs 已被 .gitignore 忽略）
 *
 * 检查：各页面可打开、无控制台错误、390px 无横向溢出、设置页「用量」卡片有真实数字。
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3221";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const pages = ["/", "/settings", "/library", "/plan", "/review", "/history", "/materials"];

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
};

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

for (const width of [1440, 390]) {
  console.log(`\n== ${width}px ==`);
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  for (const path of pages) {
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => {
      errors.push(`goto: ${e.message}`);
      return null;
    });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    check(`${path} 打开`, Boolean(res) && res.status() < 400, res ? `status=${res.status()}` : "no response");
    check(`${path} 无横向溢出`, overflow.scroll <= overflow.client + 1, `${overflow.scroll} > ${overflow.client}`);
    check(`${path} 无控制台错误`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
  await context.close();
}

// 设置页「用量」卡片：有真实调用记录时应显示数字，而不是空态
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const usageText = await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((x) => x.textContent?.trim() === "用量");
    const section = h?.closest("section");
    return section?.innerText ?? "";
  });
  check("设置页有用量卡片", usageText.length > 0);
  check("用量卡片显示调用次数", /调用|次/.test(usageText), usageText.slice(0, 80).replace(/\n/g, " "));
  check("用量卡片没有 NaN/undefined", !/NaN|undefined/.test(usageText));
  check("未填单价时成本显示「—」", usageText.includes("—") || usageText.includes("单价"));
  const headings = await page.evaluate(() => [...document.querySelectorAll("h2")].map((x) => x.textContent?.trim()));
  check("卡片顺序：模型服务 → 讲解风格 → 联网检索 → 用量 → 数据", (() => {
    const want = ["模型服务", "讲解风格", "联网检索", "用量", "数据"];
    const idx = want.map((w) => headings.findIndex((h) => h?.includes(w)));
    return idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1]));
  })(), JSON.stringify(headings));
  await page.screenshot({ path: "docs/ui-audit/phase3-settings-usage.png", fullPage: false });
  await context.close();
}

await browser.close();
console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);