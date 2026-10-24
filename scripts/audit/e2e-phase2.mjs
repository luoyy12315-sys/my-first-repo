/**
 * 阶段二端到端验收：10 个金融/会计图表场景 + 讲解风格 + 结构化换讲法。
 * 断言的是"模型实际调用 present_chart 时给出的 chartType"，而不是正文里说想画什么。
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3212";
const OUT = path.resolve("docs/audit/e2e-phase2.json");

async function createSession() {
  const res = await fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "infinite" }),
  });
  if (!res.ok) throw new Error(`create session failed: ${res.status}`);
  const data = await res.json();
  return data.session.id;
}

async function chat(sessionId, text, extra = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240000);
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, text, ...extra }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let firstBlockAt = -1;
    let eventIndex = 0;
    let textAfterBlock = false;
    let reasoningChars = 0;
    const blocks = [];
    const errors = [];
    let done = null;

    while (true) {
      const { done: end, value } = await reader.read();
      if (end) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith("data:")) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        eventIndex++;
        if (evt.type === "block") {
          if (firstBlockAt === -1) firstBlockAt = eventIndex;
          const p = evt.block?.payload ?? {};
          blocks.push({
            kind: evt.block?.kind,
            title: evt.block?.title,
            chartType: p.chartType,
            dataKind: p.dataKind,
            dataNote: p.dataNote,
            seriesCount: Array.isArray(p.series) ? p.series.length : 0,
            candleCount: Array.isArray(p.candles) ? p.candles.length : 0,
            xKinds: [
              ...new Set(
                (p.series ?? []).flatMap((s) => (s.points ?? []).map((pt) => typeof pt.x)),
              ),
            ],
          });
        } else if (evt.type === "delta") {
          content += String(evt.text ?? "");
          if (firstBlockAt !== -1) textAfterBlock = true;
        } else if (evt.type === "error") {
          errors.push({ code: evt.code, message: evt.message });
        } else if (evt.type === "done") {
          done = evt;
          reasoningChars = evt.reasoningChars ?? 0;
        }
      }
    }

    return {
      chars: content.trim().length,
      text: content,
      blocks,
      textAfterBlock,
      reasoningChars,
      finishReason: done?.finishReason ?? null,
      usage: done?.usage ?? null,
      errors,
    };
  } finally {
    clearTimeout(timer);
  }
}

const CASES = [
  {
    id: "revenue",
    prompt: "帮我画一张某公司 2022–2024 年营业收入和净利润的对比图，示意数据即可。",
    expect: ["bar", "combo", "line"],
  },
  {
    id: "pie",
    prompt: "用饼图展示某公司资产结构：流动资产 60%、固定资产 30%、无形资产 10%。",
    expect: ["pie"],
    required: true,
  },
  {
    id: "monthly",
    prompt: "画一张 2024 年 1–12 月应收账款余额的趋势图，示意数据即可。",
    expect: ["line", "area", "bar"],
  },
  {
    id: "waterfall",
    prompt:
      "用瀑布图展示从营业收入到净利润的构成：营收 1000，成本 600，费用 200，税 50，净利润 150。",
    expect: ["waterfall"],
    required: true,
  },
  {
    id: "compound",
    prompt: "画一个复利增长曲线：本金 10000，年利率 5%，期限 20 年。",
    expect: ["line", "area"],
  },
  {
    id: "dual-axis",
    prompt:
      "用一张双轴图对比某公司三年毛利率（%）和营业收入（万元），示意数据即可。",
    expect: ["combo"],
    required: true,
  },
  {
    id: "cvp",
    prompt:
      "画本量利分析图：固定成本 50000，单位售价 20，单位变动成本 12，销量 0–10000。",
    expect: ["line", "combo", "area"],
  },
  {
    id: "npv-irr",
    prompt:
      "用柱状图对比 A、B 两个方案的 NPV 和 IRR。假设 A 方案 NPV 120 万、IRR 18%；B 方案 NPV 90 万、IRR 24%。",
    expect: ["bar", "combo"],
  },
  {
    id: "candlestick",
    prompt: "画一张 5 天的 K 线图示例，展示开盘、最高、最低、收盘。",
    expect: ["candlestick"],
    required: true,
  },
  {
    id: "trial-balance",
    prompt:
      "把这张试算平衡表画成图：库存现金 50000，银行存款 200000，应付账款 80000，实收资本 170000。",
    expect: ["bar", "waterfall", "pie"],
  },
];

const report = { ranAt: new Date().toISOString(), base: BASE, cases: [], style: null, representation: null };

for (const c of CASES) {
  process.stdout.write(`[${c.id}] `);
  try {
    const sessionId = await createSession();
    const r = await chat(sessionId, c.prompt);
    const chartTypes = r.blocks.filter((b) => b.kind === "chart").map((b) => b.chartType);
    const matched = chartTypes.some((t) => c.expect.includes(t));
    report.cases.push({
      id: c.id,
      expect: c.expect,
      required: Boolean(c.required),
      sessionId,
      matched,
      chartTypes,
      blocks: r.blocks,
      chars: r.chars,
      textAfterBlock: r.textAfterBlock,
      reasoningChars: r.reasoningChars,
      finishReason: r.finishReason,
      errors: r.errors,
      preview: r.text.slice(0, 300),
    });
    console.log(
      `→ ${matched ? "OK" : "MISS"} 类型=${chartTypes.join(",") || "无"} ` +
        `正文=${r.chars}字 推理=${r.reasoningChars}字`,
    );
  } catch (e) {
    report.cases.push({ id: c.id, expect: c.expect, error: e instanceof Error ? e.message : String(e) });
    console.log(`→ ERROR ${e instanceof Error ? e.message : e}`);
  }
}

// ── 讲解风格：自定义风格（先提问，不直接给定义）+ 必须提问 ──
try {
  process.stdout.write("[style] ");
  const put = await fetch(`${BASE}/api/settings/teaching`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "create",
      style: {
        name: "引导式",
        directive: "先提问引导我自己想，不要一上来就给定义",
        verbosity: 4,
        requireExample: true,
        requireCheckQuestion: true,
      },
    }),
  });
  const created = put.ok ? await put.json() : null;
  // 第一个风格会自动设为使用中；这里再显式激活一次，避免库里已有其它风格
  if (created?.style?.id) {
    await fetch(`${BASE}/api/settings/teaching`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "activate", id: created.style.id }),
    });
  }
  const sessionId = await createSession();
  const r = await chat(sessionId, "讲讲什么是资产。");
  const questions = (r.text.match(/[？?]/g) ?? []).length;
  const hasDefinitionLeak = /^资产是指|资产的定义是/.test(r.text.trim());
  report.style = { activeId: created?.activeId ?? null, sessionId, chars: r.chars, questions, hasDefinitionLeak, preview: r.text.slice(0, 400) };
  console.log(`→ ${r.chars}字, ${questions}个问句, 直接给定义=${hasDefinitionLeak}`);
} catch (e) {
  report.style = { error: e instanceof Error ? e.message : String(e) };
  console.log(`→ ERROR ${e instanceof Error ? e.message : e}`);
}

// ── 结构化换讲法：指定对比表，避开类比/案例 ──
try {
  process.stdout.write("[representation] ");
  const sessionId = await createSession();
  const r = await chat(sessionId, "我还是没懂权责发生制和收付实现制的区别，换个讲法。", {
    representation: "contrast",
    avoidRepresentations: ["analogy", "case"],
  });
  report.representation = {
    sessionId,
    chars: r.chars,
    blocks: r.blocks,
    preview: r.text.slice(0, 400),
  };
  console.log(`→ ${r.chars}字, 组件=${r.blocks.map((b) => b.kind).join(",") || "无"}`);
} catch (e) {
  report.representation = { error: e instanceof Error ? e.message : String(e) };
  console.log(`→ ERROR ${e instanceof Error ? e.message : e}`);
}

const required = report.cases.filter((c) => c.required);
const requiredOk = required.filter((c) => c.matched).length;
const allOk = report.cases.filter((c) => c.matched).length;
report.summary = {
  required: `${requiredOk}/${required.length}`,
  matched: `${allOk}/${report.cases.length}`,
  emptyResponses: report.cases.filter((c) => c.chars === 0 && !(c.chartTypes?.length > 0)).length,
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
console.log(`\n汇总：金融四类 ${report.summary.required}，全部 ${report.summary.matched}`);
console.log(`Saved: ${OUT}`);
