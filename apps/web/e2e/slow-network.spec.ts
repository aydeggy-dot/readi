import { expect, test } from "@playwright/test";

/**
 * Page weight and load time on a throttled connection (CLAUDE.md §5: mobile-first, low bandwidth).
 * Timing depends on the machine, so this is not part of CI: run it on demand with
 *   E2E_SLOW_NETWORK=1 pnpm test:e2e slow-network
 * The budget below is deliberately loose — it is a guard against a page suddenly getting heavy,
 * not a benchmark. The numbers it prints are the useful part.
 */
const enabled = process.env.E2E_SLOW_NETWORK === "1";

// Chrome DevTools' "Slow 4G" preset (what used to be called Fast 3G).
const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 562.5,
};

const PAGES = [
  { path: "/", name: "landing" },
  { path: "/signup", name: "sign-up" },
  { path: "/login", name: "log in" },
];

test.describe("on a Slow 4G connection", () => {
  test.skip(!enabled, "set E2E_SLOW_NETWORK=1 to run");

  for (const { path, name } of PAGES) {
    test(`${name} loads within the budget`, async ({ page, context }) => {
      const client = await context.newCDPSession(page);
      await client.send("Network.enable");
      await client.send("Network.emulateNetworkConditions", SLOW_4G);

      const started = Date.now();
      await page.goto(path, { waitUntil: "load" });
      const loaded = Date.now() - started;
      const transferredKB = await page.evaluate(() => {
        const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        const sum = entries.reduce((total, e) => total + (e.encodedBodySize || 0), 0);
        return Math.round((sum + (nav.encodedBodySize || 0)) / 1024);
      });

      console.log(`${name}: ${loaded} ms, ${transferredKB} KB (uncompressed over loopback)`);
      expect(loaded, `${name} took too long on Slow 4G`).toBeLessThan(15_000);
      expect(transferredKB, `${name} is heavier than expected`).toBeLessThan(900);
    });
  }
});
