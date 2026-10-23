import {
  countEmptyConcepts,
  listConcepts,
  listDuplicateConceptGroups,
  listTopics,
  refreshReviewQueue,
} from "@/lib/db/repo";
import { handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    refreshReviewQueue();
    const url = new URL(req.url);
    const topicId = url.searchParams.get("topicId") ?? undefined;
    const status = url.searchParams.get("status");
    let concepts = listConcepts({ topicId, limit: 500 });
    if (status) concepts = concepts.filter((c) => c.status === status);
    const duplicateGroups = listDuplicateConceptGroups();
    return ok({
      concepts,
      topics: listTopics(),
      duplicateConcepts: duplicateGroups.reduce((n, g) => n + g.count - 1, 0),
      duplicateGroups: duplicateGroups.length,
      empty: countEmptyConcepts(),
    });
  } catch (e) {
    return handleError(e);
  }
}
