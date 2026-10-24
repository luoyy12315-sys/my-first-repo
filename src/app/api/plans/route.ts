import { createPlan, listPlans } from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ plans: listPlans() });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{ title?: string; note?: string }>(req);
    if (!body.title?.trim()) return fail(400, "计划名称不能为空");
    const plan = createPlan({
      title: body.title.trim(),
      note: body.note,
      status: "draft",
      courses: [],
    });
    return ok({ plan });
  } catch (e) {
    return handleError(e);
  }
}
