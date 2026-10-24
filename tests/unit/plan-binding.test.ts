import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = path.join(os.tmpdir(), `lumina-plan-bind-${process.pid}-${Date.now()}`);

import { getDb } from "@/lib/db";
import {
  addConceptToCourse,
  confirmPlan,
  createPlan,
  createSession,
  getConcept,
  getPlan,
  getSession,
  listConcepts,
  listPlans,
  removeConceptFromCourse,
  syncPlanItemCompletion,
} from "@/lib/db/repo";
import { executeTool } from "@/lib/ai/tools";

const tool = (name: string, args: unknown, sessionId: string) =>
  executeTool(name, JSON.stringify(args), { sessionId, messageId: "m_test" });

beforeAll(() => {
  getDb();
});

describe("目标学习：计划草稿 → 课程 → 知识点", () => {
  it("save_plan 生成待确认草稿并绑定规划会话，同名草稿追加课程", async () => {
    const session = createSession({ title: "规划会话", mode: "goal" });
    const outcome = await tool(
      "save_plan",
      {
        title: "导数系统学习",
        goal: "掌握导数定义与求导",
        courses: [
          {
            title: "极限与连续",
            description: "导数的前置",
            concepts: [{ name: "数列极限" }, { name: "函数连续" }],
          },
        ],
      },
      session.id,
    );
    expect(outcome.ok).toBe(true);

    const plan = listPlans().find((p) => p.title === "导数系统学习")!;
    expect(plan.status).toBe("draft");
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].concepts.map((c) => c.name)).toEqual(["数列极限", "函数连续"]);
    expect(plan.items[0].concepts[0]).toMatchObject({ status: "untouched", displayStatus: "todo" });
    expect(getSession(session.id)?.planId).toBe(plan.id);
    expect(getSession(session.id)?.planItemId).toBeNull();

    await tool(
      "save_plan",
      {
        title: "导数系统学习",
        courses: [{ title: "求导法则", concepts: [{ name: "链式法则" }] }],
      },
      session.id,
    );
    const updated = listPlans().find((p) => p.title === "导数系统学习")!;
    expect(updated.items.map((i) => i.title)).toEqual(["极限与连续", "求导法则"]);
    expect(listPlans().filter((p) => p.title === "导数系统学习")).toHaveLength(1);
  });

  it("确认后课程进度按知识点掌握数计算，不再使用 3 个概念的旧阈值", () => {
    const plan = createPlan({
      title: "进度测试",
      status: "active",
      courses: [
        {
          title: "导数基础",
          concepts: [{ name: "导数定义" }, { name: "求导法则" }],
        },
      ],
    });
    const course = plan.items[0];
    const session = createSession({
      title: "导数课程",
      mode: "goal",
      planId: plan.id,
      planItemId: course.id,
    });

    expect(getPlan(plan.id)?.progress).toMatchObject({
      conceptsMastered: 0,
      conceptsTotal: 2,
      percent: 0,
      coursesDone: 0,
      coursesTotal: 1,
    });
    expect(getPlan(plan.id)?.items[0].status).toBe("pending");

    getDb().prepare("update concepts set status = 'mastered' where id = ?").run(course.concepts[0].id);
    const partial = syncPlanItemCompletion(session.id);
    expect(partial).toMatchObject({ mastered: 1, total: 2, completed: false });
    expect(getPlan(plan.id)?.items[0].status).toBe("in_progress");
    expect(getPlan(plan.id)?.progress.percent).toBe(50);

    getDb().prepare("update concepts set status = 'mastered' where id = ?").run(course.concepts[1].id);
    const done = syncPlanItemCompletion(session.id);
    expect(done).toMatchObject({ mastered: 2, total: 2, completed: true });
    expect(getPlan(plan.id)?.items[0].status).toBe("done");
    expect(getPlan(plan.id)?.progress).toMatchObject({
      percent: 100,
      coursesDone: 1,
      coursesTotal: 1,
    });
  });

  it("空课程不计入完成率；添加知识点后才进入统计", () => {
    const plan = createPlan({
      title: "空课程测试",
      status: "active",
      courses: [{ title: "待配置课程", concepts: [] }],
    });
    expect(getPlan(plan.id)?.progress).toMatchObject({
      conceptsTotal: 0,
      percent: 0,
      unconfiguredCourses: 1,
    });
    expect(getPlan(plan.id)?.items[0].unconfigured).toBe(true);

    const result = addConceptToCourse(plan.id, plan.items[0].id, { name: "待学习知识点" });
    expect(result.conflict).toBe(false);
    expect(result.plan?.items[0].progress).toMatchObject({ mastered: 0, total: 1 });
    expect(result.plan?.progress.unconfiguredCourses).toBe(0);
  });

  it("一个知识点只能归属一门课程；移除后保留档案", () => {
    const first = createPlan({
      title: "课程 A",
      status: "active",
      courses: [{ title: "A-1", concepts: [{ name: "共享知识点" }] }],
    });
    const second = createPlan({
      title: "课程 B",
      status: "active",
      courses: [{ title: "B-1", concepts: [] }],
    });
    const conflict = addConceptToCourse(second.id, second.items[0].id, { name: "共享知识点" });
    expect(conflict.conflict).toBe(true);

    const conceptId = first.items[0].concepts[0].id;
    const removed = removeConceptFromCourse(first.id, conceptId);
    expect(removed?.items[0].concepts).toHaveLength(0);
    const concept = getConcept(conceptId);
    expect(concept?.name).toBe("共享知识点");
    expect(concept?.courseId).toBeNull();
    // 没有课程归属的知识点会显示为待整理，而不是被删除
    expect(listConcepts().some((c) => c.id === conceptId)).toBe(true);
  });

  it("save_concepts 只关联课程已有知识点，不临场扩目录", async () => {
    const plan = createPlan({
      title: "课程结构保护",
      status: "active",
      courses: [{ title: "第一课", concepts: [{ name: "课程内知识点" }] }],
    });
    const course = plan.items[0];
    const session = createSession({
      title: "结构保护会话",
      mode: "goal",
      planId: plan.id,
      planItemId: course.id,
    });
    const outcome = await tool(
      "save_concepts",
      { topic: "任意主题", concepts: [{ name: "课程内知识点" }, { name: "课程外新知识点" }] },
      session.id,
    );
    expect(outcome.ok).toBe(true);
    expect(getPlan(plan.id)?.items[0].concepts.map((c) => c.name)).toEqual(["课程内知识点"]);
    expect(listConcepts().some((c) => c.name === "课程外新知识点")).toBe(false);
    expect(getConcept(course.concepts[0].id)?.introducedAt).toBeTruthy();
    expect(outcome.notice).toContain("不在当前课程");
  });

  it("确认计划需要有课程和知识点", () => {
    const empty = createPlan({ title: "空计划", status: "draft", courses: [] });
    expect(confirmPlan(empty.id)?.status).toBe("draft");

    const plan = createPlan({
      title: "可确认计划",
      status: "draft",
      courses: [{ title: "第一课", concepts: [{ name: "第一点" }] }],
    });
    expect(confirmPlan(plan.id)?.status).toBe("active");
    expect(getSession(createSession({ mode: "goal" }).id)?.mode).toBe("goal");
  });
});

describe("无限学习不写正式档案", () => {
  it("save_concepts 与 present_exercise 不创建概念、不产生掌握度证据", async () => {
    const session = createSession({ title: "无限学习", mode: "infinite" });
    const before = listConcepts().length;

    const saved = await tool(
      "save_concepts",
      { topic: "不应写入", concepts: [{ name: "无限学习临时概念" }] },
      session.id,
    );
    expect(saved.ok).toBe(true);
    expect(listConcepts().length).toBe(before);

    const exercise = await tool(
      "present_exercise",
      {
        concept: "也不应写入",
        type: "judge",
        prompt: "这是一道对话练习。",
        answer: "true",
      },
      session.id,
    );
    expect(exercise.ok).toBe(true);
    expect(listConcepts().length).toBe(before);
  });
});
