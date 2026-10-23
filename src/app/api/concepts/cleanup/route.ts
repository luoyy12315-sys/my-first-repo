import { countEmptyConcepts, deleteEmptyConcepts, listConcepts, listTopics } from "@/lib/db/repo";
import { handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok({ empty: countEmptyConcepts() });
  } catch (e) {
    return handleError(e);
  }
}

/** 一次性清理所有"没有任何作答证据"的知识点 */
export async function POST() {
  try {
    const removed = deleteEmptyConcepts();
    return ok({
      removed,
      concepts: listConcepts({ limit: 500 }),
      topics: listTopics(),
      empty: countEmptyConcepts(),
    });
  } catch (e) {
    return handleError(e);
  }
}
