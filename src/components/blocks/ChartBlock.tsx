"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ChartInput } from "@/lib/blocks/schema";

interface Payload extends Partial<ChartInput> {
  title: string;
}

type Point = { x: number | string; y: number; kind?: "delta" | "total" };
type Series = {
  name: string;
  type?: "line" | "bar" | "area";
  axis?: "left" | "right";
  points: Point[];
};
type Candle = { label: string; open: number; high: number; low: number; close: number };

const COLORS = ["var(--accent)", "#b08968", "#6a7fdb", "#c0703f", "#5c9e7a", "#9a6fb0", "#d08a3a", "#5b8ff9"];
const TYPE_LABEL: Record<string, string> = {
  line: "折线",
  bar: "柱状",
  area: "面积",
  scatter: "散点",
  pie: "饼图",
  radar: "雷达",
  waterfall: "瀑布",
  candlestick: "K 线",
  combo: "组合",
};
const TOOLTIP_STYLE = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--ink)",
} as const;

const keyOf = (v: number | string) => String(v);

function isNumericX(series: Series[], xType?: string): boolean {
  if (xType === "category" || xType === "time") return false;
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  return xs.length > 0 && xs.every((x) => typeof x === "number");
}

/** 多系列对齐到同一 x 轴；数值轴按大小排，类目轴按首次出现顺序 */
function mergeSeries(series: Series[], sortNumeric: boolean) {
  const keys: (number | string)[] = [];
  const seen = new Set<string>();
  for (const s of series) {
    for (const p of s.points) {
      const k = keyOf(p.x);
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(p.x);
      }
    }
  }
  if (sortNumeric) keys.sort((a, b) => Number(a) - Number(b));
  return keys.map((k) => {
    const row: Record<string, number | string> = { x: k };
    for (const s of series) {
      const hit = s.points.find((p) => keyOf(p.x) === keyOf(k));
      if (hit) row[s.name] = hit.y;
    }
    return row;
  });
}

function axisBase(payload: Payload, numeric: boolean) {
  return {
    dataKey: "x",
    type: numeric ? ("number" as const) : ("category" as const),
    ...(numeric ? { domain: ["dataMin", "dataMax"] as [string, string] } : {}),
    tick: { fontSize: 11, fill: "var(--ink-3)" },
    stroke: "var(--line-strong)",
    interval: "preserveStartEnd" as const,
    minTickGap: 8,
  };
}

function yAxisProps(payload: Payload, id?: string, right = false) {
  return {
    ...(id ? { yAxisId: id } : {}),
    tick: { fontSize: 11, fill: "var(--ink-3)" },
    stroke: "var(--line-strong)",
    width: 58,
  };
}

/* ── 瀑布图 ── */
type WfRow = { x: string; base: number; value: number; fill: string; raw: number };

function buildWaterfall(points: Point[]): WfRow[] {
  let running = 0;
  return points.map((p) => {
    const kind = p.kind ?? "delta";
    const x = keyOf(p.x);
    if (kind === "total") {
      running = p.y;
      return p.y >= 0
        ? { x, base: 0, value: p.y, fill: "#6a7fdb", raw: p.y }
        : { x, base: p.y, value: -p.y, fill: "#c0703f", raw: p.y };
    }
    const start = running;
    running += p.y;
    return {
      x,
      base: Math.min(start, running),
      value: Math.abs(p.y),
      fill: p.y >= 0 ? "#5c9e7a" : "#c0703f",
      raw: p.y,
    };
  });
}

function WaterfallTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload?: WfRow }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.payload?.raw ?? 0;
  return (
    <div style={TOOLTIP_STYLE} className="px-2.5 py-1.5">
      {String(label)}：{raw >= 0 ? "+" : ""}
      {raw}
    </div>
  );
}

type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: WfRow;
};

/**
 * recharts 的堆叠底座在透明柱上不稳定，这里直接用自定义 shape：
 * 按 base 把整根柱上移，保证"减少项"从累计值开始画。
 */
function WaterfallBar({ x = 0, y = 0, width = 0, height = 0, payload }: BarShapeProps) {
  const base = payload?.base ?? 0;
  const value = payload?.value ?? 0;
  const unit = value ? height / value : 0;
  const top = y - base * unit;
  return <rect x={x} y={top} width={width} height={Math.max(0, height)} rx={3} fill={payload?.fill ?? "#6a7fdb"} />;
}

