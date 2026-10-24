"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, Globe, Globe2, Paperclip, Square, Sparkles } from "lucide-react";
import { cx } from "@/components/ui/kit";
import type { AiModelPublic, AiStatus } from "@/lib/types";

const QUICK = [
  { label: "换种讲法", prompt: "这个讲法我还没懂，换一种更直观的讲法，用我能想象的东西打比方。" },
  { label: "看个例子", prompt: "给我一个具体的例子，把上面的内容跑一遍。" },
  { label: "出几道题", prompt: "给我几道练习题，从易到难，先别给答案。" },
];

export default function Composer({
  onSend,
  disabled,
  pending,
  ai,
  placeholder,
  autoFocus,
  onAttach,
  onStop,
  compact,
  models,
  modelId,
  onModelChange,
  webMode = "off",
  webConfigured = true,
  onWebModeChange,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  pending?: boolean;
  ai?: AiStatus;
  placeholder?: string;
  autoFocus?: boolean;
  onAttach?: () => void;
  onStop?: () => void;
  compact?: boolean;
  /** 可选的模型配置（多模型）；为空则只显示当前模型名 */
  models?: AiModelPublic[];
  /** 当前会话使用的模型 id；null/undefined 表示跟随默认 */
  modelId?: string | null;
  onModelChange?: (id: string | null) => void;
  /** 联网检索模式 */
  webMode?: "off" | "manual";
  /** 搜索服务是否已配置（未配置时开关不可用，并说明去哪配） */
  webConfigured?: boolean;
  onWebModeChange?: (mode: "off" | "manual") => void;
}) {
  const [value, setValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭模型选择
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  const grow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    grow();
  }, [value, grow]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled || pending) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(grow);
  };

  const unavailable = ai && !ai.configured;
  const current = modelId ? models?.find((m) => m.id === modelId) : undefined;
  const defaultModel = models?.find((m) => m.isDefault) ?? models?.[0];
  const currentLabel = current?.label ?? defaultModel?.label ?? ai?.label ?? ai?.model ?? "未配置模型";
  const currentModelName = current?.model ?? defaultModel?.model ?? ai?.model ?? "";

  return (
    <div className="flex flex-col gap-2">
      {!compact ? (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)] sm:[mask-image:none]">
          {QUICK.map((q) => (
            <button
              key={q.label}
              disabled={disabled || unavailable}
              onClick={() => onSend(q.prompt)}
              className="shrink-0 rounded-full border border-line bg-panel px-3 py-1.5 text-[12px] text-ink2 transition-colors hover:border-linestrong hover:text-ink disabled:opacity-40"
            >
              {q.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={cx(
          "relative rounded-2xl border bg-panel transition-all",
          "border-line focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_var(--accent-soft)]",
        )}
      >
        <textarea
          ref={ref}
          value={value}
          rows={1}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            unavailable
              ? "模型服务未配置：先到「设置」页填入 API 地址与 Key"
              : placeholder ?? "问点什么。可以直接说「从零开始教我梯度下降」。"
          }
          className="min-h-[80px] w-full resize-none bg-transparent px-4 pt-3.5 pb-12 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink3 disabled:cursor-not-allowed"
        />
        <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {onAttach ? (
              <button
                onClick={onAttach}
                className="rounded-full p-2 text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
                title="上传学习材料"
                aria-label="上传学习材料"
              >
                <Paperclip className="size-4" />
              </button>
            ) : null}
            {onWebModeChange ? (
              <button
                type="button"
                onClick={() => onWebModeChange(webMode === "manual" ? "off" : "manual")}
                disabled={!webConfigured || Boolean(pending)}
                className={cx(
                  "rounded-full p-2 transition-colors disabled:opacity-40",
                  webMode === "manual" && webConfigured
                    ? "bg-accentsoft text-accentink"
                    : "text-ink3 hover:bg-panel2 hover:text-ink",
                )}
                title={
                  webConfigured
                    ? webMode === "manual"
                      ? "联网：开（这一轮会先查证来源）"
                      : "联网：关（点一下开启）"
                    : "还没配置搜索服务：到「设置 → 联网检索」填写"
                }
                aria-label="联网检索"
                aria-pressed={webMode === "manual"}
              >
                {webMode === "manual" && webConfigured ? (
                  <Globe className="size-4" />
                ) : (
                  <Globe2 className="size-4" />
                )}
              </button>
            ) : null}
            {models && models.length > 0 && onModelChange ? (
              <div ref={pickerRef} className="relative ml-1">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  disabled={Boolean(pending)}
                  className={cx(
                    "flex max-w-[10.5rem] items-center gap-1 rounded-full border border-line px-2 py-1 text-[12px] text-ink2 transition-colors",
                    "hover:border-linestrong hover:text-ink disabled:opacity-50",
                  )}
                  title={`当前模型：${currentLabel}${currentModelName ? `（${currentModelName}）` : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={pickerOpen}
                >
                  <Sparkles className="size-3 shrink-0" />
                  <span className="truncate">{currentLabel}</span>
                  <ChevronDown className={cx("size-3 shrink-0 transition-transform", pickerOpen && "rotate-180")} />
                </button>

                {pickerOpen ? (
                  <div
                    role="listbox"
                    className="absolute bottom-full left-0 z-40 mb-2 w-64 overflow-hidden rounded-2xl border border-line bg-panel p-1.5 shadow-[var(--shadow-lg)] animate-pop-up"
                  >
                    <p className="px-2.5 pb-1.5 pt-1 text-[12px] text-ink3">本会话使用的模型</p>
                    <div className="max-h-64 overflow-y-auto">
                      {models.map((m) => {
                        const selected = current ? m.id === current.id : m.id === defaultModel?.id;
                        return (
                          <button
                            key={m.id}
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              // 选默认模型时写 null，让它跟着默认走，而不是钉死
                              onModelChange(m.id === defaultModel?.id ? null : m.id);
                              setPickerOpen(false);
                            }}
                            className={cx(
                              "flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-panel2",
                              selected && "bg-accentsoft/40",
                            )}
                          >
                            <span className="mt-0.5 w-3.5 shrink-0 text-accentink">
                              {selected ? <Check className="size-3.5" /> : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-[13px] text-ink">{m.label}</span>
                                {m.isDefault ? (
                                  <span className="shrink-0 rounded-full bg-panel2 px-1.5 text-[12px] text-ink3">默认</span>
                                ) : null}
                                {!m.configured ? (
                                  <span className="shrink-0 rounded-full bg-warnsoft px-1.5 text-[12px] text-warn">缺 Key</span>
                                ) : null}
                              </span>
                              {m.model !== m.label ? (
                                <span className="mt-0.5 block truncate font-mono text-[12px] text-ink3">
                                  {m.model}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <a
                      href="/settings"
                      className="mt-1 block rounded-xl px-2.5 py-2 text-[12px] text-ink3 hover:bg-panel2 hover:text-ink"
                    >
                      管理模型（添加 / 修改）→
                    </a>
                  </div>
                ) : null}
              </div>
            ) : (
              <span className="ml-1 flex items-center gap-1 text-[12px] text-ink3">
                <Sparkles className="size-3 shrink-0" />
                <span className="truncate">{ai?.configured ? currentLabel : "未配置模型"}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {pending && onStop ? (
              <button
                onClick={onStop}
                className="flex size-9 items-center justify-center rounded-full border border-line bg-panel2 text-ink2 hover:text-ink"
                title="停止生成"
              >
                <Square className="size-3.5" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!value.trim() || disabled || Boolean(unavailable)}
                className="flex size-9 items-center justify-center rounded-full bg-accent text-white transition-all hover:brightness-110 disabled:opacity-35"
                title="发送"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

