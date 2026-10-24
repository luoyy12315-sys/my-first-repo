/**
 * 阶段三 UI 验收（临时脚本，tests/_*.mjs 已被 .gitignore 忽略）
 *
 * 检查：各页面可打开、无控制台错误、390px 无横向溢出、设置页「用量」卡片有真实数字；
 * 新首页是单输入框、档案页有三个 tab、/me 已下线、每页首屏文案量收敛。\n
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3221";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const pages = ["/", "/settings", "/library", "/plan", "/review", "/history", "/materials", "/archive"];

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
  check("用量卡片显示 tokens 明细", /tokens/i.test(usageText), usageText.slice(0, 80).replace(/\n/g, " "));
  check("用量卡片不再出现单价输入", !/单价|粗估|¥|\$/.test(usageText));
  const headings = await page.evaluate(() => [...document.querySelectorAll("h2")].map((x) => x.textContent?.trim()));
  check("卡片顺序：模型服务 → 讲解风格 → 联网检索 → 用量 → 许可", (() => {
    const want = ["模型服务", "讲解风格", "联网检索", "用量", "许可"];
    const idx = want.map((w) => headings.findIndex((h) => h?.includes(w)));
    return idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1]));
  })(), JSON.stringify(headings));
  await page.screenshot({ path: "docs/ui-audit/phase3-settings-usage.png", fullPage: false });
  await context.close();
}


// ── 简洁度：新首页 / 档案合并 / 页面文案量 ──
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const home = await page.evaluate(() => ({
    textareas: document.querySelectorAll("textarea").length,
    sections: document.querySelectorAll("main section").length,
    chars: (document.querySelector("main")?.innerText ?? "").length,
    height: document.documentElement.scrollHeight,
    links: document.querySelectorAll("main a").length,
  }));
  check("首页只有一个输入框", home.textareas === 1, JSON.stringify(home));
  check("首页不再有仪表盘区块", home.sections <= 1, JSON.stringify(home));
  check("首页首屏一屏内", home.height <= 1000, `${home.height}px`);
  check("首页文案 ≤ 120 字", home.chars <= 120, `${home.chars}`);

  await page.goto(`${BASE}/archive`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll("main button")].map((b) => b.textContent?.trim()).filter(Boolean),
  );
  check("档案页有知识点/对话/材料三个 tab", ["知识点", "对话", "材料"].every((t) => tabs.includes(t)), JSON.stringify(tabs.slice(0, 8)));

  const meRes = await fetch(`${BASE}/me`);
  check("/me 已下线（404）", meRes.status === 404, String(meRes.status));

  const budgets = { "/plan": 130, "/review": 130, "/archive": 160 };
  for (const [path, budget] of Object.entries(budgets)) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const chars = await page.evaluate(() => (document.querySelector("main")?.innerText ?? "").length);
    check(`${path} 文案 ≤ ${budget} 字`, chars <= budget, `${chars}`);
  }

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const settingsChars = await page.evaluate(() => (document.querySelector("main")?.innerText ?? "").length);
  check("设置页文案 ≤ 1100 字", settingsChars <= 1100, `${settingsChars}`);

  // 输入框聚焦不再画方框
  await page.locator("input[type=text], input:not([type])").first().click();
  await page.waitForTimeout(150);
  const focusStyle = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? getComputedStyle(el).outlineStyle : "none";
  });
  check("输入框聚焦没有方框 outline", focusStyle === "none", focusStyle);

  // 侧边栏：全局搜索（行 + 弹层）+ 折叠（只有点按钮才展开）
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("lumina-sidebar-collapsed"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const aside = page.locator("aside");
  check("侧栏不再常驻搜索输入框", (await page.locator("aside input").count()) === 0);
  const searchRow = aside.locator("button", { hasText: "搜索" }).first();
  check("侧栏有搜索入口", (await searchRow.count()) === 1);
  check("侧栏没有键位角标", (await page.locator("aside kbd").count()) === 0);
  const expandedWidth = (await aside.boundingBox())?.width ?? 0;
  check("侧边栏默认展开 248px", expandedWidth > 200, String(expandedWidth));

  await searchRow.click();
  await page.waitForTimeout(500);
  const dialog = page.getByRole("dialog", { name: "搜索" });
  check("点搜索打开搜索弹层", await dialog.isVisible());
  check("弹层里没有键位角标", (await dialog.locator("kbd").count()) === 0);
  check(
    "弹层输入框自动聚焦",
    await dialog.getByLabel("搜索").evaluate((el) => el === document.activeElement),
  );

  const sessionList = await fetch(`${BASE}/api/sessions`).then((r) => r.json()).catch(() => null);
  const sessionTitle = sessionList?.sessions?.[0]?.title ?? "";
  const needle = sessionTitle.slice(0, 2) || "你好";
  await dialog.getByLabel("搜索").fill(needle);
  await page.waitForTimeout(800);
  const hitRows = await dialog.locator("button[data-index]").count();
  check("输入即搜到结果", hitRows >= 1, `${needle} → ${hitRows}`);
  check("结果按分组展示", (await dialog.locator("p", { hasText: "对话" }).count()) >= 1);

  // 全局：计划 / 知识点 / 材料也能搜到
  const planList = await fetch(`${BASE}/api/plans`).then((r) => r.json()).catch(() => null);
  const planTitle = planList?.plans?.[0]?.title ?? null;
  if (planTitle) {
    await dialog.getByLabel("搜索").fill(planTitle.slice(0, 2));
    await page.waitForTimeout(800);
    check("搜索能命中计划", (await dialog.locator("p", { hasText: "计划" }).count()) >= 1, planTitle);
  }
  const apiSearch = await fetch(`${BASE}/api/search?q=${encodeURIComponent(needle)}`)
    .then((r) => r.json())
    .catch(() => null);
  check(
    "全局搜索接口返回分组",
    Array.isArray(apiSearch?.groups) && apiSearch.groups.length >= 1,
    JSON.stringify(apiSearch?.groups?.map((g) => g.key)),
  );

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("Esc 关闭搜索弹层", (await dialog.count()) === 0);

  // 三组结构：有对话就一定有「最近」；有置顶才出现「置顶」，有计划才出现「计划」
  const sidebarText = await aside.innerText();
  const sessionCount = await page.locator('aside a[href^="/s/"]').count();
  const plansNow = await fetch(`${BASE}/api/plans`).then((r) => r.json()).catch(() => null);
  if (sessionCount > 0) {
    check("侧栏有「最近」组", sidebarText.includes("最近"), sidebarText.slice(0, 40));
  }
  if ((plansNow?.plans?.length ?? 0) > 0) {
    check("有计划的侧栏有「计划」组", sidebarText.includes("计划"));
  }

  // 悬停会话条：右侧出现图钉 + 三个点，三个点菜单是 重命名/置顶/移至计划/删除
  if (sessionCount > 0) {
    const firstSession = page.locator('aside a[href^="/s/"]').first();
    await firstSession.hover();
    await page.waitForTimeout(350);
    const row = firstSession.locator("xpath=..");
    check(
      "悬停会话条出现右侧操作",
      (await row.locator('[aria-label="置顶对话"], [aria-label="取消置顶"]').count()) === 1 &&
        (await row.locator('[aria-label="对话操作"]').count()) === 1,
    );
    await row.locator('[aria-label="对话操作"]').click();
    await page.waitForTimeout(250);
    const sessionMenu = (await page.getByRole("menuitem").allInnerTexts()).map((x) => x.trim());
    check(
      "会话菜单是 重命名/置顶/移至计划/删除",
      ["重命名", "置顶", "移至计划", "删除"].every((x) => sessionMenu.includes(x)),
      JSON.stringify(sessionMenu),
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  await page.evaluate(() => localStorage.setItem("lumina-sidebar-collapsed", "1"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const collapsedWidth = (await aside.boundingBox())?.width ?? 0;
  check("侧边栏可折叠成图标栏", collapsedWidth > 0 && collapsedWidth < 100, String(collapsedWidth));
  check("窄栏保留搜索按钮", (await page.locator('aside [aria-label="搜索"]').count()) >= 1);
  check("折叠后没有单独的折叠按钮", (await page.locator('aside [aria-label="收起侧边栏"]').count()) === 0);
  check("折叠后软件图标是展开按钮", (await page.locator('aside [aria-label="展开侧边栏"]').count()) === 1);
  await aside.hover();
  await page.waitForTimeout(500);
  const hoverWidth = (await aside.boundingBox())?.width ?? 0;
  check("悬停不会自动展开", Math.abs(hoverWidth - collapsedWidth) < 2, `${collapsedWidth} → ${hoverWidth}`);
  await page.getByLabel("展开侧边栏").click();
  await page.waitForTimeout(450);
  const reopened = (await aside.boundingBox())?.width ?? 0;
  check("点按钮才展开", reopened > 200, String(reopened));
  await page.evaluate(() => localStorage.setItem("lumina-sidebar-collapsed", "0"));


  // 会话页「…」菜单向下展开且在视口内
  const sessions = await fetch(`${BASE}/api/sessions`).then((r) => r.json()).catch(() => ({ sessions: [] }));
  if (sessions.sessions?.length) {
    await page.goto(`${BASE}/s/${sessions.sessions[0].id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.locator("main summary").first().click();
    await page.waitForTimeout(250);
    const menu = await page.evaluate(() => {
      const el = document.querySelector("main details[open] > div");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        inViewport: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
        radius: getComputedStyle(el).borderRadius,
        below:
          r.top >= (document.querySelector("main summary")?.getBoundingClientRect().top ?? 0),
      };
    });
    check("会话页菜单向下展开且不越界", Boolean(menu?.inViewport && menu?.below), JSON.stringify(menu));
    check("下拉菜单是圆角面板", menu?.radius === "20px", String(menu?.radius));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    check("Esc 能收起菜单", (await page.locator("details[open]").count()) === 0);
  }

  await context.close();
}
await browser.close();
console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);


