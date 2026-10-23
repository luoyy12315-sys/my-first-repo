import { aiStatus } from "@/lib/ai/config";
import { getDb } from "@/lib/db";
import { ok } from "@/lib/api/helpers";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const one = db.prepare("select 1 as ok").get() as { ok: number };
  return ok({
    ok: one.ok === 1,
    db: "sqlite",
    ai: aiStatus(),
    time: Date.now(),
  });
}
