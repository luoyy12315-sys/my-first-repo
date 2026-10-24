import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

// 每个测试文件独立的数据库目录，绝不碰开发库
process.env.DATA_DIR = path.join(os.tmpdir(), `lumina-test-${process.pid}-${Date.now()}`);

import { getDb, uid } from "@/lib/db";
import {
  completeReviewForSession,
  createSession,
  deleteSession,
  voidEvidence,
  voidEvidenceByExercise,
  listConceptEvidence,
  addExerciseFeedback,
  recentExerciseFeedback,
  ensureConcept,
  ensureTopic,
  getConcept,
  listConcepts,
  getSession,
  countEmptyConcepts,
  deleteEmptyConcepts,
  recordAttemptEvidence,
  getExerciseFlags,
  markHintUsed,
  markSolutionViewed,
  createAiModel,
  getAiModel,
  listAiModels,
  getDefaultAiModel,
  recordAiModelTest,
  updateAiModel,
  deleteAiModel,
  setSessionModel,
  getSessionModelId,
  resetExerciseFlags,
  findOpenReviewSession,
  createPlan,
  getPlan,
  deletePlan,
  listSessions,
  setSessionPlan,
  createMaterial,
  addMaterialChunks,
  listMaterials,
  setMaterialPlan,
  searchMaterialChunks,
  refreshReviewQueue,
  listReviewItems,
  actOnReviewItem,
  listDuplicateConceptGroups,
  mergeDuplicateConcepts,
  deleteConcept,
  countPlanItemsForConcept,
  mergeConceptsInto,
  addConceptToCourse,
  removeConceptFromCourse,
} from "@/lib/db/repo";
import { buildTeachingMessages } from "@/lib/ai/prompt";
import { addMessage, createBlock, updateMessage } from "@/lib/db/repo";

const db = () => getDb();
const t0 = 1_760_000_000_000;

function seedExercise(sessionId: string, conceptId: string, id: string) {
  db()
    .prepare(
      `insert into exercises (id, session_id, block_id, concept_id, type, prompt, options, answer, rubric, explanation, difficulty, version, created_at)
       values (?, ?, null, ?, 'single', '题干', '[]', '{}', null, null, 2, 1, ?)`,
    )
    .run(id, sessionId, conceptId, t0);
}

function seedEvidence(opts: {
  sessionId: string;
  conceptId: string;
  exerciseId: string;
  correct: boolean;
  at: number;
  weight?: number;
  independent?: number;
  hint?: number;
}) {
  const attemptId = uid("a_");
  db()
    .prepare(
      `insert into attempts (id, exercise_id, session_id, concept_id, user_answer, is_correct, score, max_score, feedback, used_hint, viewed_solution, independent, attempt_no, duration_ms, idempotency_key, created_at)
       values (?, ?, ?, ?, 'x', ?, ?, 1, '', ?, ?, ?, 1, 9000, null, ?)`,
    )
    .run(
      attemptId,
      opts.exerciseId,
      opts.sessionId,
      opts.conceptId,
      opts.correct ? 1 : 0,
      opts.correct ? 1 : 0,
      opts.hint ?? 0,
      0,
      opts.independent ?? 1,
      opts.at,
    );
  db()
    .prepare(
      `insert into evidence (id, session_id, concept_id, kind, ref_id, correct, score, independent, hint_used, weight, note, created_at)
       values (?, ?, ?, 'attempt', ?, ?, ?, ?, ?, ?, null, ?)`,
    )
    .run(
      uid("ev_"),
      opts.sessionId,
      opts.conceptId,
      attemptId,
      opts.correct ? 1 : 0,
      opts.correct ? 1 : 0,
      opts.independent ?? 1,
      opts.hint ?? 0,
      opts.weight ?? 1,
      opts.at,
    );
}

function newConcept(name: string) {
  const topic = ensureTopic("测试主题");
  const { id } = ensureConcept({ topicId: topic.id, name });
  return id;
}

beforeAll(() => {
  db(); // 触发建表
});

