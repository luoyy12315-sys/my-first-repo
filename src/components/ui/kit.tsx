"use client";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2, MoreHorizontal, X } from "lucide-react";
import { useEffect, useRef, type ReactNode, useState, createContext, useContext, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { DISPLAY_STATUS_LABEL, type ConceptDisplayStatus, type ConceptStatus } from "@/lib/types";

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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-5",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const DISPLAY_TONE: Record<ConceptDisplayStatus, "neutral" | "accent" | "ok" | "warn"> = {
  todo: "neutral",
  learning: "accent",
  review: "warn",
  mastered: "ok",
};

export function StatusPill({
  status,
  introduced,
  displayStatus,
  className,
}: {
  status: ConceptStatus;
  /** 已讲解但还没有作答证据：不要显示成“尚未接触” */
  introduced?: boolean;
  /** 服务端统一推导的四态；不传时按内部状态降级映射 */
  displayStatus?: ConceptDisplayStatus;
  className?: string;
}) {
  const display =
    displayStatus ??
    (status === "mastered"
      ? "mastered"
      : status === "needs_work"
        ? "review"
        : status === "untouched"
          ? introduced
            ? "learning"
            : "todo"
          : "learning");
  return (
    <Badge tone={DISPLAY_TONE[display]} className={className}>
      <span
        className="size-1.5 rounded-full"
        style={{
          background:
            display === "mastered"
              ? "var(--ok)"
              : display === "review"
                ? "var(--warn)"
                : display === "todo"
                  ? "var(--ink-3)"
                  : "var(--accent)",
        }}
      />
      {DISPLAY_STATUS_LABEL[display]}
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

/**
 * 页面标题：一行动作导向的标题 + 右上一个主动作。
 * 不再带"小标签 + 副标题"两行装饰——解释性文字只在真正会让人困惑的地方出现。
 */
export function PageHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-5 flex flex-wrap items-center justify-between gap-3", className)}>
      <h1 className="min-w-0 font-serif text-[22px] leading-tight tracking-tight text-ink">{title}</h1>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** 区块标题：标题与动作同一行，不挂说明文字（状态信息交给 Badge 或直接省略） */
export function SectionHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="min-w-0 truncate font-serif text-[17px] tracking-tight text-ink">{title}</h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** 图标按钮：统一 32px 点击区，避免与 sm 文字按钮（也是 32px）排在一起时高低不齐 */
export function IconButton({
  label,
  onClick,
  children,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        "grid size-8 shrink-0 place-items-center rounded-full transition-colors",
        tone === "danger" ? "text-ink3 hover:bg-badsoft hover:text-bad" : "text-ink3 hover:bg-panel2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** 菜单项点击后通知外层收起（portal 模式没有 <details> 可关） */
const MenuCloseContext = createContext<(() => void) | null>(null);

/**
 * 溢出菜单：把"次要但偶尔要用的动作"收起来。
 * 默认向下展开（贴着触发按钮，不会顶出屏幕），也可指定向上（用于页面底部的输入区）。
 * 点击外部 / Esc 关闭；用原生 <details> 保留键盘可达性，不引入弹层库。
 */
export function OverflowMenu({
  label = "",
  align = "right",
  placement = "bottom",
  compact = false,
  ariaLabel,
  portal = false,
  overhang = false,
  narrow = false,
  children,
  className,
}: {
  label?: string;
  align?: "left" | "right";
  placement?: "bottom" | "top";
  /** 行内小按钮（侧栏会话行的三个点），不占 32px 高度 */
  compact?: boolean;
  /** 只给读屏用的名称（紧凑按钮不显示文字） */
  ariaLabel?: string;
  /**
   * 挂到 body 上、fixed 定位。侧栏这类带滚动/模糊的容器会裁掉绝对定位面板，
   * 想在侧栏边缘露出一半就必须走 portal。
   */
  portal?: boolean;
  /** portal 模式下把面板中心对齐到按钮右边缘（刚好一半在侧栏外） */
  overhang?: boolean;
  /** 窄面板（侧栏用），避免挡掉半个屏幕 */
  narrow?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // 面板默认向下展开；靠近窗口底部（侧栏最后几条）时自动向上，避免被裁掉
  const [flip, setFlip] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const updateFlip = () => {
    const summary = ref.current?.querySelector("summary");
    if (!summary) return;
    const rect = summary.getBoundingClientRect();
    setFlip(window.innerHeight - rect.bottom < 240);
  };

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onPointerDown = (e: PointerEvent) => {
      if (root.open && !root.contains(e.target as Node)) root.removeAttribute("open");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && root.open) {
        root.removeAttribute("open");
        (root.querySelector("summary") as HTMLElement | null)?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!portal || !open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    // 滚动时位置会漂，直接收起
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [portal, open]);

  // 打开后按按钮位置定位；放不下就上下翻转，左右夹在窗口内
  useLayoutEffect(() => {
    if (!portal || !open) return;
    const btn = btnRef.current;
    const panel = panelRef.current;
    if (!btn || !panel) return;
    const r = btn.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const w = pr.width || 150;
    const h = pr.height || 160;
    // 露出侧栏时以侧栏边缘为基准：面板中心刚好压在边线上，一半在栏外
    let left = overhang
      ? (btn.closest("aside")?.getBoundingClientRect().right ?? r.right) - w / 2
      : align === "right"
        ? r.right - w
        : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    setPos({ left, top });
  }, [portal, open, overhang, align]);

  if (portal) {
    const summaryClass = cx(
      "flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full text-ink3 transition-colors hover:bg-panel2 hover:text-ink",
      compact ? "size-6" : "h-8",
      label ? "px-2.5" : compact ? "" : "w-8",
    );
    return (
      <>
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label || ariaLabel || "更多操作"}
          onClick={() => setOpen((v) => !v)}
          className={summaryClass}
        >
          <MoreHorizontal className={compact ? "size-3.5" : "size-4"} />
          {label ? <span className="text-[13px]">{label}</span> : null}
        </button>
        {open
          ? createPortal(
              <MenuCloseContext.Provider value={() => setOpen(false)}>
                <div
                  ref={panelRef}
                  role="menu"
                  style={{
                    left: pos?.left ?? -9999,
                    top: pos?.top ?? -9999,
                    visibility: pos ? "visible" : "hidden",
                  }}
                  className={cx(
                    "fixed z-50 overflow-hidden rounded-2xl border border-line bg-panel p-1.5 shadow-[var(--shadow-lg)] animate-pop",
                    narrow ? "min-w-[8.75rem]" : "min-w-[11rem]",
                  )}
                >
                  {children}
                </div>
              </MenuCloseContext.Provider>,
              document.body,
            )
          : null}
      </>
    );
  }

  return (
    <details
      ref={ref}
      className={cx("relative shrink-0", className)}
      onToggle={updateFlip}
    >
      <summary
        aria-label={label || ariaLabel || "更多操作"}
        className={cx(
          "flex cursor-pointer list-none items-center justify-center gap-1 rounded-full text-ink3 transition-colors hover:bg-panel2 hover:text-ink [&::-webkit-details-marker]:hidden",
          compact ? "size-6" : "h-8",
          label ? "px-2.5" : compact ? "" : "w-8",
        )}
      >
        <MoreHorizontal className={compact ? "size-3.5" : "size-4"} />
        {label ? <span className="text-[13px]">{label}</span> : null}
      </summary>
      <div
        className={cx(
          "absolute z-40 min-w-[11rem] overflow-hidden rounded-2xl border border-line bg-panel p-1.5 shadow-[var(--shadow-lg)]",
          placement === "top" || flip
            ? "bottom-full mb-2 animate-pop-up"
            : "top-full mt-2 animate-pop",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        {children}
      </div>
    </details>
  );
}

export function MenuItem({
  onClick,
  children,
  tone = "neutral",
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  tone?: "neutral" | "danger";
  disabled?: boolean;
}) {
  const closeMenu = useContext(MenuCloseContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(e) => {
        // 选完就收起菜单，省得用户再点一次
        if (closeMenu) closeMenu();
        else (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
        onClick();
      }}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors disabled:opacity-45",
        tone === "danger" ? "text-bad hover:bg-badsoft" : "text-ink2 hover:bg-panel2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function Progress({ value, max = 1, className }: { value: number; max?: number; className?: string }) {  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
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
        {hint ? <span className="text-[12px] font-normal text-ink3">{hint}</span> : null}
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
      <span className="text-[12px] uppercase tracking-wide text-ink3">{label}</span>
    </div>
  );
}
