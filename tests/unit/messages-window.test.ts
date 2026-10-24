/**
 * 会话消息窗口（审计 P1-4）
 *
 * 旧实现 `order by seq asc limit 200` 取的是**最旧**的 200 条：
 * 约 100 轮后新消息在页面上"消失"，模型历史也永远停在第 187–200 条。
 * 现在默认取最新 200 条，并支持 before=<seq> 向前翻页。
 */
import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = path.join(os.tmpdir(), `lumina-messages-${process.pid}-${Date.now()}`);

import { addMessage, createSession, listMessages } from "@/lib/db/repo";
import { GET as getSession } from "@/app/api/sessions/[id]/route";

const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });

function seed(count: number) {
  const session = createSession({ mode: "infinite" });
  for (let i = 1; i <= count; i += 1) {
    addMessage({
      sessionId: session.id,
      role: i % 2 === 1 ? "user" : "assistant",
      content: `m${i}`,
    });
  }
  return session.id;
}

describe("长会话不再丢新消息", () => {
  it("250 条消息：默认返回最新 200 条，且按 seq 升序", () => {
    const id = seed(250);
    const messages = listMessages(id);
    expect(messages.length).toBe(200);
    expect(messages[0].content).toBe("m51");
    expect(messages.at(-1)!.content).toBe("m250");
    // 升序、无重复
    for (let i = 1; i < messages.length; i += 1) {
      expect(messages[i].seq).toBeGreaterThan(messages[i - 1].seq);
    }
  });

  it("before=<seq> 可以取到更早的一批", () => {
    const id = seed(250);
    const older = listMessages(id, 50, { beforeSeq: 51 });
    expect(older.length).toBe(50);
    expect(older[0].content).toBe("m1");
    expect(older.at(-1)!.content).toBe("m50");
  });

  it("会话接口返回分页信息，hasMore 表示还有更早的消息", async () => {
    const id = seed(250);
    const res = await getSession(new Request(`http://127.0.0.1/api/sessions/${id}`), ctxOf(id));
    const body = (await res.json()) as {
      messages: { content: string }[];
      paging: { limit: number; oldestSeq: number | null; newestSeq: number | null; hasMore: boolean };
    };
    expect(res.status).toBe(200);
    expect(body.messages.length).toBe(200);
    expect(body.messages.at(-1)!.content).toBe("m250");
    expect(body.paging.newestSeq).toBe(250);
    expect(body.paging.oldestSeq).toBe(51);
    expect(body.paging.hasMore).toBe(true);
  });
});