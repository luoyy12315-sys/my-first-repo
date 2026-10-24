import { listConcepts, listMaterials, listPlans, listSessions } from "@/lib/db/repo";
import { handleError, ok } from "@/lib/api/helpers";
import type { SearchGroup, SearchHit } from "@/lib/types";

export const runtime = "nodejs";

/**
 * 全局搜索：对话 / 计划 / 知识点 / 材料一起搜，按分组返回。
 * 数据量在本机 SQLite 上很小，直接内存过滤，比拼 SQL LIKE 更好维护。
 */
export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (!q) return ok({ q: "", groups: [] as SearchGroup[] });

    const needle = q.toLowerCase();
    const hit = (...fields: (string | null | undefined)[]) =>
      fields.some((f) => (f ?? "").toLowerCase().includes(needle));

    const sessions: SearchHit[] = listSessions(200)
      .filter((s) => s.messageCount > 0 && hit(s.title, s.planTitle))
      .slice(0, 8)
      .map((s) => ({
        id: s.id,
        title: s.title,
        meta: s.planTitle ? `对话 · ${s.planTitle}` : "对话",
        href: `/s/${s.id}`,
        at: s.updatedAt,
      }));

    const plans: SearchHit[] = listPlans()
      .filter((p) => hit(p.title, p.note))
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        title: p.title,
        meta: `计划 · ${p.items.length} 门课程`,
        href: `/plan/${p.id}`,
        at: p.updatedAt,
      }));

    const concepts: SearchHit[] = listConcepts({ limit: 500 })
      .filter((c) => hit(c.name, c.topicName, c.definition))
      .slice(0, 8)
      .map((c) => ({
        id: c.id,
        title: c.name,
        meta: `知识点 · ${c.topicName || "未归类"}`,
        href: `/archive?tab=concepts&c=${encodeURIComponent(c.id)}`,
      }));

    const materials: SearchHit[] = listMaterials()
      .filter((m) => hit(m.name, m.planTitle))
      .slice(0, 6)
      .map((m) => ({
        id: m.id,
        title: m.name,
        meta: `材料 · ${m.planTitle || "未归类"}`,
        href: "/archive?tab=materials",
        at: m.createdAt,
      }));

    const groups = ([
      { key: "sessions", label: "对话", hits: sessions },
      { key: "plans", label: "计划", hits: plans },
      { key: "concepts", label: "知识点", hits: concepts },
      { key: "materials", label: "材料", hits: materials },
    ] as SearchGroup[]).filter((g) => g.hits.length > 0);

    return ok({ q, groups });
  } catch (e) {
    return handleError(e);
  }
}