/**
 * 本地测试替身模型（OpenAI 兼容 SSE）
 *
 * ⚠️ 这不是 AI。它是确定性的规则回放，只用于验证「流式传输 → 工具调用 →
 * 组件落库 → 判题 → 证据更新」这条真实代码路径是否通畅。
 * 应用界面不会假装它是真实模型；设置页也会明确标注。
 *
 * 用法：node tests/mock-llm-server.mjs   （默认 127.0.0.1:4318）
 * 然后在设置页填 Base URL: http://127.0.0.1:4318/v1  模型名任意，Key 任意。
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT ?? 4318);

const EXERCISE = {
  concept: "机会成本",
  topic: "经济学基础",
  type: "single",
  prompt:
    "你手里有 100 元，可以买一张电影票（带来效用 120 元），也可以买一本教材（带来效用 150 元）。**机会成本**是多少？",
  options: ["100 元", "120 元", "150 元"],
  answer: "2",
  hint: "机会成本衡量的是「放弃掉的那个最优选项的价值」，不是花掉的钱。",
  explanation:
    "机会成本 = 放弃的最优替代方案的价值。这里放弃的是教材带来的 150 元效用，所以是 150 元（选 C）。\n\n注意它不等于账面支出 100 元。",
  difficulty: 2,
};

const SIMULATOR = {
  title: "复利：时间到底有多值钱",
  description: "拖动本金、年利率和年数，观察终值怎么变。重点看「年数」这一项的影响。",
  params: [
    { key: "P", label: "本金", min: 1000, max: 100000, step: 1000, default: 10000, unit: "元" },
    { key: "r", label: "年利率", min: 0.01, max: 0.2, step: 0.01, default: 0.07 },
    { key: "n", label: "年数", min: 1, max: 40, step: 1, default: 10 },
  ],
  outputs: [
    { key: "fv", label: "终值", expression: "P * (1 + r) ^ n", unit: "元", digits: 0 },
    { key: "profit", label: "利息总额", expression: "P * (1 + r) ^ n - P", unit: "元", digits: 0 },
  ],
  plot: { xKey: "n", expression: "P * (1 + r) ^ n", xLabel: "年数", yLabel: "终值（元）" },
  insight: "曲线是凸的：同样的利率，后期每一年的增量都大于前期。这就是复利被叫做「时间的朋友」的原因。",
};

function pickScenario(text) {
  if (/坏公式|latex|katex/i.test(text)) return "latex";
  if (/小测|测验|一套题|quiz/i.test(text)) return "quiz";
  if (/学习路线|学习计划|roadmap/i.test(text)) return "plan";
  if (/小结|总结|summary/i.test(text)) return "summary";
  if (/复利|模拟器|拖动|参数/.test(text)) return "simulator";
  return "concept";
}

function plan(text) {
  const scenario = pickScenario(text);
  if (scenario === "plan") {
    return {
      text: "给你一条四周的路线，先看看顺序合不合理。",
      calls: [
        {
          name: "save_plan",
          args: {
            title: "四周搞定导数",
            goal: "能独立做高考难度的导数题",
            courses: [
              {
                title: "极限与连续",
                description: "导数的前置",
                concepts: [{ name: "数列极限" }, { name: "函数连续" }],
              },
              {
                title: "导数定义与几何意义",
                concepts: [{ name: "导数定义" }, { name: "切线斜率" }],
              },
              {
                title: "求导法则",
                concepts: [{ name: "基本求导公式" }, { name: "链式法则" }],
              },
              {
                title: "单调性与极值",
                concepts: [{ name: "单调区间" }, { name: "极值判定" }],
              },
            ],
          },
        },
      ],
    };
  }
  if (scenario === "latex") {
    return {
      text:
        "先看几个边角情况：未闭合的行内公式 $\\frac{1}{$ ，未知命令 $\\notacommand{x}$ ，以及流式中途被截断的 $$\\begin{aligned} x &= 1 \\\\ y &= 2 \\end{aligned}$$ 。页面不该因此挂掉。",
      calls: [],
    };
  }
  if (scenario === "quiz") {
    return {
      text: "先做一组 3 题小测，覆盖定义、判断和计算，看看你是真的理解还是只是记住了关键词。",
      calls: [
        {
          name: "present_quiz",
          args: {
            title: "机会成本 3 题小测",
            concept: "测试机会成本",
            topic: "经济学基础",
            questions: [
              {
                type: "single",
                prompt: "机会成本衡量的是什么？",
                options: ["实际支付的金额", "被放弃的最优替代方案的价值", "未来的收益"],
                answer: "1",
                explanation: "机会成本 = 被放弃的最优替代方案的价值。",
              },
              {
                concept: "测试账面成本",
                type: "single",
                prompt: "你花 100 元买电影票，这 100 元在会计上属于什么？",
                options: ["机会成本", "账面成本", "沉没成本"],
                answer: "1",
                explanation: "已经支付、记在账上的金额是账面成本。",
              },
              {
                concept: "测试沉没成本",
                type: "single",
                prompt: "已经花掉、无法收回的钱属于什么？",
                options: ["机会成本", "账面成本", "沉没成本"],
                answer: "2",
                explanation: "已经发生且无法收回的成本是沉没成本，不应影响当下决策。",
              },
            ],
          },
        },
      ],
    };
  }
  if (scenario === "summary") {
    return {
      text:
        "我把这次真实发生的内容整理成了小结。注意：里面的进展只写你实际做过的部分。",
      calls: [
        {
          name: "write_summary",
          args: {
            headline: "理解了机会成本的计算口径",
            covered: ["机会成本的定义", "与账面成本的区别"],
            progress: ["在单选题中独立选对了一次"],
            needsWork: ["边界情形：多选项同时可选时的比较"],
            nextSteps: ["用两道不同情境的题验证是否能迁移"],
            resumeHint: "从「多选项比较」这一类题继续",
          },
        },
      ],
    };
  }
  if (scenario === "simulator") {
    return {
      text:
        "先别急着记公式——你自己拖一下「年数」，看看终值的曲线是什么形状。\n\n我把它做成了一个可调参数的模拟器，重点观察曲线的弯曲方向。",
      calls: [
        { name: "save_concepts", args: { topic: "复利与货币时间价值", topicDescription: "复利、终值、现值的计算与直觉", concepts: [{ name: "复利终值" }, { name: "指数增长", prerequisites: ["复利终值"] }] } },
        { name: "open_simulator", args: SIMULATOR },
      ],
    };
  }
  return {
    text:
      "机会成本最容易错的地方，是把它和「花掉的钱」混为一谈。\n\n**机会成本 = 你放弃掉的那个最优选项的价值**。它不一定等于你支付的金额。\n\n先做一道题，我看看你是卡在定义上，还是卡在比较上。",
    calls: [
      {
        name: "save_concepts",
        args: {
          topic: "经济学基础",
          topicDescription: "稀缺性、机会成本、边际思维",
          concepts: [{ name: "机会成本" }, { name: "账面成本", prerequisites: ["机会成本"] }],
        },
      },
      { name: "present_exercise", args: EXERCISE },
    ],
  };
}

function chunk(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function sse(res, body) {
  // JSON 模式（换一题 / 评阅 / 题目二次校验等结构化任务）
  if (body.response_format && body.response_format.type === "json_object") {
    const systemText = (body.messages ?? [])
      .filter((m) => m.role === "system")
      .map((m) => String(m.content ?? ""))
      .join("\n");
    const obj = systemText.includes("独立的题目审校员")
      ? { verdict: "pass", problems: [], note: "" }
      : {
          type: "blank",
          prompt: "填空：机会成本等于被放弃的【____】替代方案的价值。",
          answer: "最优|最好",
          hint: "想想你放弃掉的那些选项里，哪个最值钱。",
          explanation: "机会成本衡量的是放弃掉的最优替代方案的价值，而不是账面支出。",
          difficulty: 2,
        };
    const text = JSON.stringify(obj);
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" });
    const chunks = text.match(/.{1,20}/gs) ?? [text];
    for (const c of chunks) {
      res.write(chunk({ choices: [{ index: 0, delta: { content: c }, finish_reason: null }] }));
    }
    res.write(chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }));
    res.write(chunk({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 40 } }));
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }
  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
  const text = String(lastUser?.content ?? "");
  const { text: baseAnswer, calls } = plan(text);

  // 有来源注入时，按真实行为标注引用（外加一个伪造 id，用来验证服务端会剥离它）
  const context = (body.messages ?? [])
    .map((m) => String(m.content ?? ""))
    .join("\n");
  let answer = baseAnswer;
  if (context.includes("【网络来源")) {
    answer =
      "先看已查证到的信息：2026 年专项附加扣除包含七项，标准按年度公布，具体以官网为准[[w1]]。\n\n" +
      "另外统计口径显示上半年居民收入同比增长，但转载版本常滞后，核对后再引用[[w2]]。\n\n" +
      "这段没有来源支持，属于我的通用知识，标一个不存在的来源测试剥离：[[w9]]";
  } else if (context.includes("【本地材料")) {
    answer = "你的材料里明确写了这一点[[m1]]，我按材料口径解释如下……（其余属于通用知识，不标引用）";
  }
  const useTools = Array.isArray(body.tools) && body.tools.length > 0 && calls.length > 0;
  const chosen = useTools ? calls : [];

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  const pieces = answer.match(/.{1,12}/gs) ?? [answer];
  let i = 0;
  const tick = () => {
    if (i < pieces.length) {
      res.write(
        chunk({
          id: "chatcmpl-mock",
          object: "chat.completion.chunk",
          model: body.model ?? "mock-tutor",
          choices: [{ index: 0, delta: { content: pieces[i] }, finish_reason: null }],
        }),
      );
      i++;
      setTimeout(tick, 8);
      return;
    }

    let ci = 0;
    const nextCall = () => {
      if (ci < chosen.length) {
        const c = chosen[ci];
        const json = JSON.stringify(c.args);
        const head = json.slice(0, 12);
        const rest = json.slice(12);
        res.write(
          chunk({
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: ci,
                      id: `call_mock_${ci}`,
                      type: "function",
                      function: { name: c.name, arguments: "" },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          }),
        );
        res.write(
          chunk({
            choices: [
              { index: 0, delta: { tool_calls: [{ index: ci, function: { arguments: head } }] }, finish_reason: null },
            ],
          }),
        );
        res.write(
          chunk({
            choices: [
              { index: 0, delta: { tool_calls: [{ index: ci, function: { arguments: rest } }] }, finish_reason: null },
            ],
          }),
        );
        ci++;
        setTimeout(nextCall, 10);
        return;
      }
      res.write(chunk({ choices: [{ index: 0, delta: {}, finish_reason: chosen.length ? "tool_calls" : "stop" }] }));
      res.write(
        chunk({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 } }),
      );
      res.write("data: [DONE]\n\n");
      res.end();
    };
    setTimeout(nextCall, 8);
  };
  tick();
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url?.startsWith("/v1/models")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "mock-tutor", object: "model" }] }));
    return;
  }
  if (req.method === "POST" && req.url?.includes("/chat/completions")) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400).end("bad json");
        return;
      }
      sse(res, body);
    });
    return;
  }
  res.writeHead(404).end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-llm] 测试替身模型已启动: http://127.0.0.1:${PORT}/v1  (不是真实 AI，仅用于流程验证)`);
});
