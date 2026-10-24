import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { streamChat } from "@/lib/ai/provider";
import type { AiConfig } from "@/lib/ai/config";

/** 最小 OpenAI 兼容流：推理增量 + 正文 + 工具调用 + usage */
function sse(obj: unknown) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

describe("streamChat / reasoning channel", () => {
  let server: http.Server;
  let baseUrl = "";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(
        sse({ choices: [{ delta: { role: "assistant" }, finish_reason: null }] }),
      );
      res.write(sse({ choices: [{ delta: { reasoning_content: "先想资产" }, finish_reason: null }] }));
      res.write(sse({ choices: [{ delta: { reasoning_content: "再想负债" }, finish_reason: null }] }));
      res.write(sse({ choices: [{ delta: { content: "答案" }, finish_reason: null }] }));
      res.write(
        sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    function: { name: "present_chart", arguments: '{"title":' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        }),
      );
      res.write(
        sse({
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: '"示例"}' } }] },
              finish_reason: "tool_calls",
            },
          ],
        }),
      );
      res.write(
        sse({
          choices: [],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 40,
            completion_tokens_details: { reasoning_tokens: 33 },
          },
        }),
      );
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("把 reasoning_content 单独返回，不混进正文", async () => {
    const reasoningChunks: string[] = [];
    const config: AiConfig = {
      id: null,
      label: "test",
      provider: "openai",
      baseUrl,
      apiKey: "test-key",
      model: "test-model",
      temperature: 0.6,
      timeoutMs: 5000,
      maxTokens: 12000,
      source: "env",
    };
    const result = await streamChat({
      config,
      messages: [{ role: "user", content: "画个图" }],
      onReasoning: (d) => reasoningChunks.push(d),
    });

    expect(result.text).toBe("答案");
    expect(result.reasoning).toBe("先想资产再想负债");
    expect(result.reasoningTokens).toBe(33);
    expect(reasoningChunks.join("")).toBe("先想资产再想负债");
    expect(result.usage).toEqual({ promptTokens: 11, completionTokens: 40 });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("present_chart");
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({ title: "示例" });
    expect(result.finishReason).toBe("tool_calls");
  });
});
