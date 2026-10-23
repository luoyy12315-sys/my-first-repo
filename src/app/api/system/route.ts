import fs from "node:fs";
import path from "node:path";
import { dbPath, getDb } from "@/lib/db";
import { ok } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const dbFile = dbPath();
  let size = 0;
  try {
    size = fs.statSync(dbFile).size;
  } catch {
    /* ignore */
  }
  const counts = {
    sessions: (db.prepare("select count(*) n from sessions").get() as { n: number }).n,
    messages: (db.prepare("select count(*) n from messages").get() as { n: number }).n,
    concepts: (db.prepare("select count(*) n from concepts").get() as { n: number }).n,
    exercises: (db.prepare("select count(*) n from exercises").get() as { n: number }).n,
    attempts: (db.prepare("select count(*) n from attempts").get() as { n: number }).n,
    evidence: (db.prepare("select count(*) n from evidence").get() as { n: number }).n,
  };
  // 只暴露相对位置，不泄露本机绝对路径与平台信息
  const rel = path.relative(process.cwd(), dbFile).split(path.sep).join("/");
  return ok({
    dbPath: rel || "data/lumina.db",
    dbSizeKb: Math.round(size / 1024),
    counts,
    node: process.version,
  });
}
