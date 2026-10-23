/** 运行在非安全上下文（如通过局域网 IP 访问 http://10.x.x.x）时，
 *  crypto.randomUUID 不存在，会导致提交按钮直接抛异常。
 *  这里给一个退化实现，保证功能可用。
 */
export function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function formatDay(ts: number): string {
  return new Date(ts).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export interface PlanGroup<T> {
  planId: string | null;
  planTitle: string;
  items: T[];
}

/** 按所属计划分组；未归类的放在最后，组内保持传入顺序 */
export function groupByPlan<T extends { planId?: string | null; planTitle?: string | null }>(
  items: T[],
): PlanGroup<T>[] {
  const map = new Map<string | null, PlanGroup<T>>();
  for (const item of items) {
    const key = item.planId ?? null;
    const group = map.get(key) ?? {
      planId: key,
      planTitle: key ? item.planTitle ?? "已删除的计划" : "未归类",
      items: [],
    };
    group.items.push(item);
    map.set(key, group);
  }
  const groups = [...map.values()];
  return [...groups.filter((g) => g.planId), ...groups.filter((g) => !g.planId)];
}
