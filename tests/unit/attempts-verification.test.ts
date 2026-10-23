import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = path.join(os.tmpdir(), `lumina-attempts-${process.pid}-${Date.now()}`);

import { getDb } from "@/lib/db";
import { createExercise, createSession, ensureConcept, ensureTopic, getConcept } from "@/lib/db/repo";
import { POST } from "@/app/api/attempts/route";

const db = () => getDb();

function submit(exerciseId: string, answer: unknown, key: string) {
  return POST(
    new Request("http://127.0.0.1/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        exerciseId,
        answer,
        usedHint: false,
        viewedSolution: false,
        idempotencyKey: key,
      }),
    }),
  );
}

async function makeExercise(verification: "passed" | "unverified") {
  const topic = ensureTopic("校验测试");
  const concept = ensureConcept({ topicId: topic.id, name: `校验概念-${verification}` });
  const session = createSession({ title: "校验测试" });
  const exercise = createExercise({
    sessionId: session.id,
    conceptId: concept.id,
    type: "single",
    prompt: "选 A",
    options: ["A", "B"],
    answer: { kind: "single", index: 0, options: ["A", "B"] },
    verification,
  });
  return { exercise, concept };
}

beforeAll(() => {
  db();
});

describe("题目校验状态决定是否写入掌握度", () => {
  it("unverified 题目：作答可判分，但不产生证据", async () => {
    const { exercise, concept } = await makeExercise("unverified");
    const res = await submit(exercise.id, 0, "unverified-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { graded: boolean; correct: boolean };
    expect(body.graded).toBe(true);
    expect(body.correct).toBe(true);
    expect(getConcept(concept.id)!.evidenceCount).toBe(0);
    const attempts = db()
      .prepare("select count(*) as n from attempts where exercise_id = ?")
      .get(exercise.id) as { n: number };
    expect(attempts.n).toBe(1);
  });

  it("passed 题目：正常写入证据", async () => {
    const { exercise, concept } = await makeExercise("passed");
    const res = await submit(exercise.id, 0, "passed-1");
    expect(res.status).toBe(200);
    expect(getConcept(concept.id)!.evidenceCount).toBe(1);
  });
});