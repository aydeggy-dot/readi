import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/env/server";
import { forwardedHeaders } from "@/lib/forwarded-headers";

// Runs before the /api/* rewrite to the API: sets the trusted client IP (or none) and the proxy
// secret, and drops any client-supplied copies of those headers (ADR-0009).
export function proxy(request: NextRequest) {
  const headers = forwardedHeaders(request.headers, {
    clientIpHeader: serverEnv.CLIENT_IP_HEADER,
    secret: serverEnv.WEB_PROXY_SECRET,
  });
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/api/:path*"] };
