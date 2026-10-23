import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = path.join(os.tmpdir(), `lumina-plan-bind-${process.pid}-${Date.now()}`);

import { getDb, uid } from "@/lib/db";
import {
  createPlan,
  createSession,
  ensureConcept,
  ensureTopic,
  getPlan,
  getSession,
  listPlans,
  PLAN_STEP_REQUIRED_CONCEPTS,
  setSessionPlanItem,
  syncPlanItemCompletion,
} from "@/lib/db/repo";
import { executeTool } from "@/lib/ai/tools";

const tool = (name: string, args: unknown, sessionId: string) =>
  executeTool(name, JSON.stringify(args), { sessionId, messageId: "m_test" });

beforeAll(() => {
  getDb();
});

describe("计划步骤绑定知识点", () => {
  it("save_plan 写入 conceptId；重复生成时给老步骤补绑定", async () => {
    const session = createSession({ title: "计划绑定" });

    await tool(
      "save_plan",
      { title: "绑定测试路线", items: [{ title: "第一步", rationale: "先学" }] },
      session.id,
    );
    const first = listPlans().find((p) => p.title === "绑定测试路线")!;
    expect(first.items[0].conceptId).toBeNull();

    // 只为已经存在的知识点建立绑定，不为未来课程预建空壳
    const topic = ensureTopic("绑定测试主题");
    const concept = ensureConcept({ topicId: topic.id, name: "机会成本" });
    await tool(
      "save_plan",
      { title: "绑定测试路线", items: [{ title: "第一步", concept: "机会成本" }] },
      session.id,
    );
    const second = listPlans().find((p) => p.title === "绑定测试路线")!;
    expect(second.items[0].conceptId).toBe(concept.id);
    expect(second.items[0].conceptName).toBe("机会成本");

    await tool(
      "save_plan",
      { title: "未绑定测试路线", items: [{ title: "未来步骤", concept: "尚不存在的概念" }] },
      session.id,
    );
    const third = listPlans().find((p) => p.title === "未绑定测试路线")!;
    expect(third.items[0].conceptId).toBeNull();
  });

  it("会话可绑定具体计划步骤，并能在读回时保留", () => {
    const plan = createPlan({
      title: "会话步骤绑定测试",
      items: [{ title: "第一步" }, { title: "第二步" }],
    });
    const session = createSession({
      title: "绑定会话",
      planId: plan.id,
      planItemId: plan.items[0].id,
    });
    expect(getSession(session.id)?.planItemId).toBe(plan.items[0].id);

    setSessionPlanItem(session.id, plan.items[1].id);
    expect(getSession(session.id)?.planItemId).toBe(plan.items[1].id);

    setSessionPlanItem(session.id, null);
    expect(getSession(session.id)?.planItemId ?? null).toBeNull();
  });

  it("本步至少 3 个不同知识点独立答对才自动完成", () => {
    const plan = createPlan({
      title: "证据完成测试",
      items: [{ title: "需要验证的步骤" }],
    });
    const session = createSession({
      title: "证据会话",
      planId: plan.id,
      planItemId: plan.items[0].id,
    });
    const topic = ensureTopic("证据完成主题");
    const conceptIds = ["证据点 A", "证据点 B", "证据点 C"].map(
      (name) => ensureConcept({ topicId: topic.id, name }).id,
    );
    const insert = getDb().prepare(
      "insert into evidence (id, session_id, concept_id, kind, correct, independent, hint_used, weight, created_at) values (?, ?, ?, 'attempt', 1, 1, 0, 1, ?)",
    );
    const add = (conceptId: string) =>
      insert.run(uid("ev_"), session.id, conceptId, Date.now());

    add(conceptIds[0]);
    add(conceptIds[1]);
    const partial = syncPlanItemCompletion(session.id);
    expect(partial).toMatchObject({ verified: 2, required: PLAN_STEP_REQUIRED_CONCEPTS, completed: false });
    expect(getPlan(plan.id)?.items[0].status).toBe("in_progress");

    add(conceptIds[2]);
    const done = syncPlanItemCompletion(session.id);
    expect(done).toMatchObject({ verified: 3, required: PLAN_STEP_REQUIRED_CONCEPTS, completed: true });
    expect(getPlan(plan.id)?.items[0].status).toBe("done");
    expect(getPlan(plan.id)?.items[0].verifiedConceptNames).toEqual([
      "证据点 A",
      "证据点 B",
      "证据点 C",
    ]);
  });
});