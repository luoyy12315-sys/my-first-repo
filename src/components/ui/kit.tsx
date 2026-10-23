"use client";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { STATUS_LABEL, type ConceptStatus } from "@/lib/types";

export const cx = (...parts: Parameters<typeof clsx>) => twMerge(clsx(...parts));

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-150 select-none disabled:opacity-45 disabled:pointer-events-none active:scale-[0.985] whitespace-nowrap";
  const variants: Record<string, string> = {
    primary: "bg-accent text-white hover:brightness-110 shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
    secondary: "bg-panel text-ink border border-line hover:border-linestrong hover:bg-panel2",
    ghost: "text-ink2 hover:text-ink hover:bg-panel2",
    soft: "bg-accentsoft text-accentink hover:brightness-[0.98]",
    danger: "bg-badsoft text-bad hover:brightness-[0.97] border border-transparent",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-[13px]",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-[15px]",
  };
  return (
    <button
      className={cx(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({
  className,
  children,
  as: Tag = "div",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType }) {
  return (
    <Tag
      className={cx(
        "rounded-2xl border border-line bg-panel shadow-[var(--shadow)]",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "ok" | "bad" | "warn";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-panel2 text-ink2 border-line",
    accent: "bg-accentsoft text-accentink border-transparent",
    ok: "bg-oksoft text-ok border-transparent",
    bad: "bg-badsoft text-bad border-transparent",
    warn: "bg-warnsoft text-warn border-transparent",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-5",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<ConceptStatus, "neutral" | "accent" | "ok" | "bad" | "warn"> = {
  untouched: "neutral",
  learning: "accent",
  needs_work: "warn",
  initial: "accent",
  mastered: "ok",
};

export function StatusPill({
  status,
  introduced,
  className,
}: {
  status: ConceptStatus;
  /** 已讲解但还没有作答证据：不要显示成“尚未接触” */
  introduced?: boolean;
  className?: string;
}) {
  const explained = status === "untouched" && introduced;
  return (
    <Badge tone={explained ? "accent" : STATUS_TONE[status] ?? "neutral"} className={className}>
      <span
        className="size-1.5 rounded-full"
        style={{
          background:
            status === "mastered"
              ? "var(--ok)"
              : status === "needs_work"
                ? "var(--warn)"
                : status === "untouched"
                  ? explained
                    ? "var(--accent)"
                    : "var(--ink-3)"
                  : "var(--accent)",
        }}
      />
      {explained ? "已讲解 · 待验证" : STATUS_LABEL[status]}
    </Badge>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-4 animate-spin text-ink3", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      {icon ? <div className="text-ink3">{icon}</div> : null}
      <p className="font-serif text-lg text-ink">{title}</p>
      {description ? <p className="max-w-sm text-sm leading-relaxed text-ink2">{description}</p> : null}
      {action}
    </div>
  );
}

export function SectionHeader({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1", className)}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="shrink-0 font-serif text-[17px] tracking-tight text-ink">{title}</h2>
        {hint ? <span className="min-w-0 text-xs text-ink3">{hint}</span> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Progress({ value, max = 1, className }: { value: number; max?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "relative w-full overflow-hidden rounded-t-3xl border border-line bg-panel shadow-[var(--shadow-lg)] animate-rise sm:rounded-2xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="font-serif text-base text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2 text-[13px] font-medium text-ink">
        {label}
        {hint ? <span className="text-[11.5px] font-normal text-ink3">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink3 focus:border-accent";

export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: "ok" | "warn" | "accent" }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cx(
          "font-serif text-2xl tabular-nums",
          tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "accent" ? "text-accentink" : "text-ink",
        )}
      >
        {value}
      </span>
      <span className="text-[11.5px] uppercase tracking-wide text-ink3">{label}</span>
    </div>
  );
}
