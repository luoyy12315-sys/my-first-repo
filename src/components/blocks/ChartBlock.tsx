"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

interface Series {
  name: string;
  points: { x: number; y: number }[];
}

export default function ChartBlock({
  payload,
}: {
  payload: {
    title: string;
    chartType?: "line" | "bar" | "scatter";
    xLabel?: string;
    yLabel?: string;
    series: Series[];
    note?: string;
  };
}) {
  const type = payload.chartType ?? "line";
  const series = Array.isArray(payload.series) ? payload.series : [];
  const colors = ["var(--accent)", "#b08968", "#6a7fdb", "#c0703f", "#5c9e7a", "#9a6fb0"];

  // 多系列对齐到同一 x 轴，便于折线/柱状比较
  const merged = (() => {
    const map = new Map<number, Record<string, number>>();
    for (const s of series) {
      for (const p of s.points) {
        const row = map.get(p.x) ?? { x: p.x };
        row[s.name] = p.y;
        map.set(p.x, row);
      }
    }
    return [...map.values()].sort((a, b) => a.x - b.x);
  })();

  const tooltipStyle = {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    fontSize: 12,
    color: "var(--ink)",
  } as const;

  if (!series.length) {
    return (
      <div className="rounded-2xl border border-line bg-panel2/50 p-4 text-[12.5px] text-ink3">
        图表缺少数据系列，未渲染（不会编造数据来凑一张图）。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h4 className="font-serif text-[15px] text-ink">{payload.title}</h4>
        <span className="text-[11px] uppercase tracking-wide text-ink3">
          {type === "line" ? "折线" : type === "bar" ? "柱状" : "散点"}
        </span>
      </div>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === "bar" ? (
            <BarChart data={merged} margin={{ top: 6, right: 12, bottom: 18, left: -8 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 11, fill: "var(--ink-3)" }}
                stroke="var(--line-strong)"
                label={
                  payload.xLabel
                    ? { value: payload.xLabel, position: "insideBottom", offset: -6, fontSize: 11, fill: "var(--ink-3)" }
                    : undefined
                }
              />
              <YAxis tick={{ fontSize: 11, fill: "var(--ink-3)" }} stroke="var(--line-strong)" width={44} />
              <Tooltip contentStyle={tooltipStyle} />
              {series.map((s, i) => (
                <Bar key={s.name} dataKey={s.name} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          ) : type === "scatter" ? (
            <ScatterChart margin={{ top: 6, right: 14, bottom: 18, left: -8 }}>
              <CartesianGrid stroke="var(--line)" />
              <XAxis
                type="number"
                dataKey="x"
                tick={{ fontSize: 11, fill: "var(--ink-3)" }}
                stroke="var(--line-strong)"
                name={payload.xLabel}
              />
              <YAxis
                type="number"
                dataKey="y"
                tick={{ fontSize: 11, fill: "var(--ink-3)" }}
                stroke="var(--line-strong)"
                width={44}
                name={payload.yLabel}
              />
              <ZAxis range={[46, 46]} />
              <Tooltip contentStyle={tooltipStyle} />
              {series.map((s, i) => (
                <Scatter key={s.name} name={s.name} data={s.points} fill={colors[i % colors.length]} />
              ))}
            </ScatterChart>
          ) : (
            <LineChart data={merged} margin={{ top: 6, right: 14, bottom: 18, left: -8 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="x"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 11, fill: "var(--ink-3)" }}
                stroke="var(--line-strong)"
                label={
                  payload.xLabel
                    ? { value: payload.xLabel, position: "insideBottom", offset: -6, fontSize: 11, fill: "var(--ink-3)" }
                    : undefined
                }
              />
              <YAxis tick={{ fontSize: 11, fill: "var(--ink-3)" }} stroke="var(--line-strong)" width={44} />
              <Tooltip contentStyle={tooltipStyle} />
              {series.map((s, i) => (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={s.points.length <= 12}
                  connectNulls
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {series.length > 1 ? (
        <div className="mt-1 flex flex-wrap gap-3">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5 text-[11.5px] text-ink2">
              <span className="size-2 rounded-full" style={{ background: colors[i % colors.length] }} />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
      {payload.note ? <p className="mt-2 text-[12.5px] leading-relaxed text-ink2">{payload.note}</p> : null}
    </div>
  );
}