/* ── K 线 ── */
function CandlestickChart({ candles, yLabel }: { candles: Candle[]; yLabel?: string }) {
  const W = 660;
  const H = 240;
  const padL = 48;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const lows = Math.min(...candles.map((c) => c.low));
  const highs = Math.max(...candles.map((c) => c.high));
  const span = highs - lows || Math.max(1, Math.abs(highs) * 0.02);
  const y = (v: number) => padT + ((highs - v) / span) * plotH;
  const slot = plotW / Math.max(1, candles.length);
  const bodyW = Math.min(16, Math.max(4, slot * 0.55));
  const labelEvery = Math.max(1, Math.ceil(candles.length / 7));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[240px] w-full" role="img" aria-label="K 线图">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const v = highs - span * t;
        const yy = padT + plotH * t;
        return (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="var(--line)" strokeDasharray={t === 0 || t === 1 ? "0" : "3 4"} />
            <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize={10} fill="var(--ink-3)">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        );
      })}
      {candles.map((c, i) => {
        const cx = padL + slot * (i + 0.5);
        const up = c.close >= c.open;
        const color = up ? "#c0392b" : "#2e8b57";
        const bodyTop = y(Math.max(c.open, c.close));
        const bodyH = Math.max(1.5, Math.abs(y(c.open) - y(c.close)));
        return (
          <g key={`${c.label}-${i}`}>
            <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1.2} />
            <rect
              x={cx - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              fill={up ? color : "var(--panel)"}
              stroke={color}
              strokeWidth={1.2}
            />
            {i % labelEvery === 0 ? (
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--ink-3)">
                {c.label}
              </text>
            ) : null}
          </g>
        );
      })}
      {yLabel ? (
        <text x={12} y={padT + plotH / 2} textAnchor="middle" fontSize={10} fill="var(--ink-3)" transform={`rotate(-90 12 ${padT + plotH / 2})`}>
          {yLabel}
        </text>
      ) : null}
    </svg>
  );
}

