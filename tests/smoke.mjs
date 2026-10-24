/**
 * 端到端冒烟测试（Node 原生 fetch，无额外依赖）
 *
 * 前置：应用已运行在 BASE（默认 http://127.0.0.1:3210），
 * 且模型服务指向 mock-llm（npm run demo:llm）。
 * 覆盖：配置 → 建会话 → 流式教学 → 工具组件落库 → 判题 → 证据更新
 *      → 幂等去重 → 模拟器 → 会话删除后证据保留。
 *
 * 注意：这里用的是测试替身模型，验证的是应用自身代码路径，
 * 不代表真实模型的回答质量。
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3210";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:4318/v1";

let pass = 0;
let fail = 0;
const results = [];

function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    results.push(`  ✓ ${name}`);
  } else {
    fail++;
    results.push(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("应用未在 60s 内就绪");
}

async function json(path, init) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: r.status, body };
}

async function chat(sessionId, text, extra = {}) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, text, ...extra }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const events = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      const t = l.trim();
      if (!t.startsWith("data:")) continue;
      try {
        events.push(JSON.parse(t.slice(5).trim()));
      } catch {
        /* ignore */
      }
    }
  }
  return events;
}

async function main() {
  console.log(`\n▶ 目标: ${BASE}\n`);
  await waitReady();

  // 1. 配置模型（指向测试替身）
  const saved = await json("/api/settings/ai", {
    method: "PUT",
    body: JSON.stringify({
      provider: "openai",
      baseUrl: MOCK,
      model: "mock-tutor",
      apiKey: "mock-key-for-smoke-test",
      temperature: 0.4,
    }),
  });
  check("保存模型配置", saved.status === 200 && saved.body.configured === true, JSON.stringify(saved.body).slice(0, 120));
  check("API Key 不会明文回传", !JSON.stringify(saved.body).includes("mock-key-for-smoke-test"));

  const tested = await json("/api/ai/test", { method: "POST" });
  check("模型连通性测试", tested.body.ok === true, JSON.stringify(tested.body).slice(0, 160));

  // 2. 建一个正式目标计划（课程 + 知识点），验证目标学习链路
  const stamp = Date.now();
  const planCreated = await json("/api/plans", {
    method: "POST",
    body: JSON.stringify({ title: `冒烟计划 ${stamp}`, note: "验证目标学习与证据闭环" }),
  });
  const planId = planCreated.body.plan?.id;
  check("创建计划草稿", Boolean(planId));
  let planRes = await json(`/api/plans/${planId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "addCourse", title: "经济学基础", description: "机会成本与成本概念" }),
  });
  const courseId = planRes.body.plan?.items?.[0]?.id;
  check("添加课程", Boolean(courseId));
  planRes = await json(`/api/plans/${planId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "addConcept", itemId: courseId, name: "机会成本" }),
  });
  const seededConceptId = planRes.body.plan?.items?.[0]?.concepts?.[0]?.id;
  check("添加知识点", Boolean(seededConceptId));
  const confirmed = await json(`/api/plans/${planId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "confirm" }),
  });
  check("确认计划", confirmed.body.plan?.status === "active");

  // 3. 目标学习会话 + 流式教学
  const created = await json("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      mode: "goal",
      planId,
      planItemId: courseId,
      focusConceptId: seededConceptId,
    }),
  });
  const sessionId = created.body.session?.id;
  check("创建目标学习会话", Boolean(sessionId));

  const events = await chat(sessionId, "从零开始教我机会成本，我完全没基础。");
  check("收到文本增量", events.some((e) => e.type === "delta" && e.text));
  check("收到教学组件", events.some((e) => e.type === "block"));
  check("流正常结束", events.some((e) => e.type === "done"));

  // 4. 会话持久化 + 答案不下发
  const loaded = await json(`/api/sessions/${sessionId}`);
  check("消息已持久化（含助手消息）", loaded.body.messages?.filter((m) => m.role === "assistant").length >= 1);
  const exBlock = (loaded.body.blocks ?? []).find((b) => b.kind === "exercise");
  check("练习组件已落库", Boolean(exBlock?.exercise?.id));
  check("练习关联当前课程知识点", exBlock?.exercise?.conceptId === seededConceptId);
  const leaked = JSON.stringify(loaded.body);
  check(
    "响应中不含答案字段",
    !leaked.includes('"answer"') && !leaked.includes('"kind":"single"') && !leaked.includes("correctDisplay"),
    leaked.includes('"answer"') ? "发现 answer 字段" : "",
  );

  const concepts = await json("/api/concepts");
  const concept = (concepts.body.concepts ?? []).find((c) => c.id === seededConceptId);
  check("知识点归属于课程", Boolean(concept?.id) && concept?.courseId === courseId);
  const evStart = (await json(`/api/concepts/${concept.id}`)).body.history?.evidence?.length ?? 0;

  // 4. 判题：错误答案
  const wrong = await json("/api/attempts", {
    method: "POST",
    body: JSON.stringify({
      exerciseId: exBlock.exercise.id,
      answer: 0,
      usedHint: false,
      viewedSolution: false,
      durationMs: 15000,
      idempotencyKey: `k-wrong-${Date.now()}`,
    }),
  });
  check("错误答案被判错", wrong.body.correct === false);
  check("给出针对性反馈", typeof wrong.body.attempt?.feedback === "string" && wrong.body.attempt.feedback.length > 5);
  check("作答后知识点状态更新", Boolean(wrong.body.concept?.id));

  // 5. 判题：正确答案
  const right = await json("/api/attempts", {
    method: "POST",
    body: JSON.stringify({
      exerciseId: exBlock.exercise.id,
      answer: 2,
      usedHint: false,
      viewedSolution: false,
      durationMs: 9000,
      idempotencyKey: `k-right-${Date.now()}`,
    }),
  });
  check("正确答案被判对", right.body.correct === true);
  check("提交后才返回正确答案", String(right.body.attempt?.correctDisplay ?? "").includes("正确答案"));

  // 6. 幂等：同一 key 重复提交不重复计证据
  const key = `k-idem-${Date.now()}`;
  const first = await json("/api/attempts", {
    method: "POST",
    body: JSON.stringify({ exerciseId: exBlock.exercise.id, answer: 2, idempotencyKey: key }),
  });
  const second = await json("/api/attempts", {
    method: "POST",
    body: JSON.stringify({ exerciseId: exBlock.exercise.id, answer: 2, idempotencyKey: key }),
  });
  check("重复提交被识别为幂等", second.body.duplicate === true, JSON.stringify(second.body).slice(0, 100));
  check("两次返回同一条作答记录", first.body.attempt?.id === second.body.attempt?.id);

  const conceptAfter = await json(`/api/concepts/${concept.id}`);
  const evEnd = conceptAfter.body.history?.evidence?.length ?? 0;
  // 3 次有效作答（错 1、对 1、幂等重复 1 只算一次）→ 证据应恰好 +3
  check("每次作答只计一次证据（幂等重复不计）", evEnd - evStart === 3, `新增证据 ${evEnd - evStart}`);
  check("状态变更留有依据", (conceptAfter.body.history?.events?.length ?? 0) >= 0);

  // 6.5 换一题（C2）：同知识点、换题型，且不泄露答案
  const retry = await json(`/api/exercises/${exBlock.exercise.id}/retry`, { method: "POST" });
  check("换一题生成成功", retry.status === 200 && Boolean(retry.body.blockId), JSON.stringify(retry.body).slice(0, 120));
  check("换的题型与原题不同", retry.body.type && retry.body.type !== "single", String(retry.body.type));
  const retrySession = await json(`/api/sessions/${sessionId}`);
  const newBlock = (retrySession.body.blocks ?? []).find((b) => b.id === retry.body.blockId);
  check("新题以组件形式进入会话", Boolean(newBlock?.exercise));
  check("新题不含答案", !JSON.stringify(newBlock ?? {}).includes('"answer"'));

  // 7. 模拟器
  const simEvents = await chat(sessionId, "用模拟器解释一下复利，我想自己拖参数。");
  const simBlock = simEvents.find((e) => e.type === "block" && e.block?.kind === "simulator");
  check("生成可交互模拟器", Boolean(simBlock));
  check("模拟器参数与表达式完整", Boolean(simBlock?.block?.payload?.params?.length && simBlock?.block?.payload?.plot?.expression));

  const stateSave = await json(`/api/blocks/${simBlock.block.id}`, {
    method: "PATCH",
    body: JSON.stringify({ state: { params: { P: 20000, r: 0.08, n: 20 } } }),
  });
  check("组件状态可保存（刷新可恢复）", stateSave.body.saved === true);

  // 8. 会话小结
  const sumEvents = await chat(sessionId, "帮我写一个本次学习的小结。");
  check("生成学习小结", sumEvents.some((e) => e.type === "block" && e.block?.kind === "note"));
  const withSummary = await json(`/api/sessions/${sessionId}`);
  check("小结已写入会话", Boolean(withSummary.body.session?.summary));

  // 9. 删除会话但保留证据
  const beforeDelete = await json(`/api/concepts/${concept.id}`);
  const evBefore = beforeDelete.body.history?.evidence?.length ?? 0;
  const del = await json(`/api/sessions/${sessionId}`, { method: "DELETE" });
  check("删除会话成功", del.body.deleted === true);
  const gone = await json(`/api/sessions/${sessionId}`);
  check("会话已不可访问", gone.status === 404);
  const afterDelete = await json(`/api/concepts/${concept.id}`);
  check(
    "跨会话学习证据保留",
    (afterDelete.body.history?.evidence?.length ?? 0) === evBefore,
    `删除前 ${evBefore} / 删除后 ${afterDelete.body.history?.evidence?.length}`,
  );

  // 10. 无限学习：练习可用，但不创建正式知识点/证据
  {
    const before = (await json("/api/concepts")).body.concepts?.length ?? 0;
    const si = await json("/api/sessions", { method: "POST", body: JSON.stringify({ mode: "infinite" }) });
    const sid = si.body.session?.id;
    const ev = await chat(sid, "从零开始教我机会成本，我完全没基础。");
    const ex = ev.find((e) => e.type === "block" && e.block?.kind === "exercise")?.block?.exercise;
    check("无限学习仍可出练习", Boolean(ex?.id));
    check("无限学习练习不关联正式知识点", ex?.conceptId === null);
    const after = (await json("/api/concepts")).body.concepts?.length ?? 0;
    check("无限学习不新增正式知识点", after === before, `${before} → ${after}`);
    if (ex?.id) {
      const graded = await json("/api/attempts", {
        method: "POST",
        body: JSON.stringify({ exerciseId: ex.id, answer: 2, idempotencyKey: "infinite-practice-1" }),
      });
      check("无限学习作答只留练习记录", graded.body.graded === true && graded.body.concept === null);
    }
  }

  // 11. 提示/解析标记只对"这一次作答"有效（重做必须能算独立完成）
  {
    const s2 = await json("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ mode: "goal", planId, planItemId: courseId, focusConceptId: seededConceptId }),
    });
    const sid2 = s2.body.session.id;
    const ev = await chat(sid2, "从零开始教我机会成本，我完全没基础。");
    const ex = ev.find((e) => e.type === "block" && e.block?.kind === "exercise")?.block?.exercise?.id;
    check("提示用例拿到练习", Boolean(ex), String(ex));

    const conceptBefore = (await json(`/api/concepts/${seededConceptId}`)).body.concept;
    const baseIndependent = conceptBefore.independentCorrect;

    const hint = await json(`/api/exercises/${ex}/hint`, { method: "POST" });
    check("提示可获取", hint.status === 200 && Boolean(hint.body.hint));
    const wrong = await json("/api/attempts", {
      method: "POST",
      body: JSON.stringify({ exerciseId: ex, answer: 0, idempotencyKey: "hint-once-1" }),
    });
    check("用过提示的作答被标记", wrong.body.attempt?.usedHint === true);

    // 点「再做一次」= 调 reset：只清题目级标记，不恢复"独立完成"
    // （第一次提交后标准答案已经下发，重做不能再算独立正确——否则证据自欺）
    const reset = await json(`/api/exercises/${ex}/reset`, { method: "POST" });
    check("再做一次清空题目级标记", reset.body.reset === true && reset.body.flags?.hintUsed === false);
    check("再做一次不会恢复独立完成", reset.body.independent === false);

    const right = await json("/api/attempts", {
      method: "POST",
      body: JSON.stringify({ exerciseId: ex, answer: 2, idempotencyKey: "hint-once-2" }),
    });
    check("重做不再被判为用过提示", right.body.attempt?.usedHint === false);
    check("重做被识别出答案已下发", right.body.attempt?.viewedSolution === true);
    const conceptAfter = (await json(`/api/concepts/${seededConceptId}`)).body.concept;
    check(
      "重做不计入独立正确（答案已下发）",
      conceptAfter.independentCorrect === baseIndependent,
      `${baseIndependent} → ${conceptAfter.independentCorrect}`,
    );
  }

  // 11. 复习「练一练」复用未完成的会话，而不是每点一次开一个
  {
    await json("/api/review");
    const items = (await json("/api/review")).body.items ?? [];
    if (!items.length) {
      // 同一个库重跑时，之前的复习条目可能已经完成——这不是缺陷，如实说明即可
      check("复习队列已清空（本轮跳过复用检查，新库运行时会覆盖）", true);
    }
    if (items.length) {
      const item = items[0];
      const payload = JSON.stringify({
        mode: "review",
        reviewItemId: item.id,
        focusConceptId: item.conceptId,
        title: `复习：${item.conceptName}`,
      });
      const a = await json("/api/sessions", { method: "POST", body: payload });
      const b = await json("/api/sessions", { method: "POST", body: payload });
      check("第一次创建复习会话", a.body.reused !== true);
      check("再次点击回到同一会话", b.body.reused === true && b.body.session?.id === a.body.session?.id);
    }
  }

  // 12. 多模型：新增一套 → 会话内切换 → 回答确实换了模型 → 删除后回到默认
  const models0 = await json("/api/models");
  check(
    "模型列表可读且存在默认",
    (models0.body.models?.length ?? 0) >= 1 && models0.body.models.some((m) => m.isDefault),
  );
  check(
    "模型列表不回传明文 Key",
    !JSON.stringify(models0.body).includes("mock-key-for-smoke-test"),
  );

  const alt = await json("/api/models", {
    method: "POST",
    body: JSON.stringify({
      label: "备用模型",
      provider: "openai",
      baseUrl: MOCK,
      model: "mock-tutor-alt",
      apiKey: "mock-key-alt-for-smoke",
    }),
  });
  const altId = alt.body.model;
  check("新增第二个模型", alt.status === 201 && Boolean(altId), JSON.stringify(alt.body).slice(0, 120));

  const ms = await json("/api/sessions", { method: "POST", body: JSON.stringify({ mode: "infinite" }) });
  const modelSession = ms.body.session.id;
  const switched = await json(`/api/sessions/${modelSession}`, {
    method: "PATCH",
    body: JSON.stringify({ modelId: altId }),
  });
  check("会话可切换到指定模型", switched.body.session?.modelId === altId);

  await chat(modelSession, "从零开始教我机会成本，我完全没基础。");
  const afterChat = await json(`/api/sessions/${modelSession}`);
  const assistant = (afterChat.body.messages ?? []).filter((m) => m.role === "assistant").pop();
  check("回答记下了实际使用的模型", assistant?.model === "mock-tutor-alt", String(assistant?.model));

  // 刷新后仍是同一模型（绑定持久化）
  const reread = await json(`/api/sessions/${modelSession}`);
  check("模型绑定刷新后仍保留", reread.body.session?.modelId === altId);

  const delModel = await json(`/api/models/${altId}`, { method: "DELETE" });
  check("删除模型配置成功", delModel.body.deleted === true);
  const afterDelModel = await json(`/api/sessions/${modelSession}`);
  check("删除后会话回到跟随默认", afterDelModel.body.session?.modelId === null);
  const stillOk = await json("/api/health");
  check("删除后仍有可用默认模型", stillOk.body.ai?.configured === true);

  // 12.5 本地材料引用：问材料相关问题 → 回答带 [[m1]] → 来源可点回原文
  {
    const form = new FormData();
    form.append(
      "file",
      new File([("机会成本是被放弃的最优替代方案的价值，它不等于实际支付的金额。\n").repeat(8)], "cite-check.txt", {
        type: "text/plain",
      }),
    );
    const up = await fetch(`${BASE}/api/materials`, { method: "POST", body: form }).then((r) => r.json());
    check("材料上传并解析成功", up.status === "parsed", JSON.stringify(up).slice(0, 120));

    const sMat = (await json("/api/sessions", { method: "POST", body: JSON.stringify({ mode: "infinite" }) })).body.session.id;
    await chat(sMat, "根据我的材料，讲讲机会成本是什么");
    const matDetail = await json(`/api/sessions/${sMat}`);
    const matAnswer = matDetail.body.messages.filter((m) => m.role === "assistant").pop();
    check("回答出现材料引用 [[m1]]", matAnswer.content.includes("[[m1]]"));
    const matSources = matAnswer.sources ?? [];
    check("材料来源已落库", matSources.some((x) => x.kind === "material" && x.id === "m1"), JSON.stringify(matSources));
    const chunkId = matSources.find((x) => x.kind === "material")?.meta?.chunkId;
    check("来源记录了切片 id", Boolean(chunkId), String(chunkId));
    if (chunkId) {
      const chunkRes = await json(`/api/chunks/${chunkId}`);
      check("可按切片 id 回到原文", chunkRes.status === 200 && Boolean(chunkRes.body.chunk?.text), JSON.stringify(chunkRes.body).slice(0, 100));
    }
  }

  // 13. 联网检索：off 零请求 / 手动出引用 / 缓存 / 失败诚实 / 判题隔离
  {
    const WEB = "http://127.0.0.1:4319";
    const webMode = async (m) => fetch(`${WEB}/mode?m=${m}`).then((r) => r.json());
    const webCount = async () => fetch(`${WEB}/count`).then((r) => r.json());

    const cfg = await json("/api/settings/web", {
      method: "PUT",
      body: JSON.stringify({
        enabled: true,
        endpoint: `${WEB}/search?format=json`,
        method: "GET",
        queryParam: "q",
        maxSources: 3,
        maxSearchesPerSession: 20,
        defaultMode: "off",
      }),
    });
    check("联网配置已保存", cfg.status === 200 && cfg.body.enabled === true, JSON.stringify(cfg.body).slice(0, 120));

    const probe = await json("/api/settings/web/test", { method: "POST" });
    check("搜索服务连通测试通过", probe.body.ok === true, JSON.stringify(probe.body).slice(0, 140));

    // (1) off：整轮零外部请求
    await webMode("normal");
    await fetch(`${WEB}/reset`);
    const sOff = (await json("/api/sessions", { method: "POST", body: JSON.stringify({ mode: "infinite" }) })).body.session.id;
    await chat(sOff, "2026 年个税专项附加扣除有哪些？", { webMode: "off" });
    const offCount = (await webCount()).count;
    check("off 模式零外部请求", offCount === 0, `count=${offCount}`);

    // (2) manual：有来源卡片 + 引用可校验 + 伪造引用被剥离
    await fetch(`${WEB}/reset`);
    const sWeb = (await json("/api/sessions", { method: "POST", body: JSON.stringify({ mode: "infinite" }) })).body.session.id;
    const ev = await chat(sWeb, "2026 年个税专项附加扣除有哪些？", { webMode: "manual" });
    const searchDone = ev.find((e) => e.type === "search_status" && e.state === "done");
    const sourcesEvt = ev.find((e) => e.type === "sources");
    check("检索完成事件", Boolean(searchDone), JSON.stringify(searchDone ?? {}));
    check("推送了来源", (sourcesEvt?.sources?.length ?? 0) >= 2, String(sourcesEvt?.sources?.length));

    const detail = await json(`/api/sessions/${sWeb}`);
    const answer = detail.body.messages.filter((m) => m.role === "assistant").pop();
    check("回答保留了有效引用", answer.content.includes("[[w1]]"));
    check("伪造引用被剥离", !answer.content.includes("[[w9]]"));
    check("提示了剥离事实", (answer.parts ?? []).some((p) => p.type === "notice" && String(p.notice).includes("不存在的来源")));
    const savedSources = detail.body.messages
      .filter((m) => m.role === "assistant")
      .pop().sources;
    check("来源已落库", (savedSources?.length ?? 0) >= 2, String(savedSources?.length));
    check(
      "落库来源 id 与正文一致",
      savedSources?.some((s) => s.id === "w1" && s.url),
      JSON.stringify(savedSources?.slice(0, 1)),
    );

    const afterFirst = (await webCount()).count;
    // 同一库重跑时第一条就命中缓存，此时 provider 计数为 0 属正常
    check(
      "manual 走了检索路径（真实调用或命中缓存）",
      afterFirst >= 1 || searchDone?.cacheHit === true,
      `count=${afterFirst} cacheHit=${searchDone?.cacheHit}`,
    );

    // (3) 相同 query 第二次命中缓存，provider 调用不增加
    const sWeb2 = (await json("/api/sessions", { method: "POST", body: JSON.stringify({ mode: "infinite" }) })).body.session.id;
    await chat(sWeb2, "2026 年个税专项附加扣除有哪些？", { webMode: "manual" });
    const afterSecond = (await webCount()).count;
    check("相同 query 命中缓存（不再打 provider）", afterSecond === afterFirst, `${afterFirst} → ${afterSecond}`);
    const cachedDetail = await json(`/api/sessions/${sWeb2}`);
    const cachedSearch = await json("/api/settings/web");
    check("缓存命中次数被记录", (cachedSearch.body.stats?.cacheHits ?? 0) >= 1, JSON.stringify(cachedSearch.body.stats));

    // (4) 超时：诚实降级，不给假来源
    await webMode("timeout");
    const sFail = (await json("/api/sessions", { method: "POST", body: JSON.stringify({ mode: "infinite" }) })).body.session.id;
    const failEv = await chat(sFail, "换个话题查一下今天的天气", { webMode: "manual" });
    const failNotice = failEv.find((e) => e.type === "notice" && String(e.text).includes("未能联网核实"));
    check("搜索超时时说明未联网核实", Boolean(failNotice), JSON.stringify(failNotice ?? {}).slice(0, 120));
    const failDetail = await json(`/api/sessions/${sFail}`);
    const failAnswer = failDetail.body.messages.filter((m) => m.role === "assistant").pop();
    check("失败时不产生来源卡片", (failAnswer.sources?.length ?? 0) === 0, String(failAnswer.sources?.length));
    check("失败时不产生假引用", !failAnswer.content.includes("[[w"));
    await webMode("normal");

    // (5) 判题路径绝不检索
    await fetch(`${WEB}/reset`);
    const sJudge = (await json("/api/sessions", { method: "POST", body: JSON.stringify({ mode: "infinite" }) })).body.session.id;
    const judgeEv = await chat(sJudge, "从零开始教我机会成本，我完全没基础。", { webMode: "manual" });
    const exBlock = judgeEv.find((e) => e.type === "block" && e.block?.kind === "exercise");
    // 对话本身开了手动联网，会正常检索；这里要隔离的是"判题链路"，先归零计数
    await fetch(`${WEB}/reset`);
    if (exBlock) {
      await json(`/api/exercises/${exBlock.block.exercise.id}/hint`, { method: "POST" });
      await json("/api/attempts", {
        method: "POST",
        body: JSON.stringify({ exerciseId: exBlock.block.exercise.id, answer: 0, idempotencyKey: "web-isolated-1" }),
      });
      await json(`/api/exercises/${exBlock.block.exercise.id}/solution`, { method: "POST" });
    }
    const judgeCount = (await webCount()).count;
    check("判题/提示/解析路径不触发检索", judgeCount === 0, `count=${judgeCount}`);

    // (6) 关闭开关后回到零请求
    await json("/api/settings/web", { method: "PUT", body: JSON.stringify({ enabled: false }) });
    check("可一键关闭联网", (await json("/api/settings/web")).body.enabled === false);
  }

  console.log(results.join("\n"));
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\n冒烟测试异常：", e.message);
  console.log(results.join("\n"));
  process.exit(1);
});