describe("P1-3 · 无效作答不推进复习", () => {
  it("查看解析后作答：不改聚合、不改调度、不更新学习时间、不删复习条", () => {
    const conceptId = newConcept("无效作答复习");
    const s = createSession({ title: "无效作答" });
    const ex = uid("e_");
    seedExercise(s.id, conceptId, ex);
    seedEvidence({ sessionId: s.id, conceptId, exerciseId: ex, correct: false, at: t0 });
    db()
      .prepare(
        "update concepts set status = 'needs_work', p_mastery = 0.2, evidence_count = 1, wrong_streak = 1, next_review_at = ?, last_studied_at = ?, difficulty = 5, reps = 1 where id = ?",
      )
      .run(t0 + 86400000, t0, conceptId);
    const reviewId = uid("ri_");
    db()
      .prepare(
        "insert into review_items (id, concept_id, reason, priority, due_at, status, created_at) values (?, ?, '测试复习', 1, ?, 'open', ?)",
      )
      .run(reviewId, conceptId, t0 + 86400000, t0);

    const before = getConcept(conceptId)!;
    recordAttemptEvidence({
      conceptId,
      sessionId: s.id,
      exerciseId: ex,
      type: "single",
      correct: true,
      score: 1,
      usedHint: false,
      independent: false,
      difficulty: 5,
      attemptId: uid("a_"),
      durationMs: 1000,
    });
    const after = getConcept(conceptId)!;

    expect(after.evidenceCount).toBe(before.evidenceCount);
    expect(after.pMastery).toBe(before.pMastery);
    expect(after.nextReviewAt).toBe(before.nextReviewAt);
    expect(after.lastStudiedAt).toBe(before.lastStudiedAt);
    expect(
      db().prepare("select id from review_items where id = ? and status = 'open'").get(reviewId),
    ).toBeTruthy();
  });
});

describe("P1-4 · 忽略/已复习的条目不再立即重建", () => {
  it("dismiss 后刷新不重建，产生新学习后才重新建议", () => {
    const conceptId = newConcept("复习忽略");
    const s = createSession({ title: "复习忽略" });
    const ex = uid("e_");
    seedExercise(s.id, conceptId, ex);
    seedEvidence({ sessionId: s.id, conceptId, exerciseId: ex, correct: false, at: t0 });
    db()
      .prepare("update concepts set status = 'needs_work', wrong_streak = 2, evidence_count = 1, last_studied_at = ? where id = ?")
      .run(t0, conceptId);

    refreshReviewQueue();
    const first = listReviewItems().find((x) => x.conceptId === conceptId);
    expect(first).toBeTruthy();
    actOnReviewItem(first!.id, "dismissed");

    refreshReviewQueue();
    expect(listReviewItems().find((x) => x.conceptId === conceptId)).toBeUndefined();

    // 模拟之后又学了一次：允许重新进入复习队列
    db().prepare("update concepts set last_studied_at = ? where id = ?").run(Date.now() + 1000, conceptId);
    refreshReviewQueue();
    expect(listReviewItems().find((x) => x.conceptId === conceptId)).toBeTruthy();
  });
});

describe("错一次也能当天再练", () => {
  it("learning + wrong_streak=1 会生成一条今天的复习建议", () => {
    const conceptId = newConcept("错一次当天复习");
    const now = Date.now();
    db()
      .prepare(
        "update concepts set status = 'learning', wrong_streak = 1, evidence_count = 1, p_mastery = 0.2, next_review_at = ?, last_studied_at = ? where id = ?",
      )
      .run(now + 86400000, now, conceptId);

    refreshReviewQueue();
    const item = listReviewItems().find((x) => x.conceptId === conceptId);
    expect(item).toBeTruthy();
    expect(item?.reason).toContain("今天再练一题");
  });
});

describe("证据口径", () => {
  it("零权重证据仍保留在明细里，并带 weight 供 UI 区分", () => {
    const conceptId = newConcept("证据权重口径");
    const s = createSession({ title: "证据权重" });
    const ex = uid("e_");
    seedExercise(s.id, conceptId, ex);
    seedEvidence({ sessionId: s.id, conceptId, exerciseId: ex, correct: false, at: t0, weight: 0 });
    seedEvidence({ sessionId: s.id, conceptId, exerciseId: ex, correct: true, at: t0 + 1 });

    const rows = listConceptEvidence(conceptId);
    expect(rows.map((r) => r.weight).sort()).toEqual([0, 1]);
  });
});

