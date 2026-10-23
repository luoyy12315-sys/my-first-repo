import fs from "node:fs";
import path from "node:path";
import { addMaterialChunks, createMaterial, getPlan, listMaterials } from "@/lib/db/repo";
import { dataDir } from "@/lib/db";
import { chunkText, parseMaterial } from "@/lib/materials/parse";
import { fail, handleError, ok } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ materials: listMaterials() });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(400, "没有收到文件");
    if (file.size === 0) return fail(400, "文件为空");

    const planIdRaw = form.get("planId");
    const planId = typeof planIdRaw === "string" && planIdRaw ? planIdRaw : null;
    if (planId && !getPlan(planId)) return fail(400, "计划不存在");

    const parsed = await parseMaterial(file);
    // 只有解析成功的材料才落盘：失败/不支持的格式不占磁盘，也不留无法管理的垃圾
    let filePath: string | null = null;
    if (parsed.status === "parsed") {
      const uploadDir = path.join(dataDir(), "uploads");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_")}`;
      filePath = path.join(uploadDir, safeName);
      fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
    }

    const id = createMaterial({
      name: file.name,
      mime: file.type || null,
      size: file.size,
      path: filePath,
      status: parsed.status,
      textChars: parsed.text.length,
      error: parsed.error ?? null,
      planId,
    });

    if (parsed.status === "parsed" && parsed.text) {
      addMaterialChunks(id, chunkText(parsed.text));
    }

    return ok({
      id,
      status: parsed.status,
      chars: parsed.text.length,
      error: parsed.error ?? null,
      preview: parsed.text.slice(0, 300),
    });
  } catch (e) {
    return handleError(e);
  }
}
