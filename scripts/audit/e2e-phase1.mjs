/**
 * 阶段一端到端验收：用独立 DATA_DIR 起一个真实模型实例，验证
 *   1) 推理型模型不再返回空正文
 *   2) 组件之后模型还能续写（正文不会断在"下面这张表："）
 *   3) 组件与正文的先后顺序正确
 *
 * 用法：先启动独立实例（scripts/audit/start-e2e.cjs），再 node scripts/audit/e2e-phase1.mjs
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3212";
const OUT = path.resolve(`docs/audit/e2e-phase1${process.env.E2E_ONLY ? `-${process.env.E2E_ONLY}` : ""}.json`);

async function createSession() {
  const res = await fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "infinite" }),
  });
  if (!res.ok) throw new Error(`create session failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.session.id;
}

async function chat(sessionId, text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240000);
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, text }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status} ${await res.text()}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let firstBlockAt = -1;
    let eventIndex = 0;
    let textAfterBlock = false;
    let reasoningEvents = 0;
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
          blocks.push({ kind: evt.block?.kind ?? "?", title: evt.block?.title ?? "" });
        } else if (evt.type === "delta") {
          content += String(evt.text ?? "");
          if (firstBlockAt !== -1) textAfterBlock = true;
        } else if (evt.type === "thinking") {
          if (evt.state === "start") reasoningEvents++;
        } else if (evt.type === "error") {
          errors.push({ code: evt.code, message: evt.message });
        } else if (evt.type === "done") {
          done = evt;
        }
      }
    }

    return {
      text,
      chars: content.trim().length,
      text: content,
      blocks,
      textAfterBlock,
      reasoningEvents,
      reasoningChars: done?.reasoningChars ?? 0,
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
    id: "kline",
    prompt: "画一张 5 天的 K 线图示例，展示开盘、最高、最低、收盘。",
    acceptance: "不再返回空正文（允许模型说明不支持并给替代方案）",
  },
  {
    id: "table-continuation",
    prompt: "用表格对比权责发生制和收付实现制，表格之后再补两句话总结最关键的区别。",
    acceptance: "出现 table 组件，且组件之后仍有正文（textAfterBlock=true）",
  },
  {
    id: "chart-continuation",
    prompt: "画一张复利增长曲线：本金 10000，年利率 5%，期限 20 年，画完后用一句话说明曲线为什么向上弯曲。",
    acceptance: "出现 chart 组件，且组件之后仍有正文",
  },
];

const report = { ranAt: new Date().toISOString(), base: BASE, cases: [] };
const only = process.env.E2E_ONLY;
const selected = only ? CASES.filter((c) => c.id === only) : CASES;

for (const c of selected) {
  process.stdout.write(`\n[${c.id}] ${c.prompt.slice(0, 30)}…\n`);
  try {
    const sessionId = await createSession();
    const r = await chat(sessionId, c.prompt);
    report.cases.push({
      id: c.id,
      acceptance: c.acceptance,
      chars: r.chars,
      blocks: r.blocks,
      textAfterBlock: r.textAfterBlock,
      reasoningChars: r.reasoningChars,
      reasoningEvents: r.reasoningEvents,
      finishReason: r.finishReason,
      usage: r.usage,
      errors: r.errors,
      preview: r.text.slice(0, 400),
    });
    console.log(
      `  → 正文 ${r.chars} 字，组件 ${r.blocks.map((b) => b.kind).join(",") || "无"}，` +
        `组件后续写=${r.textAfterBlock}，推理 ${r.reasoningChars} 字，错误 ${r.errors.length}`,
    );
  } catch (e) {
    report.cases.push({ id: c.id, error: e instanceof Error ? e.message : String(e) });
    console.log(`  → ERROR ${e instanceof Error ? e.message : e}`);
  }
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
console.log(`\nSaved: ${OUT}`);