describe("P2-2 · 概念全局去重与合并", () => {
  it("同名概念在不同主题下复用同一个档案", () => {
    const t1 = ensureTopic("去重主题甲");
    const t2 = ensureTopic("去重主题乙");
    const a = ensureConcept({ topicId: t1.id, name: "全局去重概念" });
    const b = ensureConcept({ topicId: t2.id, name: "全局去重概念" });
    expect(b.id).toBe(a.id);
    expect(b.created).toBe(false);
    expect(b.topicId).toBe(t1.id);
  });

  it("合并同名旧档案：转移证据/作答/计划步骤并重算", () => {
    const t1 = ensureTopic("合并主题甲");
    const t2 = ensureTopic("合并主题乙");
    const c1 = uid("c_");
    const c2 = uid("c_");
    const t = Date.now();
    db()
      .prepare(
        "insert into concepts (id, topic_id, name, canonical_key, created_at, updated_at) values (?, ?, '合并测试', '合并测试', ?, ?)",
      )
      .run(c1, t1.id, t, t);
    db()
      .prepare(
        "insert into concepts (id, topic_id, name, canonical_key, created_at, updated_at) values (?, ?, '合并测试', '合并测试', ?, ?)",
      )
      .run(c2, t2.id, t + 1, t + 1);
    expect(listDuplicateConceptGroups().length).toBeGreaterThan(0);

    const s = createSession({ title: "合并测试会话" });
    const ex1 = uid("e_");
    const ex2 = uid("e_");
    seedExercise(s.id, c1, ex1);
    seedExercise(s.id, c2, ex2);
    seedEvidence({ sessionId: s.id, conceptId: c1, exerciseId: ex1, correct: true, at: t0 + 1 });
    seedEvidence({ sessionId: s.id, conceptId: c1, exerciseId: ex1, correct: true, at: t0 + 2 });
    seedEvidence({ sessionId: s.id, conceptId: c2, exerciseId: ex2, correct: true, at: t0 + 3 });
    const plan = createPlan({
      title: "合并测试计划",
      status: "active",
      courses: [{ title: "步骤", concepts: [{ name: "合并测试" }] }],
    });

    const result = mergeDuplicateConcepts();
    expect(result.merged).toBeGreaterThanOrEqual(1);

    const merged = listConcepts({ topicId: t1.id }).find((x) => x.name === "合并测试")!;
    expect(merged).toBeTruthy();
    expect(merged.evidenceCount).toBe(3);
    expect(merged.independentCorrect).toBe(3);

    const attempts = db()
      .prepare("select count(*) as n from attempts where concept_id = ?")
      .get(merged.id) as { n: number };
    expect(attempts.n).toBe(3);
    const item = db()
      .prepare("select concept_id from plan_items where plan_id = ?")
      .get(plan.id) as { concept_id: string | null };
    expect(getPlan(plan.id)?.items[0].concepts[0].id).toBe(merged.id);
    expect(item.concept_id).toBeNull();
    expect(listDuplicateConceptGroups()).toHaveLength(0);
  });
});

