/**
 * 审查复现脚本（2026-10-24）
 *
 * 目的：用真实模型跑一组固定的会计/金融图表与讲解场景，把"图表生成不了"
 * 拆成可统计的失败类型，并留下讲解质量基线。
 *
 * 运行（Node 不在 PATH，先确认版本目录）：
 *   node -e "require('esbuild').buildSync({entryPoints:['scripts/audit/repro.ts'],bundle:true,platform:'node',format:'cjs',outfile:'scripts/audit/repro.cjs',external:['better-sqlite3'],alias:{'@':require('path').resolve('src')}})"
 *   node scripts/audit/repro.cjs
 * 结果写入 docs/audit/repro-2026-10-24.json
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { TEACHING_TOOLS } from "@/lib/ai/tools";
import { chartInputSchema } from "@/lib/blocks/schema";
import type { AiConfig } from "@/lib/ai/config";
import { streamChat, type LlmToolSpec } from "@/lib/ai/provider";

const OUT = path.resolve("docs/audit");
fs.mkdirSync(OUT, { recursive: true });

/** 只读打开真实库取模型配置，避免触发迁移/写入正在使用的数据库 */
function loadConfig(): AiConfig {
  const db = new Database(path.resolve("data/lumina.db"), { readonly: true });
  try {
    const row = db
      .prepare("select value from settings where key = 'ai_config'")
      .get() as { value: string } | undefined;
    if (!row) throw new Error("settings 里没有 ai_config，请先在设置页配置模型");
    const j = JSON.parse(row.value) as {
      provider: "openai" | "anthropic";
      baseUrl: string;
      model: string;
      temperature: number;
      apiKey: string;
    };
    return {
      id: null,
      label: j.model,
      provider: j.provider,
      baseUrl: j.baseUrl.replace(/\/+$/, ""),
      apiKey: j.apiKey,
      model: j.model,
      temperature: j.temperature,
      timeoutMs: 120000,
      maxTokens: 4000,
      source: "settings",
    };
  } finally {
    db.close();
  }
}

const config = loadConfig();
const tools: LlmToolSpec[] = TEACHING_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters as Record<string, unknown>,
}));

const CHART_CASES = [
  "帮我画一张某公司 2022–2024 年营业收入和净利润的对比图，示意数据即可。",
  "用饼图展示某公司资产结构：流动资产 60%、固定资产 30%、无形资产 10%。",
  "画一张 2024 年 1–12 月应收账款余额的趋势图，示意数据即可。",
  "用瀑布图展示从营业收入到净利润的构成：营收 1000，成本 600，费用 200，税 50。",
  "画一个复利增长曲线：本金 10000，年利率 5%，期限 20 年。",
  "用双轴图对比某公司三年毛利率（%）和营业收入（万元）。",
  "画本量利分析图：固定成本 50000，单位售价 20，单位变动成本 12，销量 0–10000。",
  "用柱状图对比 A、B 两个方案的 NPV 和 IRR。假设 A 方案 NPV 120 万、IRR 18%；B 方案 NPV 90 万、IRR 24%。",
  "画一张 5 天的 K 线图示例，展示开盘、最高、最低、收盘。",
  "把这张试算平衡表画成图：库存现金 50000，银行存款 200000，应付账款 80000，实收资本 170000。",
];

const EXPLAIN_CASES = [
  "用通俗的话讲讲借贷记账法，我是零基础。",
  "我还是没懂权责发生制和收付实现制的区别，换个讲法。",
  "我上次把「应收账款」和「预收账款」搞混了，帮我理清。",
  "以后讲解都先用苏格拉底式提问引导我，不要直接给答案。现在讲讲什么是资产。",
];

interface RunResult {
  text: string;
  usage?: { promptTokens: number; completionTokens: number };
  finishReason: string | null;
  toolCalls: { id: string; name: string; arguments: string }[];
}

