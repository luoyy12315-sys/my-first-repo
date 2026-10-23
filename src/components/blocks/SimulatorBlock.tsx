"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Lightbulb, MessageCircleQuestion } from "lucide-react";
import { Button, cx } from "@/components/ui/kit";
import { evaluateExpression } from "@/lib/learning/expr";
import type { BlockDTO } from "@/lib/types";

interface SimParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}
interface SimPayload {
  title: string;
  description?: string;
  expression?: string;
  params: SimParam[];
  outputs?: { key: string; label: string; expression: string; unit?: string; digits?: number }[];
  plot?: { xKey: string; expression: string; xLabel?: string; yLabel?: string };
  insight?: string;
}

export default function SimulatorBlock({
  block,
  expanded,
  onAsk,
}: {
  block: BlockDTO;
  expanded?: boolean;
  onAsk?: (text: string) => void;
}) {
  const payload = block.payload as unknown as SimPayload;
  const params = Array.isArray(payload.params) ? payload.params : [];
  const defaults = useMemo(() => {
    const base: Record<string, number> = {};
    for (const p of params) base[p.key] = p.default;
    return base;
  }, [params]);

  const [values, setValues] = useState<Record<string, number>>(() => {
    const saved = (block.state as { params?: Record<string, number> }).params;
    const next = { ...defaults };
    if (saved) {
      for (const p of params) {
        if (typeof saved[p.key] === "number" && Number.isFinite(saved[p.key])) {
          next[p.key] = Math.min(p.max, Math.max(p.min, saved[p.key]));
        }
      }
    }
    return next;
  });
  const [showInsight, setShowInsight] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 参数变化 → 保存组件状态（只是组件进度，不是学习证据）
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch(`/api/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: { params: values } }),
      }).catch(() => undefined);
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [values, block.id]);

  const outputs = useMemo(() => {
    return (payload.outputs ?? []).map((o) => {
      try {
        const v = evaluateExpression(o.expression, values);
        return { ...o, value: v, error: null as string | null };
      } catch (e) {
        return { ...o, value: NaN, error: (e as Error).message };
      }
    });
  }, [payload.outputs, values]);

  const plot = useMemo(() => {
    if (!payload.plot) return null;
    const xp = params.find((p) => p.key === payload.plot!.xKey);
    if (!xp) return null;
    const N = 140;
    const pts: { x: number; y: number }[] = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i <= N; i++) {
      const x = xp.min + ((xp.max - xp.min) * i) / N;
      const vars = { ...values, [payload.plot.xKey]: x };
      try {
        const y = evaluateExpression(payload.plot.expression, vars);
        if (!Number.isFinite(y)) continue;
        pts.push({ x, y });
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } catch {
        /* 跳过不可计算的点 */
      }
    }
    if (!pts.length)
      return { pts: [], minY: 0, maxY: 1, xMin: xp.min, xMax: xp.max, xp, xLabel: payload.plot?.xLabel, yLabel: payload.plot?.yLabel };
    if (Math.abs(maxY - minY) < 1e-9) {
      minY -= 1;
      maxY += 1;
    }
    return { pts, minY, maxY, xMin: xp.min, xMax: xp.max, xp, xLabel: payload.plot?.xLabel, yLabel: payload.plot?.yLabel };
  }, [payload.plot, params, values]);

  const reset = useCallback(() => setValues({ ...defaults }), [defaults]);

  if (!params.length) {
    return (
      <div className="rounded-2xl border border-line bg-panel2/50 p-4 text-[12.5px] text-ink3">
        模拟器缺少可调参数，未渲染。
      </div>
    );
  }

  const W = 520;
  const H = 220;
  const pad = { l: 46, r: 12, t: 22, b: 28 };
  const path = plot?.pts.length
    ? plot.pts
        .map((p, i) => {
          const px = pad.l + ((p.x - plot.xMin) / (plot.xMax - plot.xMin || 1)) * (W - pad.l - pad.r);
          const py = H - pad.b - ((p.y - plot.minY) / (plot.maxY - plot.minY || 1)) * (H - pad.t - pad.b);
          return `${i === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)}`;
        })
        .join(" ")
    : "";

  const yTicks = [0, 0.5, 1].map((f) => plot && plot.minY + (plot.maxY - plot.minY) * f);
  // 大数字用紧凑记法（1.97 万），否则八位数会把刻度挤出画布
  const compact = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
    if (a >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
    if (a >= 100) return v.toFixed(0);
    if (a >= 1) return v.toFixed(1);
    return v.toFixed(2);
  };

  return (
    <div className="rounded-2xl border border-line bg-panel">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h4 className="font-serif text-[15px] text-ink">{payload.title}</h4>
          {payload.description ? (
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">{payload.description}</p>
          ) : null}
        </div>
        <button
          onClick={reset}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-ink3 hover:bg-panel2 hover:text-ink"
          title="恢复默认参数"
        >
          <RotateCcw className="size-3.5" />
          重置
        </button>
      </div>

      <div className={cx("grid gap-0", expanded ? "lg:grid-cols-[300px_1fr]" : "")}>
        <div className="flex flex-col gap-4 border-line p-4 lg:border-r">
          {params.map((p) => (
            <div key={p.key}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[12.5px] text-ink2">{p.label}</span>
                <span className="font-mono text-[12.5px] tabular-nums text-ink">
                  {Number(values[p.key].toFixed(4))}
                  {p.unit ? <span className="ml-0.5 text-ink3">{p.unit}</span> : null}
                </span>
              </div>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={values[p.key]}
                onChange={(e) => setValues((v) => ({ ...v, [p.key]: Number(e.target.value) }))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[var(--accent)]"
                aria-label={p.label}
              />
            </div>
          ))}

          {outputs.length ? (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              {outputs.map((o) => (
                <div key={o.key} className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] text-ink2">{o.label}</span>
                  <span className="font-mono text-[14px] tabular-nums text-accentink">
                    {o.error ? (
                      <span className="text-[11.5px] text-bad">计算失败</span>
                    ) : (
                      <>
                        {o.value.toFixed(o.digits ?? 3)}
                        {o.unit ? <span className="ml-0.5 text-[11.5px] text-ink3">{o.unit}</span> : null}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {plot ? (
          <div className="p-4">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${payload.title} 曲线`}>
              {yTicks.map((t, i) =>
                t == null ? null : (
                  <g key={i}>
                    <line
                      x1={pad.l}
                      x2={W - pad.r}
                      y1={H - pad.b - ((t - plot.minY) / (plot.maxY - plot.minY || 1)) * (H - pad.t - pad.b)}
                      y2={H - pad.b - ((t - plot.minY) / (plot.maxY - plot.minY || 1)) * (H - pad.t - pad.b)}
                      stroke="var(--line)"
                      strokeWidth={1}
                    />
                    <text
                      x={pad.l - 6}
                      y={H - pad.b - ((t - plot.minY) / (plot.maxY - plot.minY || 1)) * (H - pad.t - pad.b) + 3.5}
                      textAnchor="end"
                      fontSize={9.5}
                      fill="var(--ink-3)"
                    >
                      {compact(t)}
                    </text>
                  </g>
                ),
              )}
              <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="var(--line-strong)" />
              <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--line-strong)" />
              <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeLinejoin="round" />
              <text x={(W + pad.l) / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--ink-3)">
                {plot.xLabel ?? plot.xp.label}
              </text>
              <text x={pad.l} y={12} textAnchor="start" fontSize={10} fill="var(--ink-3)">
                {plot.yLabel ?? "输出"}
              </text>
            </svg>
            <p className="mt-1 text-center text-[11px] text-ink3">
              拖动左侧参数，曲线与数值会实时变化
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        {payload.insight ? (
          <Button size="sm" variant="soft" icon={<Lightbulb className="size-3.5" />} onClick={() => setShowInsight((v) => !v)}>
            {showInsight ? "收起规律" : "我发现了什么？"}
          </Button>
        ) : null}
        {onAsk ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<MessageCircleQuestion className="size-3.5" />}
            onClick={() => {
              const snapshot = params
                .map((p) => `${p.label}=${Number((values[p.key] ?? p.default).toFixed(3))}${p.unit ?? ""}`)
                .join("，");
              onAsk(`我在模拟器「${payload.title}」里把参数调成 ${snapshot}，想请你解释一下为什么会出现这个结果。`);
            }}
          >
            就这个结果提问
          </Button>
        ) : null}
      </div>

      {showInsight && payload.insight ? (
        <div className="border-t border-line bg-accentsoft/40 px-4 py-3 text-[13px] leading-relaxed text-ink">
          {payload.insight}
        </div>
      ) : null}
    </div>
  );
}
