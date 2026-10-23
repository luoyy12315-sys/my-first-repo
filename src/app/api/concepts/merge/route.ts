import { getConcept, listConcepts, listTopics, mergeConceptsInto } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";

/** 手动合并知识点：把 duplicateIds 合并进 survivorId（用于近义词/叫法不同的重复档案） */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ survivorId?: string; duplicateIds?: string[] }>(req);
    if (!body.survivorId) return fail(400, "缺少 survivorId");
    if (!Array.isArray(body.duplicateIds) || !body.duplicateIds.length) {
      return fail(400, "缺少要合并的知识点");
    }
    if (!getConcept(body.survivorId)) return fail(404, "保留的知识点不存在");
    const validIds = body.duplicateIds.filter(
      (id): id is string => typeof id === "string" && id !== body.survivorId && Boolean(getConcept(id)),
    );
    if (!validIds.length) return fail(400, "没有可合并的知识点");
    const { merged } = mergeConceptsInto(body.survivorId, validIds);
    return ok({
      merged,
      concepts: listConcepts({ limit: 500 }),
      topics: listTopics(),
    });
  } catch (e) {
    return handleError(e);
  }
}
