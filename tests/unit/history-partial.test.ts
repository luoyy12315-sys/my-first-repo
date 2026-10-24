import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = path.join(os.tmpdir(), `lumina-history-${process.pid}-${Date.now()}`);

import { createSession, addMessage, updateMessage } from "@/lib/db/repo";
import { buildHistory } from "@/lib/ai/prompt";

describe("buildHistory / 未讲完的回答", () => {
  let sessionId = "";

  beforeAll(() => {
    const session = createSession({ mode: "infinite" });
    sessionId = session.id;
    addMessage({ sessionId, role: "user", content: "讲讲资产" });
    const partial = addMessage({
      sessionId,
      role: "assistant",
      content: "资产是……（这里被中断）",
      status: "streaming",
    });
    updateMessage(partial.id, { status: "error", error: "AI_TIMEOUT" });
    addMessage({ sessionId, role: "user", content: "继续" });
  });

  it("已经把内容讲出来的失败回答会进入上下文，并标注未讲完", () => {
    const history = buildHistory(sessionId);
    const partial = history.find((m) => m.content.includes("这里被中断"));
    expect(partial).toBeTruthy();
    expect(partial?.content).toContain("没讲完");
  });

  it("完全为空的失败回答不会污染上下文", () => {
    const session = createSession({ mode: "infinite" });
    const empty = addMessage({ sessionId: session.id, role: "assistant", content: "", status: "streaming" });
    updateMessage(empty.id, { status: "error", error: "AI_NETWORK" });
    addMessage({ sessionId: session.id, role: "user", content: "在吗" });

    const history = buildHistory(session.id);
    expect(history.some((m) => m.content === "（空）")).toBe(false);
    expect(history.at(-1)?.content).toBe("在吗");
  });
});
