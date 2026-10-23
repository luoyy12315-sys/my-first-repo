import { actOnReviewItem, listReviewItems, refreshReviewQueue } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    refreshReviewQueue();
    return ok({ items: listReviewItems("open") });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await readJson<{ id?: string; status?: string }>(req);
    if (!body.id || !body.status) return fail(400, "缺少 id 或 status");
    if (!["accepted", "dismissed", "done"].includes(body.status)) return fail(400, "状态不合法");
    actOnReviewItem(body.id, body.status as "accepted" | "dismissed" | "done");
    return ok({ items: listReviewItems("open") });
  } catch (e) {
    return handleError(e);
  }
}