/* ── 主体 ── */
export default function ChartBlock({ payload }: { payload: Payload }) {
  const type = payload.chartType ?? "line";
  const series: Series[] = Array.isArray(payload.series) ? payload.series : [];
  const candles: Candle[] = Array.isArray(payload.candles) ? payload.candles : [];
  const illustrative = (payload.dataKind ?? "illustrative") === "illustrative";

  if (type === "candlestick" ? !candles.length : !series.length) {
    return (
      <div className="rounded-2xl border border-line bg-panel2/50 p-4 text-[12.5px] text-ink3">
        图表缺少数据，未渲染。可以让我改用表格。
      </div>
    );
  }

  const numeric = isNumericX(series, payload.xType);
  const merged = mergeSeries(series, numeric);
  const stacked = Boolean(payload.stacked);
  const hasRight = series.some((s) => s.axis === "right");
  const wfRows = type === "waterfall" ? buildWaterfall(series[0]?.points ?? []) : [];
  const wfMin = Math.min(0, ...wfRows.map((r) => r.base));
  const wfMax = Math.max(1, ...wfRows.map((r) => r.base + r.value));

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h4 className="font-serif text-[15px] text-ink">{payload.title}</h4>
        <span className="text-[11px] uppercase tracking-wide text-ink3">{TYPE_LABEL[type] ?? type}</span>
        {illustrative ? (
          <span className="rounded-full border border-line bg-panel2 px-2 py-0.5 text-[11px] text-ink3">
            示意数据
          </span>
        ) : null}
      </div>
      {payload.dataNote ? <p className="-mt-1 mb-2 text-[11.5px] text-ink3">{payload.dataNote}</p> : null}
      {type !== "pie" && type !== "radar" && (payload.xLabel || payload.yLabel) ? (
        <p className="mb-1 text-[11px] text-ink3">
          {payload.xLabel ? `横轴：${payload.xLabel}` : ""}
          {payload.xLabel && payload.yLabel ? " · " : ""}
          {payload.yLabel ? `纵轴：${payload.yLabel}` : ""}
        </p>
      ) : null}

      {type === "candlestick" ? (
        <div>
          <CandlestickChart candles={candles} />
          <div className="mt-1 flex gap-3 text-[12px] text-ink2">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: "#c0392b" }} /> 收涨
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: "#2e8b57" }} /> 收跌
            </span>
          </div>
        </div>
      ) : (
      <div className={type === "pie" || type === "radar" ? "h-[260px] w-full" : "h-[240px] w-full"}>
        <ResponsiveContainer width="100%" height="100%">
          {type === "pie" ? (
            <PieChart>
              <Pie
                data={series[0].points.map((p) => ({ name: keyOf(p.x), value: p.y }))}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={88}
                labelLine={false}
              >
                {series[0].points.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          ) : type === "radar" ? (
            <RadarChart
              data={mergeSeries(series, false)}
              cx="50%"
              cy="50%"
              outerRadius={86}
            >
              <PolarGrid stroke="var(--line)" />
              <PolarAngleAxis dataKey="x" tick={{ fontSize: 11, fill: "var(--ink-3)" }} />
              <PolarRadiusAxis tick={{ fontSize: 10, fill: "var(--ink-3)" }} angle={90} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {series.map((s, i) => (
                <Radar
                  key={s.name}
                  name={s.name}
                  dataKey={s.name}
                  stroke={COLORS[i % COLORS.length]}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.2}
                />
              ))}
            </RadarChart>
          ) : type === "scatter" ? (
            <ScatterChart margin={{ top: 6, right: 14, bottom: 18, left: -8 }}>
              <CartesianGrid stroke="var(--line)" />
              <XAxis {...axisBase(payload, numeric)} name={payload.xLabel} />
              <YAxis {...yAxisProps(payload)} dataKey="y" type="number" name={payload.yLabel} />
              <ZAxis range={[46, 46]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {series.map((s, i) => (
                <Scatter key={s.name} name={s.name} data={s.points} fill={COLORS[i % COLORS.length]} />
              ))}
            </ScatterChart>
          ) : type === "waterfall" ? (
            <BarChart
              data={wfRows}
              margin={{ top: 6, right: 14, bottom: 18, left: -8 }}
            >
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis {...axisBase(payload, false)} />
              <YAxis {...yAxisProps(payload)} domain={[wfMin, wfMax]} />
              <Tooltip content={<WaterfallTip />} />
              <Bar
                dataKey="value"
                isAnimationActive={false}
                shape={(props: unknown) => <WaterfallBar {...(props as BarShapeProps)} />}
              />
            </BarChart>
          ) : type === "combo" ? (
            <ComposedChart
              data={merged}
              margin={{ top: 6, right: hasRight ? 6 : 14, bottom: 18, left: -8 }}
            >
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis {...axisBase(payload, numeric)} />
              <YAxis {...yAxisProps(payload, "left")} />
              {hasRight ? <YAxis {...yAxisProps(payload, "right", true)} orientation="right" /> : null}
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {series.map((s, i) => {
                const color = COLORS[i % COLORS.length];
                const yAxisId = s.axis ?? "left";
                const shape = s.type ?? (s.axis === "right" ? "line" : "bar");
                if (shape === "line")
                  return (
                    <Line
                      key={s.name}
                      yAxisId={yAxisId}
                      type="monotone"
                      dataKey={s.name}
                      stroke={color}
                      strokeWidth={2}
                      dot={s.points.length <= 12}
                      connectNulls
                    />
                  );
                if (shape === "area")
                  return (
                    <Area
                      key={s.name}
                      yAxisId={yAxisId}
                      type="monotone"
                      dataKey={s.name}
                      stroke={color}
                      fill={color}
                      fillOpacity={0.18}
                      strokeWidth={2}
                      connectNulls
                    />
                  );
                return (
                  <Bar
                    key={s.name}
                    yAxisId={yAxisId}
                    dataKey={s.name}
                    fill={color}
                    radius={[3, 3, 0, 0]}
                    stackId={stacked ? "stack" : undefined}
                  />
                );
              })}
            </ComposedChart>
          ) : type === "area" ? (
            <AreaChart data={merged} margin={{ top: 6, right: 14, bottom: 18, left: -8 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis {...axisBase(payload, numeric)} />
              <YAxis {...yAxisProps(payload)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {series.map((s, i) => (
                <Area
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  stroke={COLORS[i % COLORS.length]}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.18}
                  strokeWidth={2}
                  stackId={stacked ? "stack" : undefined}
                  connectNulls
                />
              ))}
            </AreaChart>
          ) : type === "bar" ? (
            <BarChart data={merged} margin={{ top: 6, right: 12, bottom: 18, left: -8 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis {...axisBase(payload, numeric)} />
              <YAxis {...yAxisProps(payload)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {series.map((s, i) => (
                <Bar
                  key={s.name}
                  dataKey={s.name}
                  fill={COLORS[i % COLORS.length]}
                  radius={[4, 4, 0, 0]}
                  stackId={stacked ? "stack" : undefined}
                />
              ))}
            </BarChart>
          ) : (
            <LineChart data={merged} margin={{ top: 6, right: 14, bottom: 18, left: -8 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis {...axisBase(payload, numeric)} />
              <YAxis {...yAxisProps(payload)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {series.map((s, i) => (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={s.points.length <= 12}
                  connectNulls
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      )}

      {type === "pie" ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {series[0].points.map((p, i) => {
            const total = series[0].points.reduce((n, q) => n + q.y, 0);
            const pct = total ? Math.round((p.y / total) * 100) : 0;
            return (
              <span key={`${p.x}-${i}`} className="flex items-center gap-1.5 text-[12px] text-ink2">
                <span className="size-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                {keyOf(p.x)} <span className="text-ink3">{p.y}（{pct}%）</span>
              </span>
            );
          })}
        </div>
      ) : type === "waterfall" ? (
        <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-ink2">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: "#5c9e7a" }} /> 增加
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: "#c0703f" }} /> 减少
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: "#6a7fdb" }} /> 合计
          </span>
        </div>
      ) : series.length > 1 ? (
        <div className="mt-1 flex flex-wrap gap-3">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5 text-[12px] text-ink2">
              <span className="size-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              {s.name}
              {s.axis === "right" ? <span className="text-[10px] text-ink3">右轴</span> : null}
            </span>
          ))}
        </div>
      ) : null}

      {payload.note ? <p className="mt-2 text-[12.5px] leading-relaxed text-ink2">{payload.note}</p> : null}
    </div>
  );
}
