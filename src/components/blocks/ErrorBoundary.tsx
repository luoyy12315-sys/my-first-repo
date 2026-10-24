"use client";

import React, { type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  /** 出错时的替身 UI，默认是一条内联提示 */
  fallback?: (error: Error) => ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * 局部错误边界。
 * 一个教学组件（或一段模型输出）渲染失败，不应该把整页拖垮——
 * Next 的页面级错误页会直接换掉整个应用，用户体验等同于宕机。
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[render-error]", this.props.label ?? "component", error.message, info.componentStack?.slice(0, 400));
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error);
    return (
      <div className="rounded-xl border border-bad/30 bg-badsoft/40 px-3.5 py-3 text-[12.5px] leading-relaxed text-bad">
        <p className="flex items-center gap-1.5 font-medium">
          <AlertTriangle className="size-3.5" />
          这个组件渲染失败了
        </p>
        <p className="mt-1 text-ink2">
          其他内容不受影响。可以刷新页面重试，或让 AI 重新生成。
        </p>
        <p className="mt-1 font-mono text-[12px] text-ink3">{error.message.slice(0, 160)}</p>
      </div>
    );
  }
}
