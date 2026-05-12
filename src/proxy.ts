import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/setup"];
const STATIC_PREFIX = ["/_next", "/api", "/favicon"];
const COOKIE_NAME = "elkayam_session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (STATIC_PREFIX.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const session = request.cookies.get(COOKIE_NAME);
  if (!session?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