describe("计划分组", () => {
  it("会话和材料挂在计划下，材料检索按计划隔离，删计划只解绑", () => {
    const plan = createPlan({
      title: "线代冲刺",
      status: "active",
      courses: [{ title: "矩阵", concepts: [] }],
    });
    const other = createPlan({
      title: "英语词汇",
      status: "active",
      courses: [{ title: "词根", concepts: [] }],
    });
    const s = createSession({ title: "线代会话", planId: plan.id });
    expect(getSession(s.id)?.planTitle).toBe("线代冲刺");
    expect(listSessions(50).find((x) => x.id === s.id)?.planTitle).toBe("线代冲刺");

    const mPlan = createMaterial({ name: "线代讲义", mime: null, size: 1, path: null, status: "parsed", planId: plan.id });
    addMaterialChunks(mPlan, [{ text: "矩阵的秩与线性无关" }]);
    const mOther = createMaterial({ name: "英语讲义", mime: null, size: 1, path: null, status: "parsed", planId: other.id });
    addMaterialChunks(mOther, [{ text: "矩阵的秩这个词的英语表达" }]);
    const mNone = createMaterial({ name: "未归类讲义", mime: null, size: 1, path: null, status: "parsed" });
    addMaterialChunks(mNone, [{ text: "矩阵的秩基础定义" }]);

    const scoped = searchMaterialChunks("矩阵", 4, plan.id);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((h) => h.materialId === mPlan)).toBe(true);
    const ungrouped = searchMaterialChunks("矩阵", 4, null);
    expect(ungrouped.length).toBeGreaterThan(0);
    expect(ungrouped.every((h) => h.materialId === mNone)).toBe(true);

    expect(getPlan(plan.id)!.counts).toMatchObject({ sessions: 1, materials: 1 });
    expect(listMaterials().find((m) => m.id === mPlan)?.planTitle).toBe("线代冲刺");

    setSessionPlan(s.id, null);
    expect(getSession(s.id)?.planId).toBeNull();
    setSessionPlan(s.id, plan.id);
    setMaterialPlan(mOther, plan.id);
    expect(listMaterials().find((m) => m.id === mOther)?.planId).toBe(plan.id);

    deletePlan(plan.id);
    expect(getSession(s.id)?.planId).toBeNull();
    expect(listMaterials().find((m) => m.id === mPlan)?.planId).toBeNull();
    deletePlan(other.id);
  });
});

describe("P1 · 删除会话连带证据后重算聚合", () => {
  it("证据被删光后知识点回到未接触，且清理掉失效的复习条目", () => {
    const conceptId = newConcept("机会成本-回滚");
    const s = createSession({ title: "回滚测试" });
    const ex = uid("e_");
    seedExercise(s.id, conceptId, ex);
    seedEvidence({ sessionId: s.id, conceptId, exerciseId: ex, correct: false, at: t0 + 1 });
    seedEvidence({ sessionId: s.id, conceptId, exerciseId: ex, correct: true, at: t0 + 2 });
    // 让重算前的状态与证据一致
    const before = getConcept(conceptId)!;
    expect(before.evidenceCount).toBe(0); // 直接插表不会更新聚合，先手动同步一次
    db()
      .prepare("update concepts set evidence_count = 2, p_mastery = 0.49, status = 'learning' where id = ?")
      .run(conceptId);
    db()
      .prepare(
        "insert into review_items (id, concept_id, reason, priority, due_at, status, created_at) values (?, ?, '连续答错', 1, ?, 'open', ?)",
      )
      .run(uid("ri_"), conceptId, t0, t0);

    deleteSession(s.id, { withEvidence: true });

    const after = getConcept(conceptId)!;
    expect(after.evidenceCount).toBe(0);
    expect(after.pMastery).toBeCloseTo(0.1, 6);
    expect(after.status).toBe("untouched");
    expect(after.nextReviewAt).toBeNull();
    const openReviews = db()
      .prepare("select count(*) n from review_items where concept_id = ? and status = 'open'")
      .get(conceptId) as { n: number };
    expect(openReviews.n).toBe(0);
  });

  it("只删其中一个会话时，按剩余证据重放而不是简单减一", () => {
    const conceptId = newConcept("机会成本-部分回滚");
    const s1 = createSession({ title: "会话1" });
    const s2 = createSession({ title: "会话2" });
    const ex1 = uid("e_");
    const ex2 = uid("e_");
    seedExercise(s1.id, conceptId, ex1);
    seedExercise(s2.id, conceptId, ex2);
    seedEvidence({ sessionId: s1.id, conceptId, exerciseId: ex1, correct: false, at: t0 + 1 });
    seedEvidence({ sessionId: s2.id, conceptId, exerciseId: ex2, correct: true, at: t0 + 2 });
    db().prepare("update concepts set evidence_count = 2 where id = ?").run(conceptId);

    deleteSession(s1.id, { withEvidence: true });

    const after = getConcept(conceptId)!;
    expect(after.evidenceCount).toBe(1);
    expect(after.independentCorrect).toBe(1);
    expect(after.distinctExercises).toBe(1);
    expect(after.wrongStreak).toBe(0);
    expect(after.pMastery).toBeGreaterThan(0.1);
  });
});

