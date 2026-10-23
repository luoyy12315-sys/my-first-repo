import { getDb, now, uid } from "@/lib/db";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";

const KINDS = ["irrelevant", "outdated", "paywall", "wrong"] as const;

/** 来源反馈：先只落库，用于后续排序降权与质量统计 */
export async function POST(req: Request) {
  try {
    const body = await readJson<{
      sourceId?: string;
      url?: string;
      domain?: string;
      kind?: string;
      note?: string;
    }>(req);
    if (!body.kind || !KINDS.includes(body.kind as (typeof KINDS)[number])) {
      return fail(400, "反馈类型不合法");
    }
    if (!body.url && !body.sourceId) return fail(400, "缺少来源标识");

    getDb()
      .prepare(
        "insert into source_feedback (id, source_id, url, domain, kind, note, created_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        uid("sf_"),
        body.sourceId ?? null,
        body.url ? body.url.slice(0, 2000) : null,
        body.domain ? body.domain.slice(0, 200) : null,
        body.kind,
        body.note ? body.note.slice(0, 500) : null,
        now(),
      );
    return ok({ saved: true });
  } catch (e) {
    return handleError(e);
  }
}
