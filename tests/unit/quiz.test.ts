import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = path.join(os.tmpdir(), `lumina-quiz-${process.pid}-${Date.now()}`);

import { createPlan, createSession, getBlock, listConcepts, listExercisesByBlockId } from "@/lib/db/repo";
import { executeTool } from "@/lib/ai/tools";
import { serializeBlock } from "@/lib/api/serialize";

const quiz = {
  title: "机会成本 3 题小测",
  concept: "机会成本",
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
      type: "judge",
      prompt: "机会成本一定等于账面支出。",
      answer: "false",
      explanation: "机会成本不等于账面支出。",
    },
    {
      type: "blank",
      prompt: "机会成本 = 被放弃的【____】替代方案的价值。",
      answer: "最优|最好",
      explanation: "最优替代方案才是机会成本。",
    },
  ],
};

function goalSession(concepts: string[]) {
  const plan = createPlan({
    title: `小测课程 ${Math.random()}`,
    status: "active",
    courses: [{ title: "机会成本", concepts: concepts.map((name) => ({ name })) }],
  });
  const course = plan.items[0];
  const session = createSession({
    title: "小测测试",
    mode: "goal",
    planId: plan.id,
    planItemId: course.id,
  });
  return { plan, course, session };
}

describe("多题小测 · 目标学习", () => {
  it("一次创建 quiz 块和 3 道题，公开数据不含答案", async () => {
    const { course, session } = goalSession(["机会成本"]);
    const outcome = await executeTool("present_quiz", JSON.stringify(quiz), {
      sessionId: session.id,
      messageId: "m_quiz",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.blocks).toHaveLength(1);
    expect(outcome.blocks[0].kind).toBe("quiz");

    const exercises = listExercisesByBlockId(outcome.blocks[0].id);
    expect(exercises).toHaveLength(3);
    expect(exercises.map((e) => e.type)).toEqual(["single", "judge", "blank"]);
    expect(exercises.every((e) => e.conceptId === course.concepts[0].id)).toBe(true);

    const serialized = serializeBlock(getBlock(outcome.blocks[0].id)!);
    expect(serialized.quizExercises).toHaveLength(3);
    expect(JSON.stringify(serialized)).not.toContain('"answer"');
    expect(JSON.stringify(serialized)).not.toMatch(/"kind":"(single|judge|blank)"/);
  });

  it("小测第一版拒绝 open 题", async () => {
    const { session } = goalSession(["机会成本"]);
    const outcome = await executeTool(
      "present_quiz",
      JSON.stringify({
        title: "不支持的小测",
        concept: "机会成本",
        questions: [
          { type: "open", prompt: "解释机会成本", answer: "..." },
          { type: "judge", prompt: "机会成本等于账面成本", answer: "false" },
        ],
      }),
      { sessionId: session.id, messageId: "m_quiz_open" },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.blocks).toHaveLength(0);
    expect(outcome.notice).toContain("确定性题型");
  });
});

describe("多知识点混合小测", () => {
  it("每道题可以落到课程里的不同知识点", async () => {
    const { session } = goalSession(["混合小测概念 A", "混合小测概念 B", "混合小测概念 C"]);
    const outcome = await executeTool(
      "present_quiz",
      JSON.stringify({
        title: "机会成本相关概念混合小测",
        questions: [
          {
            concept: "混合小测概念 A",
            type: "single",
            prompt: "A 的定义？",
            options: ["错", "对"],
            answer: "1",
          },
          {
            concept: "混合小测概念 B",
            type: "judge",
            prompt: "B 的说法成立。",
            answer: "true",
          },
          {
            concept: "混合小测概念 C",
            type: "blank",
            prompt: "C = 【____】",
            answer: "丙",
          },
        ],
      }),
      { sessionId: session.id, messageId: "m_quiz_mixed" },
    );
    expect(outcome.ok).toBe(true);
    const exercises = listExercisesByBlockId(outcome.blocks[0].id);
    expect(exercises).toHaveLength(3);
    expect(new Set(exercises.map((e) => e.conceptId)).size).toBe(3);
    expect(new Set(exercises.map((e) => e.conceptName))).toEqual(
      new Set(["混合小测概念 A", "混合小测概念 B", "混合小测概念 C"]),
    );
  });

  it("无限学习中的小测不创建知识点、也不关联档案", async () => {
    const session = createSession({ title: "无限小测", mode: "infinite" });
    const before = listConcepts().length;
    const outcome = await executeTool(
      "present_quiz",
      JSON.stringify({
        title: "对话小测",
        questions: [
          {
            concept: "临时概念 A",
            type: "judge",
            prompt: "说法一。",
            answer: "true",
          },
          {
            concept: "临时概念 B",
            type: "judge",
            prompt: "说法二。",
            answer: "false",
          },
        ],
      }),
      { sessionId: session.id, messageId: "m_quiz_infinite" },
    );
    expect(outcome.ok).toBe(true);
    const exercises = listExercisesByBlockId(outcome.blocks[0].id);
    expect(exercises.every((e) => e.conceptId === null)).toBe(true);
    expect(listConcepts().length).toBe(before);
    expect(outcome.notice).toContain("无限学习");
  });

  it("目标学习中点了课程外知识点时，题目不计入课程进度", async () => {
    const { session } = goalSession(["课程内知识点"]);
    const outcome = await executeTool(
      "present_quiz",
      JSON.stringify({
        title: "课程外知识点小测",
        questions: [
          {
            concept: "课程外知识点",
            type: "judge",
            prompt: "课程外的说法。",
            answer: "true",
          },
          {
            type: "judge",
            prompt: "不指定知识点的说法。",
            answer: "false",
          },
        ],
      }),
      { sessionId: session.id, messageId: "m_quiz_outside" },
    );
    expect(outcome.ok).toBe(true);
    const exercises = listExercisesByBlockId(outcome.blocks[0].id);
    expect(exercises[0].conceptId).toBeNull();
    // 没有点名时回退到课程的下一个知识点
    expect(exercises[1].conceptId).toBeTruthy();
    expect(outcome.notice).toContain("未关联课程知识点");
  });
});
