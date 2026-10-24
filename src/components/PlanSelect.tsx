"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlanDTO } from "@/lib/types";

let cache: PlanDTO[] | null = null;

/** 计划列表：各页面按需取用，删除/新建计划后通过 plans:changed 刷新 */
export function usePlans() {
  const [plans, setPlans] = useState<PlanDTO[]>(cache ?? []);
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/plans", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { plans: PlanDTO[] };
        cache = data.plans;
        setPlans(data.plans);
      }
    } catch {
      /* 计划列表属于辅助信息，失败时保持旧值 */
    }
  }, []);
  useEffect(() => {
    void reload();
    const onChange = () => void reload();
    window.addEventListener("plans:changed", onChange);
    return () => window.removeEventListener("plans:changed", onChange);
  }, [reload]);
  return { plans, reload };
}

/**
 * 计划下拉：
 * - mode="assign"：未归类 / 各计划（用于给单条会话、材料选归属）
 * - mode="filter"：全部计划 / 各计划 / 未归类（用于页面筛选）
 */
export function PlanSelect({
  plans,
  value,
  onChange,
  mode = "assign",
  className,
  ariaLabel,
  title,
}: {
  plans: PlanDTO[];
  value: string;
  onChange: (value: string) => void;
  mode?: "assign" | "filter";
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  // 草稿还没有正式生效，不能被会话/材料误挂上去
  const options = mode === "assign" ? plans.filter((p) => p.status !== "draft") : plans;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      title={title ?? "学习计划"}
      aria-label={ariaLabel ?? "学习计划"}
    >
      {mode === "filter" ? <option value="all">全部计划</option> : <option value="">未归类</option>}
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title}
          {p.status === "draft" ? "（草稿）" : p.status === "paused" ? "（暂停）" : ""}
        </option>
      ))}
      {mode === "filter" ? <option value="none">未归类</option> : null}
    </select>
  );
}