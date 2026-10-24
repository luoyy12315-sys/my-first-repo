import { getTeachingProfile, saveTeachingProfile } from "@/lib/ai/teaching-profile";
import { handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ profile: getTeachingProfile() });
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await readJson<unknown>(req);
    const profile = saveTeachingProfile(body);
    return ok({ profile });
  } catch (e) {
    return handleError(e);
  }
}