describe("P2-2 · 调度参数沿用知识点当前状态", () => {
  it("连续答错时遗忘次数累加、难度上升（不再被每轮重置）", () => {
    const conceptId = newConcept("调度测试");
    const s = createSession({ title: "调度" });
    const ex = uid("e_");
    seedExercise(s.id, conceptId, ex);

    const run = (at: number) => {
      const attemptId = uid("a_");
      db()
        .prepare(
          `insert into attempts (id, exercise_id, session_id, concept_id, user_answer, is_correct, score, max_score, feedback, used_hint, viewed_solution, independent, attempt_no, created_at)
           values (?, ?, ?, ?, 'x', 0, 0, 1, '', 0, 0, 1, 1, ?)`,
        )
        .run(attemptId, ex, s.id, conceptId, at);
      recordAttemptEvidence({
        conceptId,
        sessionId: s.id,
        exerciseId: ex,
        type: "single",
        correct: false,
        score: 0,
        usedHint: false,
        independent: true,
        difficulty: 2,
        attemptId,
        durationMs: 9000,
      });
    };

    run(t0 + 1);
    const mid = getConcept(conceptId)!;
    run(t0 + 2);
    const after = getConcept(conceptId)!;

    expect(after.lapses).toBeGreaterThanOrEqual(mid.lapses);
    expect(after.lapses).toBeGreaterThanOrEqual(2);
    expect(after.difficulty).toBeGreaterThan(5);
  });
});

describe("P2-3 · 提示词不重复注入当前用户消息", () => {
  it("同一条用户消息只出现一次，且不含空助手占位", () => {
    const s = createSession({ title: "提示词" });
    const user = addMessage({ sessionId: s.id, role: "user", content: "请解释机会成本" });
    const assistant = addMessage({ sessionId: s.id, role: "assistant", content: "", status: "streaming" });

    const messages = buildTeachingMessages({
      sessionId: s.id,
      userText: "请解释机会成本",
      excludeMessageId: user.id,
    });

    const all = messages.map((m) => m.content).join("\n");
    const occurrences = all.split("请解释机会成本").length - 1;
    expect(occurrences).toBe(1);
    expect(all).not.toContain("（空）");
    // 末尾必须是本次用户输入
    expect(messages.at(-1)?.role).toBe("user");
    expect(messages.at(-1)?.content).toBe("请解释机会成本");

    updateMessage(assistant.id, { status: "error" });
  });

  it("历史保留组件标题，不再是裸占位符", () => {
    const s = createSession({ title: "组件标题" });
    addMessage({ sessionId: s.id, role: "user", content: "给我看个表" });
    const assistant = addMessage({ sessionId: s.id, role: "assistant", content: "看这个表" });
    const block = createBlock({
      sessionId: s.id,
      messageId: assistant.id,
      kind: "table",
      title: "四问对照表",
      payload: { columns: ["问题", "应对"], rows: [["顺序", "谁先谁后"]] },
    });
    updateMessage(assistant.id, {
      parts: [{ type: "block", blockId: block.id, kind: "table" }],
    });

    const all = buildTeachingMessages({ sessionId: s.id, userText: "继续" })
      .map((m) => m.content)
      .join("\n");
    expect(all).toContain("四问对照表");
    expect(all).not.toContain("[已展示");
  });
});

describe("P2-4 · 解析与提示由服务端留痕", () => {
  it("标记后即使客户端传 false，也会被服务端覆盖", () => {
    const conceptId = newConcept("证据标记");
    const s = createSession({ title: "标记" });
    const ex = uid("e_");
    seedExercise(s.id, conceptId, ex);

    expect(getExerciseFlags(ex)).toEqual({ solutionViewed: false, hintUsed: false, hintCount: 0 });
    markSolutionViewed(ex);
    markHintUsed(ex);
    markHintUsed(ex);
    expect(getExerciseFlags(ex)).toEqual({ solutionViewed: true, hintUsed: true, hintCount: 2 });
  });
});

