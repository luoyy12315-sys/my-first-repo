import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, init);
}

export function fail(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function requireString(v: unknown, field: string, max = 20000): string {
  if (typeof v !== "string" || !v.trim()) throw new ApiError(400, `${field} 不能为空`);
  if (v.length > max) throw new ApiError(400, `${field} 过长`);
  return v.trim();
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function handleError(e: unknown) {
  if (e instanceof ApiError) {
    return fail(e.status, e.message, e.code ? { code: e.code } : {});
  }
  const msg = e instanceof Error ? e.message : "未知错误";
  console.error("[api]", msg);
  return fail(500, "服务器处理失败：" + msg);
}

/** 简单令牌保护：仅在设置了 APP_ACCESS_TOKEN 时启用（公网部署场景） */
export function checkAccess(req: Request): boolean {
  const token = process.env.APP_ACCESS_TOKEN;
  if (!token) return true;
  const header = req.headers.get("x-app-token") ?? "";
  return header === token;
}
