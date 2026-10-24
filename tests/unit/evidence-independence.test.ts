/**
 * 学习证据的独立性（审计 P1-1）
 *
 * 旧实现：提交后无条件清空"已看解析/已用提示"标记，且 GET 只要有作答就下发答案。
 * 于是「看解析 → 随便交一次 → 再做一次 → 再交」会被记成"独立正确"，
 * 学习档案失真。这里把关键路径钉成用例。
 */
import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = path.join(os.tmpdir(), `lumina-independence-${process.pid}-${Date.now()}`);

import { getDb } from "@/lib/db";
import {
  createExercise,
  createSession,
  ensureConcept,
  ensureTopic,
  getConcept,
  listAttemptsByExercise,
  listConceptEvidence,
} from "@/lib/db/repo";
import { POST as submitAttempt } from "@/app/api/attempts/route";
import { POST as viewSolution } from "@/app/api/exercises/[id]/solution/route";
import { POST as resetExercise } from "@/app/api/exercises/[id]/reset/route";
import { GET as getExerciseState } from "@/app/api/exercises/[id]/route";

type Ctx = { params: Promise<{ id: string }> };
const ctxOf = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

function makeExercise(label: string) {
  const topic = ensureTopic(`独立性-${label}`);
  const concept = ensureConcept({ topicId: topic.id, name: `独立性-${label}` });
  const session = createSession({ title: `独立性-${label}` });
  const exercise = createExercise({
    sessionId: session.id,
    conceptId: concept.id,
    type: "single",
    prompt: "选 A",
    options: ["A", "B"],
    answer: { kind: "single", index: 0, options: ["A", "B"] },
    verification: "passed",
  });
  return { exercise, concept };
}

function submit(exerciseId: string, answer: unknown, key: string) {
  return submitAttempt(
    new Request("http://127.0.0.1/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exerciseId, answer, usedHint: false, viewedSolution: false, idempotencyKey: key }),
    }),
  );
}

beforeAll(() => {
  getDb();
});

describe("看过解析后的作答不算独立完成", () => {
  it("看解析 → 交对：判对但不写入掌握度", async () => {
    const { exercise, concept } = makeExercise("look");
    await viewSolution(new Request("http://127.0.0.1/x", { method: "POST" }), ctxOf(exercise.id));

    const res = await submit(exercise.id, 0, "look-first");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      graded: boolean;
      correct: boolean;
      attempt: { viewedSolution: boolean };
    };
    expect(body.graded).toBe(true);
    expect(body.correct).toBe(true);
    expect(body.attempt.viewedSolution).toBe(true);

    expect(getConcept(concept.id)!.evidenceCount).toBe(0);
    const evidence = listConceptEvidence(concept.id);
    expect(evidence.length).toBe(1);
    expect(evidence[0].independent).toBe(false);
  });

  it("「再做一次」清标记后仍然不能洗白独立性", async () => {
    const { exercise, concept } = makeExercise("launder");
    // 第一次：正常独立答错（答案已在下发）
    const first = await submit(exercise.id, 1, "launder-1");
    expect(first.status).toBe(200);

    const reset = await resetExercise(new Request("http://127.0.0.1/x", { method: "POST" }), ctxOf(exercise.id));
    expect(reset.status).toBe(200);

    // 第二次：答案早就看过了，即便标记被清空也不算独立
    const second = await submit(exercise.id, 0, "launder-2");
    const body = (await second.json()) as {
      attempt: { viewedSolution: boolean };
      correct: boolean;
    };
    expect(body.correct).toBe(true);
    expect(body.attempt.viewedSolution).toBe(true);

    const attempts = listAttemptsByExercise(exercise.id);
    expect(attempts.length).toBe(2);
    expect(attempts[0].viewedSolution).toBe(false); // 第一次确实是独立作答
    expect(attempts[1].viewedSolution).toBe(true); // 第二次被识别出来
    // 只有第一次（答错）产生证据；第二次不算独立，不推进掌握度
    expect(getConcept(concept.id)!.evidenceCount).toBe(1);
    expect(getConcept(concept.id)!.independentCorrect).toBe(0);
  });

  it("没有提交过就「再做一次」会被拒绝（挡住用提示后洗标记）", async () => {
    const { exercise } = makeExercise("no-submit");
    const res = await resetExercise(new Request("http://127.0.0.1/x", { method: "POST" }), ctxOf(exercise.id));
    expect(res.status).toBe(409);
  });
});

describe("答案下发门槛", () => {
  it("没有判定过的作答时不下发标准答案", async () => {
    const { exercise } = makeExercise("reveal-gate");
    const res = await getExerciseState(new Request("http://127.0.0.1/x"), ctxOf(exercise.id));
    const body = (await res.json()) as {
      attempts: { correctDisplay: string | null }[];
    };
    expect(body.attempts.length).toBe(0);

    // 提交空答案：未判定，仍不下发
    const empty = await submitAttempt(
      new Request("http://127.0.0.1/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exerciseId: exercise.id, answer: "", idempotencyKey: "reveal-empty" }),
      }),
    );
    const emptyBody = (await empty.json()) as { graded: boolean };
    expect(emptyBody.graded).toBe(false);

    const after = await getExerciseState(new Request("http://127.0.0.1/x"), ctxOf(exercise.id));
    const afterBody = (await after.json()) as { attempts: { correctDisplay: string | null }[] };
    expect(afterBody.attempts.length).toBe(1);
    expect(afterBody.attempts[0].correctDisplay).toBeNull();

    // 真正判定后，刷新才看得到答案
    await submit(exercise.id, 0, "reveal-graded");
    const graded = await getExerciseState(new Request("http://127.0.0.1/x"), ctxOf(exercise.id));
    const gradedBody = (await graded.json()) as { attempts: { correctDisplay: string | null }[] };
    expect(gradedBody.attempts.at(-1)!.correctDisplay).toContain("正确答案");
  });
});