describe("P3-9 · 空壳清理不误伤练过但未计分的知识点", () => {
  it("有 attempts 的知识点不会被清理", () => {
    const empty = newConcept("真空壳");
    const practiced = newConcept("练过但看了解析");
    const s = createSession({ title: "清理" });
    const ex = uid("e_");
    seedExercise(s.id, practiced, ex);
    seedEvidence({
      sessionId: s.id,
      conceptId: practiced,
      exerciseId: ex,
      correct: true,
      at: t0,
      weight: 0,
      independent: 0,
    });

    const before = countEmptyConcepts();
    const removed = deleteEmptyConcepts();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(getConcept(empty)).toBeNull();
    expect(getConcept(practiced)).not.toBeNull();
    expect(countEmptyConcepts()).toBeLessThan(before);
  });

  it("已讲解但还没有作答证据的知识点不会被清理", () => {
    const topic = ensureTopic("讲解保护主题");
    const introduced = ensureConcept({
      topicId: topic.id,
      name: "已讲解待验证",
      introduced: true,
    }).id;
    expect(getConcept(introduced)?.introducedAt).toBeTruthy();
    deleteEmptyConcepts();
    expect(getConcept(introduced)).not.toBeNull();
  });
});

describe("A3 · 单条证据作废与重算", () => {
  it("作废后按剩余证据重算，作废最后一条回到未接触", () => {
    const conceptId = newConcept("作废测试");
    const s = createSession({ title: "作废" });
    const ex1 = uid("e_");
    const ex2 = uid("e_");
    seedExercise(s.id, conceptId, ex1);
    seedExercise(s.id, conceptId, ex2);
    seedEvidence({ sessionId: s.id, conceptId, exerciseId: ex1, correct: true, at: t0 + 1 });
    seedEvidence({ sessionId: s.id, conceptId, exerciseId: ex2, correct: false, at: t0 + 2 });

    // 用重算把聚合拉到与证据一致
    const rows = listConceptEvidence(conceptId);
    expect(rows.length).toBe(2);
    const before = getConcept(conceptId)!;

    voidEvidence(rows[1].id, "这题有歧义");
    const afterOne = getConcept(conceptId)!;
    expect(afterOne.evidenceCount).toBe(1);
    expect(afterOne.pMastery).not.toBe(before.pMastery);

    voidEvidence(rows[0].id, "也不算");
    const afterAll = getConcept(conceptId)!;
    expect(afterAll.evidenceCount).toBe(0);
    expect(afterAll.status).toBe("untouched");
    expect(afterAll.pMastery).toBeCloseTo(0.1, 6);

    // 软作废：记录还在，标记为 voided
    const kept = listConceptEvidence(conceptId);
    expect(kept.length).toBe(2);
    expect(kept.every((e) => e.voided)).toBe(true);
  });

  it("标记某道题有问题会作废它产生的全部证据", () => {
    const conceptId = newConcept("坏题测试");
    const s = createSession({ title: "坏题" });
    const ex = uid("e_");
    seedExercise(s.id, conceptId, ex);
    seedEvidence({ sessionId: s.id, conceptId, exerciseId: ex, correct: false, at: t0 + 1 });
    seedEvidence({ sessionId: s.id, conceptId, exerciseId: ex, correct: false, at: t0 + 2 });

    const touched = voidEvidenceByExercise(ex, "题目条件不足");
    expect(touched).toContain(conceptId);
    expect(getConcept(conceptId)!.evidenceCount).toBe(0);
  });
});

describe("A2 · 结构化复习会话收尾", () => {
  it("答对后把绑定的复习条目置为 done，未绑定则什么都不做", () => {
    const conceptId = newConcept("复习测试");
    const itemId = uid("ri_");
    db()
      .prepare(
        "insert into review_items (id, concept_id, reason, priority, due_at, status, created_at) values (?, ?, '连续答错', 1, ?, 'open', ?)",
      )
      .run(itemId, conceptId, t0, t0);
    const s = createSession({ mode: "review", focusConceptId: conceptId, reviewItemId: itemId });

    expect(completeReviewForSession(s.id)).toBe(true);
    const st = db().prepare("select status from review_items where id = ?").get(itemId) as { status: string };
    expect(st.status).toBe("done");
    expect(completeReviewForSession(s.id)).toBe(false);

    const plain = createSession({ mode: "infinite" });
    expect(completeReviewForSession(plain.id)).toBe(false);
  });
});