async function run(userText: string): Promise<RunResult> {
  let streamed = "";
  const res = await streamChat({
    config,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userText },
    ],
    tools,
    onText: (d) => {
      streamed += d;
    },
  });
  return {
    text: res.text || streamed,
    usage: res.usage,
    finishReason: res.finishReason,
    toolCalls: res.toolCalls,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function analyzeChart(call: { arguments: string }) {
  let args: unknown;
  try {
    args = JSON.parse(call.arguments);
  } catch {
    return { verdict: "bad-json", errors: ["arguments 不是合法 JSON"] };
  }
  const a = args as {
    chartType?: string;
    series?: { name?: string; points?: { x?: unknown; y?: unknown }[] }[];
  };
  const xKinds = [
    ...new Set((a.series ?? []).flatMap((s) => (s.points ?? []).map((p) => typeof p.x))),
  ];
  const parsed = chartInputSchema.safeParse(args);
  if (parsed.success) {
    const series = parsed.data.series ?? [];
    return {
      verdict: "ok",
      chartType: parsed.data.chartType,
      seriesCount: series.length,
      pointCount: series.reduce((n, s) => n + s.points.length, 0),
      xKinds,
    };
  }
  return {
    verdict: "schema-fail",
    chartType: a.chartType ?? "(missing)",
    xKinds,
    errors: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

function summarizeText(t: string) {
  const headings = (t.match(/^#{1,4}\s+/gm) ?? []).length;
  const analogies = (t.match(/比如|好比|想象|就像|相当于|打个比方/g) ?? []).length;
  const questions = (t.match(/[？?]/g) ?? []).length;
  const tables = (t.match(/^\|/gm) ?? []).length;
  return { chars: t.length, headings, analogies, questions, tableLines: tables };
}

async function main() {
  const report: Record<string, unknown> = {
    ranAt: new Date().toISOString(),
    model: config.label,
    provider: config.provider,
    temperature: config.temperature,
    charts: [],
    explain: [],
  };

  for (const [i, prompt] of CHART_CASES.entries()) {
    process.stdout.write(`[chart ${i + 1}/${CHART_CASES.length}] ${prompt.slice(0, 24)}… `);
    try {
      const r = await run(prompt);
      const chartCalls = r.toolCalls.filter((c) => c.name === "present_chart");
      const otherTools = r.toolCalls.filter((c) => c.name !== "present_chart").map((c) => c.name);
      const entry = {
        prompt,
        calledPresentChart: chartCalls.length > 0,
        chartCalls: chartCalls.map(analyzeChart),
        otherTools,
        textChars: r.text.length,
        usage: r.usage,
        preview: r.text.slice(0, 240),
      };
      (report.charts as unknown[]).push(entry);
      const verdict = chartCalls.length
        ? chartCalls.map((c) => analyzeChart(c).verdict).join(",")
        : "no-tool";
      console.log(`→ ${verdict}${otherTools.length ? ` (其他工具: ${otherTools.join(",")})` : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      (report.charts as unknown[]).push({ prompt, error: msg });
      console.log(`→ ERROR ${msg}`);
    }
    await sleep(600);
  }

  for (const [i, prompt] of EXPLAIN_CASES.entries()) {
    process.stdout.write(`[explain ${i + 1}/${EXPLAIN_CASES.length}] ${prompt.slice(0, 22)}… `);
    try {
      const r = await run(prompt);
      const entry = {
        prompt,
        tools: r.toolCalls.map((c) => c.name),
        usage: r.usage,
        metrics: summarizeText(r.text),
        text: r.text,
      };
      (report.explain as unknown[]).push(entry);
      console.log(`→ ${entry.metrics.chars} 字, ${entry.metrics.headings} 标题, ${entry.metrics.analogies} 类比`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      (report.explain as unknown[]).push({ prompt, error: msg });
      console.log(`→ ERROR ${msg}`);
    }
    await sleep(600);
  }

  const file = path.join(OUT, "repro-2026-10-24.json");
  fs.writeFileSync(file, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nSaved: ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
