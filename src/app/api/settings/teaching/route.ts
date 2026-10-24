/**
 * 讲解风格：多张自定义卡片，同一时间只有一个「使用中」。
 *
 * GET  -> { styles, activeId }
 * POST -> { action: "create" | "update" | "delete" | "activate", id?, style? }
 *         返回更新后的 { styles, activeId }
 */
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";
import {
  deleteTeachingStyle,
  getActiveTeachingStyle,
  listTeachingStyles,
  saveTeachingStyle,
  setActiveTeachingStyle,
} from "@/lib/ai/teaching-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function snapshot() {
  return { styles: listTeachingStyles(), activeId: getActiveTeachingStyle()?.id ?? null };
}

export async function GET() {
  try {
    return ok(snapshot());
  } catch (e) {
    return handleError(e);
  }
}

interface Body {
  action?: "create" | "update" | "delete" | "activate";
  id?: string;
  style?: unknown;
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Body>(req);
    const action = body.action;

    if (action === "create" || action === "update") {
      if (action === "update" && !body.id) return fail(400, "缺少要更新的风格 id");
      const style = saveTeachingStyle(
        action === "update" ? { ...(body.style as object), id: body.id } : body.style,
      );
      return ok({ ...snapshot(), style });
    }

    if (action === "delete") {
      if (!body.id) return fail(400, "缺少要删除的风格 id");
      deleteTeachingStyle(body.id);
      return ok(snapshot());
    }

    if (action === "activate") {
      setActiveTeachingStyle(body.id ?? null);
      return ok(snapshot());
    }

    return fail(400, "未知操作");
  } catch (e) {
    // 业务校验错误（超过上限 / 风格已被删）直接回 400，别当 500
    if (e instanceof Error && /最多保存|风格不存在/.test(e.message)) {
      return fail(400, e.message);
    }
    return handleError(e);
  }
}