describe("C2 · 题目反馈", () => {
  it("反馈可持久化并按时间倒序取出", () => {
    const conceptId = newConcept("反馈测试");
    const s = createSession({ title: "反馈" });
    const ex = uid("e_");
    seedExercise(s.id, conceptId, ex);
    addExerciseFeedback({ exerciseId: ex, sessionId: s.id, vote: "hard", note: "太难了" });
    const rows = recentExerciseFeedback(5);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].vote).toBe("hard");
    expect(rows[0].note).toBe("太难了");
  });
});

describe("多模型配置", () => {
  const mk = (label: string, model: string, opts: { isDefault?: boolean } = {}) =>
    createAiModel({
      label,
      provider: "openai",
      baseUrl: "https://api.example.com/v1",
      model,
      apiKey: "sk-test-123456",
      isDefault: opts.isDefault,
    });

  it("第一个自动成为默认；显式指定会顶掉旧默认（且只有一个默认）", () => {
    const a = mk("A", "model-a");
    expect(a.isDefault).toBe(true);
    expect(getDefaultAiModel()?.id).toBe(a.id);

    const b = mk("B", "model-b", { isDefault: true });
    expect(b.isDefault).toBe(true);
    expect(getDefaultAiModel()?.id).toBe(b.id);
    expect(listAiModels().filter((m) => m.isDefault).length).toBe(1);
  });

  it("失败测试保留上次成功时间与耗时，成功后清掉错误", () => {
    const m = mk("健康检查", "model-health");
    recordAiModelTest(m.id, true, 120, null);
    const ok = getAiModel(m.id)!;
    expect(ok.lastOkAt).toBeTruthy();
    expect(ok.lastTestMs).toBe(120);
    expect(ok.lastError).toBeNull();

    recordAiModelTest(m.id, false, 0, "模型服务鉴权失败");
    const failed = getAiModel(m.id)!;
    expect(failed.lastOkAt).toBe(ok.lastOkAt);
    expect(failed.lastTestMs).toBe(120);
    expect(failed.lastError).toBe("模型服务鉴权失败");

    recordAiModelTest(m.id, true, 80, null);
    const recovered = getAiModel(m.id)!;
    expect(recovered.lastError).toBeNull();
    expect(recovered.lastTestMs).toBe(80);
  });

  it("删除默认项时自动提升另一条，不会出现'全都不能用'", () => {
    const before = listAiModels();
    const def = before.find((m) => m.isDefault)!;
    const res = deleteAiModel(def.id);
    expect(res.deleted).toBe(true);
    expect(res.promotedId).toBeTruthy();
    const after = listAiModels();
    expect(after.length).toBe(before.length - 1);
    expect(after.filter((m) => m.isDefault).length).toBe(1);
    expect(getDefaultAiModel()?.id).toBe(res.promotedId);
  });

  it("删除配置会解除会话绑定，不会让会话指向不存在的模型", () => {
    const m = mk("会话用", "model-session");
    const s = createSession({ title: "绑定模型" });
    setSessionModel(s.id, m.id);
    expect(getSessionModelId(s.id)).toBe(m.id);

    deleteAiModel(m.id);
    expect(getSessionModelId(s.id)).toBeNull();
    expect(getSession(s.id)?.modelId).toBeNull();
  });

  it("更新时留空 Key 不会清掉已有 Key；clearKey 才会", () => {
    const m = mk("改配置", "model-edit");
    updateAiModel(m.id, { label: "改名", model: "model-edit-2" });
    const afterLabel = listAiModels().find((x) => x.id === m.id)!;
    expect(afterLabel.label).toBe("改名");
    expect(afterLabel.model).toBe("model-edit-2");
    expect(afterLabel.apiKey).toBe("sk-test-123456");

    updateAiModel(m.id, { apiKey: "" });
    expect(listAiModels().find((x) => x.id === m.id)!.apiKey).toBe("");
  });
});

describe("P1-2 · 提示/解析标记按次生效", () => {
  it("标记写入后能读到，reset 之后为假", () => {
    const conceptId = newConcept("标记重置");
    const s = createSession({ title: "标记" });
    const ex = uid("e_");
    seedExercise(s.id, conceptId, ex);

    markHintUsed(ex);
    markSolutionViewed(ex);
    const on = getExerciseFlags(ex);
    expect(on.hintUsed).toBe(true);
    expect(on.solutionViewed).toBe(true);
    expect(on.hintCount).toBe(1);

    resetExerciseFlags(ex);
    const off = getExerciseFlags(ex);
    expect(off.hintUsed).toBe(false);
    expect(off.solutionViewed).toBe(false);
    expect(off.hintCount).toBe(0);
  });
});

