import { listConcepts, listDuplicateConceptGroups, listTopics, mergeDuplicateConcepts } from "@/lib/db/repo";
import { handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const groups = listDuplicateConceptGroups();
    return ok({ groups, duplicateConcepts: groups.reduce((n, g) => n + g.count - 1, 0) });
  } catch (e) {
    return handleError(e);
  }
}

/** 合并同名知识点（保留证据最多的一个，按合并后的全部证据重算） */
export async function POST() {
  try {
    const result = mergeDuplicateConcepts();
    return ok({
      ...result,
      concepts: listConcepts({ limit: 500 }),
      topics: listTopics(),
      duplicateConcepts: 0,
    });
  } catch (e) {
    return handleError(e);
  }
}