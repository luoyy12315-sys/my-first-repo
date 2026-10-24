import { describe, expect, it } from "vitest";
import { applyTemplate, extractRows, getByPath, mapRow } from "@/lib/web/provider";

/**
 * 通用 HTTP 搜索接口的解析逻辑：
 * 这是"不绑定服务商"方案里最容易出错的部分——路径取不到、字段名不对，
 * 都会表现成"接口配好了却一条结果都没有"，所以单独测。
 */
describe("占位符与路径取值", () => {
  it("替换已知占位符，未知的保持原样", () => {
    expect(applyTemplate('{"q":"{{query}}","n":{{maxResults}}}', { query: "人工智能", maxResults: "5" })).toBe(
      '{"q":"人工智能","n":5}',
    );
    expect(applyTemplate("{{unknown}}", {})).toBe("");
  });

  it("支持点号路径与数组下标", () => {
    const payload = { data: { items: [{ title: "a" }, { title: "b" }] } };
    expect(getByPath(payload, "data.items[1].title")).toBe("b");
    expect(getByPath(payload, "data.items.0.title")).toBe("a");
    expect(getByPath(payload, "data.missing.x")).toBeUndefined();
  });
});

describe("结果数组提取", () => {
  const rows = [{ title: "t1", url: "https://a.example/1" }];

  it("顶层就是数组时直接用", () => {
    expect(extractRows(rows, "")).toEqual(rows);
  });

  it("指定路径优先于自动识别", () => {
    expect(extractRows({ results: rows, web: { results: [] } }, "results")).toEqual(rows);
    expect(extractRows({ results: rows }, "web.results")).toEqual([]);
  });

  it("未指定路径时按常见位置自动识别", () => {
    expect(extractRows({ results: rows }, "")).toEqual(rows);
    expect(extractRows({ data: { results: rows } }, "")).toEqual(rows);
    expect(extractRows({ web: { results: rows } }, "")).toEqual(rows);
    expect(extractRows({ hits: rows }, "")).toEqual(rows);
  });

  it("都找不到就返回空数组，而不是抛错", () => {
    expect(extractRows({ message: "ok" }, "")).toEqual([]);
    expect(extractRows(null, "results")).toEqual([]);
    expect(extractRows({ results: "not an array" }, "results")).toEqual([]);
  });
});

describe("单条结果映射", () => {
  const cfg = { titleField: "", urlField: "", snippetField: "" };

  it("自动识别常见字段名", () => {
    expect(mapRow({ title: "标题", link: "https://a.example", description: "摘要" }, cfg)).toEqual({
      title: "标题",
      url: "https://a.example",
      snippet: "摘要",
      publishedAt: undefined,
      content: undefined,
    });
  });

  it("自定义字段名优先", () => {
    const r = mapRow(
      { heading: "不是标题", name: "标题", url: "https://a.example", abstract: "摘要" },
      { titleField: "name", urlField: "url", snippetField: "abstract" },
    );
    expect(r?.title).toBe("标题");
  });

  it("没有可用链接的结果被丢弃（否则来源卡片会点不开）", () => {
    expect(mapRow({ title: "无链接" }, cfg)).toBeNull();
    expect(mapRow({ title: "javascript 伪协议", url: "javascript:alert(1)" }, cfg)).toBeNull();
  });

  it("日期字段统一成毫秒时间戳", () => {
    expect(mapRow({ url: "https://a.example", date: "2026-01-02T03:04:05Z" }, cfg)?.publishedAt).toBe(
      Date.parse("2026-01-02T03:04:05Z"),
    );
    expect(mapRow({ url: "https://a.example", published_date: 1767225600 }, cfg)?.publishedAt).toBe(
      1767225600000,
    );
  });

  it("很长的正文会被保留为 content，供后续抽取", () => {
    const long = "正".repeat(400);
    expect(mapRow({ url: "https://a.example", raw_content: long }, cfg)?.content).toBe(long);
    expect(mapRow({ url: "https://a.example", raw_content: "短" }, cfg)?.content).toBeUndefined();
  });
});