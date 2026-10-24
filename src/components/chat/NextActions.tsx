"use client";

import type { ReactNode } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { cx } from "@/components/ui/kit";

export interface NextAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  primary?: boolean;
  title?: string;
}

/** 教完知识点、答完题之后的上下文操作，避免用户只能自己输入“然后呢”。 */
export default function NextActions({
  actions,
  label = "下一步",
  busy = false,
}: {
  actions: NextAction[];
  label?: string;
  busy?: boolean;
}) {
  if (!actions.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-line bg-panel2/30 px-2.5 py-2">
      <span className="mr-0.5 flex items-center gap-1 text-[12px] uppercase tracking-wide text-ink3">
        <Sparkles className="size-3 text-accent" />
        {label}
      </span>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          disabled={busy}
          title={action.title}
          className={cx(
            "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors disabled:opacity-45",
            action.primary
              ? "border-accent/35 bg-accentsoft text-accentink hover:border-accent"
              : "border-line bg-panel text-ink2 hover:border-accent/40 hover:text-ink",
          )}
        >
          {action.icon ?? (action.primary ? <ArrowRight className="size-3" /> : null)}
          {action.label}
        </button>
      ))}
    </div>
  );
}
