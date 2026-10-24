"use client";

import Markdown from "@/components/Markdown";
import { CheckCircle2 } from "lucide-react";
import { usePlans } from "@/components/PlanSelect";

export function TableBlock({
  payload,
}: {
  payload: { title?: string; columns?: string[]; rows?: string[][]; note?: string };
}) {
  const columns = payload.columns ?? [];
  const rows = payload.rows ?? [];
  if (!columns.length) {
    return <EmptyBlock text="表格数据不完整，未能渲染。" />;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <h4 className="font-serif text-[15px] text-ink">{payload.title ?? "对比表"}</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-panel2">
              {columns.map((c, i) => (
                <th key={i} className="border-b border-line px-3.5 py-2.5 text-left font-medium text-ink2">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="odd:bg-transparent even:bg-panel2/40">
                {columns.map((_, j) => (
                  <td key={j} className="border-b border-line px-3.5 py-2.5 align-top text-ink">
                    <Markdown className="md-tight text-[13.5px] [&_.md]:text-[13.5px]">
                      {String(row?.[j] ?? "")}
                    </Markdown>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {payload.note ? (
        <p className="border-t border-line px-4 py-2.5 text-[12.5px] leading-relaxed text-ink2">{payload.note}</p>
      ) : null}
    </div>
  );
}

interface StepLike {
  title: string;
  detail?: string;
}

/**
 * 步骤 / 学习路线共用组件。
 * 注意：模型可能通过 present_steps 给 steps，也可能通过 save_plan 给 items，
 * 两种结构都必须渲染——之前只认 steps，导致学习路线块直接把整页打崩。
 */
export function StepsBlock({
  payload,
}: {
  payload: {
    title?: string;
    steps?: StepLike[];
    items?: { title?: string; rationale?: string }[];
    note?: string;
    planId?: string;
    draft?: boolean;
  };
}) {
  const steps: StepLike[] = Array.isArray(payload.steps) && payload.steps.length
    ? payload.steps
    : (payload.items ?? []).map((it) => ({ title: it?.title ?? "（未命名步骤）", detail: it?.rationale }));

  const { plans } = usePlans();
  const plan = payload.planId ? plans.find((p) => p.id === payload.planId) ?? null : null;
  // 草稿块会一直留在历史里；确认之后不能再显示「待确认」，否则和计划真实状态矛盾。
  const isDraft = plan ? plan.status === "draft" : Boolean(payload.draft);
  const confirmed = Boolean(plan && plan.status !== "draft");
  const title = confirmed ? (payload.title ?? "").replace(/^计划草稿：/, "") : payload.title ?? "步骤";

  if (!steps.length) return <EmptyBlock text="这条步骤内容为空。" />;

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="font-serif text-[15px] text-ink">{title || "步骤"}</h4>
        {payload.planId ? (
          <a
            href={`/plan/${payload.planId}`}
            className="shrink-0 text-[12px] text-accentink underline underline-offset-2"
          >
            {isDraft ? "查看并确认计划" : "查看计划"}
          </a>
        ) : null}
      </div>
      {isDraft ? (
        <p className="mb-3 rounded-lg border border-warn/30 bg-warnsoft/40 px-2.5 py-1.5 text-[12px] text-ink">
          这是待确认的草稿，确认课程与知识点后才会进入正式学习。
        </p>
      ) : confirmed ? (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-ok/25 bg-oksoft/40 px-2.5 py-1.5 text-[12px] text-ok">
          <CheckCircle2 className="size-3.5" /> 计划已确认，可以开始学习。
        </p>
      ) : null}
      <ol className="relative flex flex-col gap-3 pl-1">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-panel2 text-[12px] font-medium tabular-nums text-ink2">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium leading-6 text-ink">{s.title}</p>
              {s.detail ? (
                <div className="mt-0.5">
                  <Markdown className="text-[13.5px]">{s.detail}</Markdown>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {payload.note ? (
        <p className="mt-3 border-t border-line pt-2.5 text-[12.5px] leading-relaxed text-ink2">{payload.note}</p>
      ) : null}
    </div>
  );
}

export function NoteBlock({
  payload,
}: {
  payload: {
    kind?: string;
    headline?: string;
    covered?: string[];
    progress?: string[];
    needsWork?: string[];
    nextSteps?: string[];
    resumeHint?: string;
  };
}) {
  if (payload.kind !== "summary") {
    return (
      <div className="rounded-2xl border border-line bg-panel2/60 p-4 text-[13.5px] leading-relaxed text-ink2">
        <Markdown>{payload.headline ?? ""}</Markdown>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-accent/25 bg-accentsoft/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle2 className="size-4 text-accent" />
        <h4 className="font-serif text-[15px] text-ink">本次学习小结</h4>
      </div>
      <p className="mb-3 text-[14px] font-medium text-ink">{payload.headline}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryList label="覆盖内容" items={payload.covered} />
        <SummaryList label="模型总结的进展" items={payload.progress} tone="ok" />
        <SummaryList label="仍需巩固" items={payload.needsWork} tone="warn" />
        <SummaryList label="下一步" items={payload.nextSteps} tone="accent" />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink3">
        以上是模型对本次对话的总结；是否掌握以「学习档案」里的作答证据为准。
      </p>
      {payload.resumeHint ? (
        <p className="mt-2 border-t border-line pt-2.5 text-[12.5px] text-ink2">下次从这里继续：{payload.resumeHint}</p>
      ) : null}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/50 px-3.5 py-3 text-[12.5px] text-ink3">{text}</div>
  );
}

function SummaryList({
  label,
  items,
  tone,
}: {
  label: string;
  items?: string[];
  tone?: "ok" | "warn" | "accent";
}) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <div>
      <p
        className={`mb-1 text-[12px] uppercase tracking-wide ${
          tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "accent" ? "text-accentink" : "text-ink3"
        }`}
      >
        {label}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-1.5 text-[12.8px] leading-relaxed text-ink2">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink3" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
