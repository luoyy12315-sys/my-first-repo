/**
 * 阶段三 真实模型验收（临时脚本，tests/_*.mjs 已被忽略）
 *
 * 用真实模型走一遍：出题 → 答错 → 答案下发 → 「再做一次」 → 重做不再计入独立正确。
 * 只创建一个临时会话，跑完删除。
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3210";

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

const json = async (path, init) => {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

async function chat(body) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`chat ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const events = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        /* ignore */
      }
    }
  }
  return events;
}

const t0 = Date.now();
const session = (await json("/api/sessions", { method: "POST", body: JSON.stringify({ mode: "infinite" }) })).body
  .session;
check("创建临时会话", Boolean(session?.id), String(session?.id));

const events = await chat({
  sessionId: session.id,
  text: "用一道单选题考我：机会成本的核心定义是什么。只要一道题，给出题干和 2 个选项，不要展开讲解。",
});
const text = events.filter((e) => e.type === "delta" || e.type === "text").map((e) => e.text ?? "").join("");
const done = events.find((e) => e.type === "done");
const exerciseId = events.find((e) => e.type === "block" && e.block?.kind === "exercise")?.block?.exercise?.id;
console.log(`  · 真实模型用时 ${((Date.now() - t0) / 1000).toFixed(1)}s，事件 ${events.length} 个，正文 ${text.length} 字`);
check("真实模型返回了正文", text.length > 20, text.slice(0, 60));
check("流正常结束", Boolean(done), JSON.stringify(events.at(-1) ?? {}).slice(0, 120));
check("生成了练习组件", Boolean(exerciseId), String(exerciseId));

if (exerciseId) {
  const before = await json(`/api/exercises/${exerciseId}`);
  check("未作答时不下发答案", before.body.attempts.every((a) => a.correctDisplay === null) === true);

  const first = await json("/api/attempts", {
    method: "POST",
    body: JSON.stringify({ exerciseId, answer: 0, idempotencyKey: `real-first-${Date.now()}` }),
  });
  check("首次作答被判分", first.body.graded === true, JSON.stringify(first.body).slice(0, 120));
  check("判分后下发标准答案", Boolean(first.body.attempt?.correctDisplay));
  check("首次作答未被标记看过答案", first.body.attempt?.viewedSolution === false);

  const reset = await json(`/api/exercises/${exerciseId}/reset`, { method: "POST" });
  check("可以做「再做一次」", reset.status === 200 && reset.body.reset === true);
  // 首次答错时答案已经下发；重做必须被识别为"答案已给出"
  check("重做不再恢复独立完成", reset.body.independent === false, JSON.stringify(reset.body));

  const second = await json("/api/attempts", {
    method: "POST",
    body: JSON.stringify({ exerciseId, answer: 1, idempotencyKey: `real-second-${Date.now()}` }),
  });
  check("重做仍可判分", second.body.graded === true);
  check("重做被标记为答案已下发", second.body.attempt?.viewedSolution === true);
}

const usage = (await json("/api/usage?days=1")).body;
check("用量记录到真实 token", (usage.today?.totalTokens ?? 0) > 0, `today=${JSON.stringify(usage.today ?? {})}`);
check("用量按模型拆分", (usage.byModel?.length ?? 0) >= 1);

const del = await json(`/api/sessions/${session.id}`, { method: "DELETE" });
check("临时会话已删除", del.status === 200);

console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);