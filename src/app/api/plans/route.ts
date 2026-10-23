import { listPlans } from "@/lib/db/repo";
import { handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ plans: listPlans() });
  } catch (e) {
    return handleError(e);
  }
}
