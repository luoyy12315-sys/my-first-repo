import { describe, expect, it } from "vitest";
import { chartInputSchema } from "@/lib/blocks/schema";

const base = { title: "测试图" };

function parse(payload: unknown) {
  return chartInputSchema.safeParse(payload);
}

describe("chartInputSchema v2", () => {
  it("饼图接受字符串类目，并默认标记为示意数据", () => {
    const r = parse({
      ...base,
      chartType: "pie",
      series: [
        {
          name: "占比",
          points: [
            { x: "流动资产", y: 60 },
            { x: "固定资产", y: 30 },
            { x: "无形资产", y: 10 },
          ],
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dataKind).toBe("illustrative");
      expect(r.data.series?.[0].points[0].x).toBe("流动资产");
    }
  });

  it("瀑布图接受 delta / total", () => {
    const r = parse({
      ...base,
      chartType: "waterfall",
      series: [
        {
          name: "利润桥",
          points: [
            { x: "营业收入", y: 1000, kind: "total" },
            { x: "营业成本", y: -600, kind: "delta" },
            { x: "净利润", y: 150, kind: "total" },
          ],
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("K 线使用 candles，而不是 series", () => {
    const r = parse({
      ...base,
      chartType: "candlestick",
      dataKind: "illustrative",
      candles: [
        { label: "10-20", open: 100, high: 108, low: 96, close: 105 },
        { label: "10-21", open: 105, high: 110, low: 101, close: 102 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("K 线的 high/low 不覆盖 open/close 时拒绝", () => {
    const r = parse({
      ...base,
      chartType: "candlestick",
      candles: [{ label: "10-20", open: 100, high: 99, low: 96, close: 105 }],
    });
    expect(r.success).toBe(false);
  });

  it("K 线缺少 candles 时拒绝", () => {
    const r = parse({ ...base, chartType: "candlestick", series: [{ name: "a", points: [{ x: 1, y: 2 }] }] });
    expect(r.success).toBe(false);
  });

  it("非 K 线图缺少 series 时拒绝", () => {
    expect(parse({ ...base, chartType: "bar" }).success).toBe(false);
  });

  it("饼图只允许一个 series", () => {
    const r = parse({
      ...base,
      chartType: "pie",
      series: [
        { name: "a", points: [{ x: "甲", y: 1 }] },
        { name: "b", points: [{ x: "乙", y: 2 }] },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("双轴组合图接受左右轴与各自形态", () => {
    const r = parse({
      ...base,
      chartType: "combo",
      series: [
        { name: "营业收入", type: "bar", axis: "left", points: [{ x: "2023", y: 1200 }] },
        { name: "毛利率", type: "line", axis: "right", points: [{ x: "2023", y: 32 }] },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("combo 没有 type/axis 时拒绝", () => {
    const r = parse({
      ...base,
      chartType: "combo",
      series: [{ name: "a", points: [{ x: 1, y: 2 }] }],
    });
    expect(r.success).toBe(false);
  });

  it("旧格式（数值 x、三种图型）仍然兼容", () => {
    const r = parse({
      ...base,
      chartType: "line",
      series: [{ name: "复利", points: [{ x: 0, y: 10000 }, { x: 1, y: 10500 }] }],
    });
    expect(r.success).toBe(true);
  });
});
