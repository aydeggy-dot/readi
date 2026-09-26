import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/env/server";
import { forwardedHeaders } from "@/lib/forwarded-headers";
import { hasSessionCookie } from "@/lib/session-cookie";

// Two jobs, both before rendering or rewriting:
// - /api/*: set the trusted client IP (or none) and the proxy secret, dropping client-supplied
//   copies of those headers (ADR-0009).
// - Signed-in pages: send visitors without a session cookie to /login. This is only a fast path;
//   pages still resolve the session with the API, and the API enforces access (ADR-0012).
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    const headers = forwardedHeaders(request.headers, {
      clientIpHeader: serverEnv.CLIENT_IP_HEADER,
      secret: serverEnv.WEB_PROXY_SECRET,
    });
    return NextResponse.next({ request: { headers } });
  }

  if (!hasSessionCookie(request.cookies.getAll().map((cookie) => cookie.name))) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/home",
    "/onboarding/:path*",
    "/profile/:path*",
    "/practice/:path*",
    "/interview/:path*",
    "/admin/:path*",
  ],
};
