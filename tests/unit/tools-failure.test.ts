import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = path.join(os.tmpdir(), `lumina-tools-${process.pid}-${Date.now()}`);

import { executeTool, parseToolArgs } from "@/lib/ai/tools";

const ctx = { sessionId: "s_test", messageId: "m_test" };

describe("工具参数容错", () => {
  it("字符串里的裸换行会被修复", () => {
    const raw = '{"title":"对比","columns":["A","B"],"rows":[["第一行\n第二行","x"]]}';
    const args = parseToolArgs(raw) as { rows: string[][] };
    expect(args.rows[0][0]).toBe("第一行\n第二行");
  });

  it("尾逗号与 Markdown 围栏会被修复", () => {
    const raw = '```json\n{"title":"对比","columns":["A","B"],"rows":[["1","2"],],}\n```';
    const args = parseToolArgs(raw) as { columns: string[] };
    expect(args.columns).toEqual(["A", "B"]);
  });

  it("被截断的 JSON 会补全括号", () => {
    const raw = '{"title":"对比","columns":["A","B"],"rows":[["1","2"';
    const args = parseToolArgs(raw) as { rows: string[][] };
    expect(args.rows[0]).toEqual(["1", "2"]);
  });
});

describe("工具失败不再静默", () => {
  it("图表参数不合法：返回具体原因，并给出用户可见提示", async () => {
    const outcome = await executeTool(
      "present_chart",
      JSON.stringify({ title: "资产结构", series: [] }),
      ctx,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.blocks).toHaveLength(0);
    expect(outcome.notice).toBeTruthy();
    expect(outcome.result).toContain("图表数据不合法");
    expect(outcome.result).toContain("series");
  });

  it("表格列数不足：错误里能指出具体字段", async () => {
    const outcome = await executeTool(
      "present_table",
      JSON.stringify({ title: "对比", columns: ["A"], rows: [["1"]] }),
      ctx,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.notice).toBeTruthy();
    // 用户提示不能泄漏 zod 字段名/Schema 细节；细节只回传给模型
    expect(outcome.notice).not.toMatch(/columns|Expected|Required/);
    expect(outcome.result).toContain("columns");
  });

  it("表格每行单元格数必须与列数一致", async () => {
    const outcome = await executeTool(
      "present_table",
      JSON.stringify({ title: "对比", columns: ["A", "B"], rows: [["1", "2", "3"]] }),
      ctx,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.blocks).toHaveLength(0);
    expect(outcome.notice).not.toMatch(/Expected|Required/);
    expect(outcome.result).toContain("列数");
  });

  it("步骤结构不合法：不产生组件，但一定带 notice", async () => {
    const outcome = await executeTool(
      "present_steps",
      JSON.stringify({ title: "流程", steps: [] }),
      ctx,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.notice).toBeTruthy();
  });
});