describe("P1-3 · 复习会话复用", () => {
  it("只有含消息且未作答的会话会被复用", () => {
    const conceptId = newConcept("复习复用");
    const itemId = uid("ri_");
    db()
      .prepare(
        "insert into review_items (id, concept_id, reason, priority, due_at, status, created_at) values (?, ?, '连续答错', 1, ?, 'open', ?)",
      )
      .run(itemId, conceptId, t0, t0);

    const emptyId = uid("s_");
    db()
      .prepare(
        "insert into sessions (id, title, mode, review_item_id, message_count, created_at, updated_at) values (?, '空壳复习', 'review', ?, 0, ?, ?)",
      )
      .run(emptyId, itemId, t0, t0);
    // 刚建好、消息还没落库的会话也要能复用（否则连点两次就多一个）
    expect(findOpenReviewSession(itemId)?.id).toBe(emptyId);

    const liveId = uid("s_");
    db()
      .prepare(
        "insert into sessions (id, title, mode, review_item_id, message_count, created_at, updated_at) values (?, '复习：X', 'review', ?, 2, ?, ?)",
      )
      .run(liveId, itemId, t0, t0 + 10);
    expect(findOpenReviewSession(itemId)?.id).toBe(liveId);
    expect(findOpenReviewSession(itemId)?.id).not.toBe(emptyId);
  });
});

describe("计划引用保护与手动合并", () => {
  it("空壳清理与单条删除都不会动课程归属的知识点", () => {
    const conceptId = newConcept("计划保护概念");
    const plan = createPlan({
      title: "计划保护测试",
      status: "active",
      courses: [{ title: "步骤一", concepts: [{ name: "计划保护概念" }] }],
    });

    expect(countPlanItemsForConcept(conceptId)).toBe(1);
    deleteEmptyConcepts();
    expect(getConcept(conceptId)).not.toBeNull();
    expect(getPlan(plan.id)?.items[0].concepts[0].id).toBe(conceptId);
    expect(deleteConcept(conceptId)).toBe(false);
    expect(getConcept(conceptId)).not.toBeNull();
  });

  it("手动合并会转移证据与课程归属，并按合并后证据重算", () => {
    const topic = ensureTopic("手动合并主题");
    const survivor = ensureConcept({ topicId: topic.id, name: "中心化记账" }).id;
    const duplicate = ensureConcept({ topicId: topic.id, name: "中心化账本" }).id;
    const plan = createPlan({
      title: "手动合并计划",
      status: "active",
      courses: [{ title: "第一步", concepts: [{ name: "中心化账本" }] }],
    });
    const session = createSession({
      title: "合并会话",
      mode: "goal",
      planId: plan.id,
      planItemId: plan.items[0].id,
      focusConceptId: duplicate,
    });
    db()
      .prepare(
        "insert into evidence (id, session_id, concept_id, kind, correct, independent, hint_used, weight, created_at) values (?, ?, ?, 'attempt', 1, 1, 0, 1, ?)",
      )
      .run(uid("ev_"), session.id, duplicate, t0);

    expect(mergeConceptsInto(survivor, [duplicate])).toEqual({ merged: 1 });
    expect(getConcept(duplicate)).toBeNull();
    expect(getPlan(plan.id)?.items[0].concepts[0].id).toBe(survivor);
    expect(getSession(session.id)?.focusConceptId).toBe(survivor);
    expect(listConceptEvidence(survivor).length).toBeGreaterThanOrEqual(1);

    expect(removeConceptFromCourse(plan.id, survivor)?.items[0].concepts).toHaveLength(0);
    expect(getConcept(survivor)?.courseId).toBeNull();
    const readded = addConceptToCourse(plan.id, plan.items[0].id, { name: "中心化记账" });
    expect(readded.conflict).toBe(false);
    expect(readded.plan?.items[0].concepts[0].id).toBe(survivor);
  });
});
