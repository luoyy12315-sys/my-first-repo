import { NextResponse, type NextRequest } from "next/server";

/**
 * 单用户本地模式默认不校验。
 * 一旦设置 APP_ACCESS_TOKEN（公网部署时必须），所有页面与接口都要带令牌：
 *   - 首次访问 http://host/?token=xxx 会写入 HttpOnly Cookie 后跳转
 *   - 之后由 Cookie 或 x-app-token 头通过校验
 */
export function proxy(req: NextRequest) {
  const token = process.env.APP_ACCESS_TOKEN;
  if (!token) return NextResponse.next();

  const { pathname, searchParams } = req.nextUrl;
  const given =
    req.headers.get("x-app-token") ??
    req.cookies.get("app_token")?.value ??
    searchParams.get("token") ??
    "";

  if (given && given === token) {
    if (searchParams.get("token")) {
      const url = req.nextUrl.clone();
      url.searchParams.delete("token");
      const res = NextResponse.redirect(url);
      res.cookies.set("app_token", token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return res;
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未授权：需要访问令牌" }, { status: 401 });
  }
  return new NextResponse(
    "未授权。请在地址后加上 ?token=你的访问令牌（只用于首次验证，之后会写入 Cookie）。",
    { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
