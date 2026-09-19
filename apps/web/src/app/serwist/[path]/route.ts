import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// Builds the service worker (src/app/sw.ts) with esbuild and serves it at /serwist/sw.js.
// The git revision versions the precached offline page.
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    // Precache only the offline fallback: installing the service worker must not download every JS
    // chunk (incl. lazily loaded SDKs) on slow, metered connections. Visited assets are cached at
    // runtime by `defaultCache` in sw.ts.
    globPatterns: [],
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  },
);
