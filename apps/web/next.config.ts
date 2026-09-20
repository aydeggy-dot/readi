import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";
import { parseClientEnv } from "./src/env/schema";
import { serverEnv } from "./src/env/server";

// Fail fast on invalid configuration (server env is validated on import).
parseClientEnv(process.env);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The end-to-end run builds into its own folder so it never disturbs a running `next dev`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  // The browser talks to the API same-origin through /api/* so auth cookies stay first-party
  // (ADR-0005, ADR-0009). The API serves everything under /api too, so the path is kept as-is.
  rewrites() {
    return Promise.resolve([
      { source: "/api/:path*", destination: `${serverEnv.API_INTERNAL_URL}/api/:path*` },
    ]);
  },
};

export default withSerwist(nextConfig);
