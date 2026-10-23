import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = path.join(os.tmpdir(), `lumina-quiz-${process.pid}-${Date.now()}`);

import { createSession, getBlock, listExercisesByBlockId } from "@/lib/db/repo";
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

describe("多题小测", () => {
  it("一次创建 quiz 块和 3 道题，公开数据不含答案", async () => {
    const session = createSession({ title: "小测测试" });
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

    const serialized = serializeBlock(getBlock(outcome.blocks[0].id)!);
    expect(serialized.quizExercises).toHaveLength(3);
    expect(JSON.stringify(serialized)).not.toContain('"answer"');
    expect(JSON.stringify(serialized)).not.toMatch(/"kind":"(single|judge|blank)"/);
  });

  it("小测第一版拒绝 open 题", async () => {
    const session = createSession({ title: "小测 open 测试" });
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
  it("每道题可以使用不同知识点，并落到各自概念", async () => {
    const session = createSession({ title: "混合小测" });
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
});
