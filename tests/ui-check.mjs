/**
 * 浏览器交互验证（真正的 UI 断言，需要本机 Edge/Chrome）
 *
 * 用法：node tests/ui-check.mjs
 * 说明：脚本会自己创建夹具会话（依赖 tests/mock-llm-server.mjs 的固定内容），
 *      也可用 DEMO_SESSION 指定现成会话。
 * 覆盖：移动端布局无横向溢出、练习题可作答并得到反馈、
 *      模拟器参数可调且刷新后恢复、档案弹窗可打开、无控制台报错。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3210";
const SESSION = process.env.DEMO_SESSION;
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const exe = fs.existsSync(EDGE) ? EDGE : CHROME;

let pass = 0;
let fail = 0;
const lines = [];
const check = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    lines.push(`  ✓ ${name}`);
  } else {
    fail++;
    lines.push(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
};

const errors = [];

async function main() {
  // 自建夹具：练习 + 模拟器各一条，避免依赖外部会话
  let sessionId = SESSION || "";
  if (!sessionId) {
    const fx = await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "free" }),
    }).then((r) => r.json());
    sessionId = fx.session.id;
    for (const text of [
      "从零开始教我机会成本，我完全没基础。",
      "用模拟器解释一下复利，我想自己拖参数。",
    ]) {
      await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, text }),
      }).then((r) => r.text());
    }
  }
  // 多模型夹具：每次用唯一名字，避免与历史遗留配置重名导致选错选项
  const modelList = await fetch(`${BASE}/api/models`).then((r) => r.json());
  const models = modelList.models ?? [];
  const altLabel = `UI测试备用-${Date.now().toString().slice(-6)}`;
  let altModelId = null;
  {
    const fallbackBase = models[0]?.baseUrl ?? "http://127.0.0.1:4318/v1";
    const created = await fetch(`${BASE}/api/models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: altLabel,
        provider: "openai",
        baseUrl: fallbackBase,
        model: "mock-tutor-alt",
        apiKey: "ui-check-key-123456",
      }),
    }).then((r) => r.json());
    altModelId = created.model ?? null;
  }

  if (!fs.existsSync(exe)) throw new Error("未找到可用的 Edge/Chrome");
  fs.mkdirSync("research/shots", { recursive: true });

  const browser = await chromium.launch({ executablePath: exe, headless: true });

  // ── 移动端：首页 ──
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  m.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[mobile] ${msg.text()}`);
  });
  await m.goto(BASE, { waitUntil: "networkidle" });
  const mWidth = await m.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  check("移动端无横向溢出", mWidth.sw <= mWidth.iw + 1, `scrollWidth=${mWidth.sw}`);
  check("移动端显示底部导航", await m.locator("nav.fixed").first().isVisible());
  await m.screenshot({ path: "research/shots/m_home_real.png" });
  await m.close();

  // ── 桌面：会话 ──
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[session] ${msg.text()}`);
  });
  await p.goto(`${BASE}/s/${sessionId}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  const titleVisible = await p
    .locator("header")
    .filter({ hasText: "自由学习" })
    .first()
    .isVisible();
  check("会话标题栏可见", titleVisible);

  // 对话内切换模型（多模型）
  const modelBtn = p.locator('button[aria-haspopup="listbox"]').first();
  check("输入框有模型选择入口", (await modelBtn.count()) > 0);
  await modelBtn.click();
  await p.waitForTimeout(300);
  const listbox = p.locator('[role="listbox"]').first();
  check("模型下拉可展开", await listbox.isVisible());
  const optionCount = await listbox.locator('[role="option"]').count();
  check("下拉列出多个模型", optionCount >= 2, `选项数 ${optionCount}`);
  const altOption = listbox.locator('[role="option"]', { hasText: altLabel }).first();
  const hasAlt = (await altOption.count()) > 0;
  if (hasAlt) {
    await altOption.click();
    await p.waitForTimeout(1200);
    const switched = await fetch(`${BASE}/api/sessions/${sessionId}`).then((r) => r.json());
    check(
      "切换后会话记住所选模型",
      switched.session?.modelId === altModelId,
      `${switched.session?.modelId} vs ${altModelId}`,
    );
    check("切换后按钮显示新模型名", (await modelBtn.innerText()).includes("UI测试备用"), await modelBtn.innerText());

    // 切回默认，避免影响后续用例
    await modelBtn.click();
    await p.waitForTimeout(250);
    const defOption = p.locator('[role="option"]', { hasText: "默认" }).first();
    await defOption.click();
    await p.waitForTimeout(900);
    const back = await fetch(`${BASE}/api/sessions/${sessionId}`).then((r) => r.json());
    check("可切回默认模型", back.session?.modelId === null, String(back.session?.modelId));
  }

  const exercise = p.locator("text=机会成本是多少").first();
  check("练习组件已渲染", await exercise.isVisible());

  // 若已作答过，先「再做一次」重置，保证脚本在任意状态下可重复执行
  const resetBtn = p.locator("button", { hasText: "再做一次" }).first();
  if (await resetBtn.count()) {
    await resetBtn.click();
    await p.waitForTimeout(400);
  }

  // 先用一次提示，验证「再做一次」会把提示状态一起清掉（P1-2）
  const hintBtn = p.locator("button", { hasText: "给我提示" }).first();
  if (await hintBtn.count()) {
    await hintBtn.click();
    await p.waitForTimeout(800);
  }
  check("使用提示后展示提示内容", (await p.locator("text=提示：").count()) > 0);

  // 作答：选中 B（120 元，错误项）→ 提交
  const optionB = p.locator("button", { hasText: "120 元" }).first();
  await optionB.click();
  const submit = p.locator("button", { hasText: /提交答案|重新提交/ }).first();
  check("提交按钮可用", await submit.isEnabled());
  await submit.click();
  await p.waitForTimeout(1200);
  const feedbackPanel = p.locator("text=/答对了|没有答对/").first();
  check("提交后出现判题反馈", await feedbackPanel.isVisible());
  check("错答被判为未答对", (await p.locator("text=没有答对").count()) > 0);
  check("提交后展示标准答案", await p.locator("text=正确答案").first().isVisible());
  check("反馈包含知识点掌握度", await p.locator("text=掌握度").first().isVisible());
  check("答完后出现讲讲这道题", (await p.getByRole("button", { name: "讲讲这道题" }).count()) > 0);
  const exerciseCard = p
    .locator("div.overflow-hidden.rounded-2xl")
    .filter({ hasText: "机会成本是多少" })
    .first();
  check(
    "答错后不直接提供离开本步",
    (await exerciseCard.getByRole("button", { name: /继续下一步|完成.*进入/ }).count()) === 0,
  );
  await p.screenshot({ path: "research/shots/session_answered.png", fullPage: false });

  // 重做后提示状态必须清空（否则下一次会被继续判为「借助提示」）
  const retryAfterHint = p.locator("button", { hasText: "再做一次" }).first();
  if (await retryAfterHint.count()) {
    await retryAfterHint.click();
    await p.waitForTimeout(500);
  }
  check("再做一次后提示状态被清空", (await p.locator("text=提示：").count()) === 0);

  // ── 模拟器：拖动参数 + 刷新恢复 ──
  const simSliders = p.locator('input[type="range"]');
  const sliderCount = await simSliders.count();
  check("模拟器滑块可用", sliderCount >= 3, `滑块数 ${sliderCount}`);
  if (sliderCount >= 3) {
    const third = simSliders.nth(2);
    await third.focus();
    await p.keyboard.press("End"); // 键盘调到最大值，触发 React onChange
    await p.waitForTimeout(400);
    const afterMove = await third.inputValue();
    check("拖动参数后数值变化", Number(afterMove) === 40, `value=${afterMove}`);
    await p.waitForTimeout(900); // 等状态保存
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    const restored = await p.locator('input[type="range"]').nth(2).inputValue();
    check("刷新后组件状态恢复", Number(restored) === 40, `value=${restored}`);
  }
  await p.screenshot({ path: "research/shots/session_desktop.png" });

  // ── 多题小测：统一提交 + x/n 总评 + 逐题反馈 ──
  {
    const qs = await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "free" }),
    }).then((r) => r.json());
    await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: qs.session.id,
        text: "给我一套3题小测，检查我对机会成本的理解。",
      }),
    }).then((r) => r.text());

    const qp = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await qp.goto(`${BASE}/s/${qs.session.id}`, { waitUntil: "networkidle" });
    await qp.waitForTimeout(700);
    check("多题小测已渲染", await qp.getByText("小测 · 3 题").first().isVisible());
    check("小测显示多知识点", await qp.getByText("覆盖 3 个知识点").first().isVisible());
    check("小测显示题号", await qp.getByText("第 2 题 · 共 3 题").first().isVisible());
    const qBefore = await qp.locator("body").innerText();
    check("小测提交前不泄露答案", !qBefore.includes("正确答案"));
    const qCard = (text) => qp.locator("div.border-t.border-line").filter({ hasText: text }).first();
    await qCard("机会成本衡量的是什么？").locator("button", { hasText: "被放弃的最优替代方案的价值" }).click();
    await qCard("这 100 元在会计上属于什么？").locator("button", { hasText: "账面成本" }).click();
    await qCard("已经花掉、无法收回的钱属于什么？").locator("button", { hasText: "沉没成本" }).click();
    await qp.getByRole("button", { name: "提交小测" }).click();
    await qp.getByText("答对 3/3 题").first().waitFor({ timeout: 15000 });
    await qp.waitForTimeout(500);
    const qAfter = await qp.locator("body").innerText();
    check("小测 3/3 总评", qAfter.includes("答对 3/3 题"));
    check("小测逐题反馈", (qAfter.match(/答对了/g) ?? []).length >= 3);
    check("小测答完可继续下一步", (await qp.getByRole("button", { name: "继续下一步" }).count()) > 0);
    await qp.screenshot({ path: "research/shots/quiz_block.png" });
    await qp.close();
  }

  // ── 学习档案 ──
  await p.goto(`${BASE}/library`, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const conceptBtn = p.locator("button", { hasText: "机会成本" }).first();
  check("档案页列出知识点", await conceptBtn.isVisible());
  await conceptBtn.click();
  await p.waitForTimeout(700);
  check("知识点详情可打开", await p.locator("text=状态变更依据").first().isVisible());
  check("详情展示作答证据", await p.locator("text=作答证据").first().isVisible());
  check("证据可逐条作废", (await p.locator("text=这条不算").count()) > 0);
  await p.screenshot({ path: "research/shots/library_modal.png" });

  // ── 设置 ──
  await p.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  check("设置页可见模型配置", await p.locator("text=模型服务").first().isVisible());
  check("设置页显示数据位置", await p.locator("text=lumina.db").first().isVisible());
  await p.screenshot({ path: "research/shots/settings.png" });

  // ── 复习 / 计划 / 材料 空态或列表 ──
  for (const [path, label] of [
    ["/review", "复习"],
    ["/plan", "计划"],
    ["/materials", "材料"],
    ["/history", "历史"],
  ]) {
    await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(250);
    const body = await p.locator("body").innerText();
    check(`${label}页可正常渲染`, body.length > 40, `${body.length} 字符`);
  }

  // ── 健壮性：曾经真实把整页打崩的两种内容 ──
  const created = await fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "free" }),
  }).then((r) => r.json());
  const rp = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  const robustErrors = [];
  rp.on("pageerror", (e) => robustErrors.push(String(e.message).slice(0, 160)));
  await rp.goto(`${BASE}/s/${created.session.id}`, { waitUntil: "networkidle" });

  await rp.locator("textarea").first().fill("给我一条学习路线");
  await rp.keyboard.press("Enter");
  await rp.waitForTimeout(3000);
  let rbody = await rp.locator("body").innerText();
  check("学习路线块不再把页面打崩", !/couldn.t load|Reload to try again|Application error/i.test(rbody));
  check("学习路线内容正常渲染", /极限与连续/.test(rbody) && /四周搞定导数/.test(rbody));
  check("计划生成后有开始第一步", (await rp.getByRole("button", { name: "开始第一步" }).count()) > 0);

  await rp.locator("textarea").first().fill("来点坏公式");
  await rp.keyboard.press("Enter");
  await rp.waitForTimeout(2800);
  rbody = await rp.locator("body").innerText();
  check("非法 LaTeX 不再把页面打崩", !/couldn.t load|Reload to try again|Application error/i.test(rbody));
  check("教完后出现下一步选项", await rp.getByText("下一步", { exact: true }).first().isVisible());
  check("教完后有出题检验", (await rp.getByRole("button", { name: "出题检验" }).count()) > 0);
  check("降级后仍停留在会话页", /Lumina/.test(rbody));
  check("健壮性场景无未捕获异常", robustErrors.length === 0, robustErrors.join("; "));
  await rp.screenshot({ path: "research/shots/robustness.png" });
  await rp.close();

  // ── 学习路线可删除 ──
  const planSession = await fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "goal" }),
  }).then((r) => r.json());
  await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: planSession.session.id, text: "给我一条学习路线" }),
  }).then((r) => r.text());

  await p.goto(`${BASE}/plan`, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const before = await p.locator("h2", { hasText: "四周搞定导数" }).count();
  check("路线出现在计划页", before > 0, `count=${before}`);
  const delBtn = p.locator('button[aria-label="删除这条路线"]').first();
  check("计划页有删除入口", (await delBtn.count()) > 0);
  await delBtn.click();
  await p.waitForTimeout(300);
  check("删除前有确认弹窗", await p.locator("text=删除这条学习路线").first().isVisible());
  await p.locator("button", { hasText: "确认删除" }).first().click();
  await p.waitForTimeout(1000);
  const after = await p.locator("h2", { hasText: "四周搞定导数" }).count();
  check("确认后路线被删除", after === before - 1, `before=${before} after=${after}`);

  // ── 学习档案：空壳知识点可清理 ──
  await p.goto(`${BASE}/library`, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const cleanupBtn = p.locator("button", { hasText: /清理未学习/ });
  const hadEmpty = (await cleanupBtn.count()) > 0;
  if (hadEmpty) {
    await cleanupBtn.first().click();
    await p.waitForTimeout(300);
    check("清理前有确认弹窗", await p.locator("text=清理未学习知识点").first().isVisible());
    await p.locator("button", { hasText: /^清理 \d+ 个$/ }).first().click();
    await p.waitForTimeout(1000);
  }
  const stillHasEmpty = (await p.locator("button", { hasText: /清理未学习/ }).count()) > 0;
  check("清理后不再有未学习知识点", !stillHasEmpty, hadEmpty ? "仍显示入口" : "本来就没有空壳");

  // ── 侧栏不再保留重复的“开始新的学习”入口，回首页输入框即可 ──
  {
    await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await p.waitForTimeout(300);
    check(
      "侧栏没有重复的新建入口",
      (await p.locator("button", { hasText: "开始新的学习" }).count()) === 0,
    );
  }

  // ── 来源卡片与引用角标 ──
  {
    const web = await fetch(`${BASE}/api/settings/web`).then((r) => r.json());
    check("联网检索默认关闭或已配置", web.enabled === false || web.configured === true);

    if (web.configured) {
      // 临时打开联网，跑完来源相关断言后恢复原状
      await fetch(`${BASE}/api/settings/web`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      await p.goto(`${BASE}/s/${sessionId}`, { waitUntil: "networkidle" });
      await p.waitForTimeout(600);
      const s2 = await fetch(`${BASE}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "free" }),
      }).then((r) => r.json());
      await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: s2.session.id, text: "2026 年个税专项附加扣除有哪些？", webMode: "manual" }),
      }).then((r) => r.text());

      await p.goto(`${BASE}/s/${s2.session.id}`, { waitUntil: "networkidle" });
      await p.waitForTimeout(1200);
      const chips = p.locator("a.citation-chip");
      check("正文出现引用角标", (await chips.count()) > 0);
      if (await chips.count()) {
        const href = await chips.first().getAttribute("href");
        check("角标指向来源卡片", typeof href === "string" && href.startsWith("#source-"), String(href));
      }
      check("展示来源卡片", await p.locator("text=参考了").first().isVisible());
      check("来源卡片标注类型", (await p.locator("text=网络").count()) > 0);
      const rel = await p.locator("a", { hasText: "打开原页" }).first().getAttribute("rel");
      check("外链带 noopener noreferrer", String(rel).includes("noopener"));
      check("伪造引用已从正文移除", !(await p.locator("body").innerText()).includes("w9"));

      // 联网开关可切换
      await p.locator('button[aria-pressed]').first().click();
      await p.waitForTimeout(400);
      check("联网开关可切换", (await p.locator("text=联网：手动").count()) > 0);
      await p.locator('button[aria-pressed]').first().click();
      await p.waitForTimeout(300);
      await p.screenshot({ path: "research/shots/sources_ui.png" });
      if (!web.enabled) {
        await fetch(`${BASE}/api/settings/web`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
      }
    } else {
      // 开关在会话页的 Composer 里，先回到会话再断言（首页没有这个控件）
      await p.goto(`${BASE}/s/${sessionId}`, { waitUntil: "networkidle" });
      await p.waitForTimeout(500);
      check("联网未配置时开关禁用", (await p.locator("button[aria-pressed][disabled]").count()) > 0);
    }
  }

  // 清理本轮创建的夹具模型
  if (altModelId) {
    await fetch(`${BASE}/api/models/${altModelId}`, { method: "DELETE" }).catch(() => undefined);
  }

  await browser.close();

  console.log(lines.join("\n"));
  if (errors.length) {
    console.log("\n控制台错误：");
    errors.slice(0, 10).forEach((e) => console.log("  ! " + e));
  } else {
    console.log("\n  ✓ 无控制台错误");
  }
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("UI 验证异常：", e.message);
  console.log(lines.join("\n"));
  process.exit(1);
});
