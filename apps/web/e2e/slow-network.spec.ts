import { expect, test, type Page } from "@playwright/test";
import { grantRole, uniqueEmail } from "./helpers";

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

/**
 * The CMS runs on the same phones and the same data as the rest of the product: a content expert
 * in Lagos is not on an office connection either. The list is server-rendered (its filter bar is a
 * GET form); the question form is the heaviest screen in the app, so both are measured.
 */
const SIGNED_IN_PAGES = [
  { path: "/admin/content/questions", name: "CMS question list" },
  { path: "/admin/content/questions/new", name: "CMS question form" },
];

/** What a page cost to load, with the connection already throttled. */
async function measure(page: Page, path: string): Promise<{ loaded: number; kb: number }> {
  const started = Date.now();
  await page.goto(path, { waitUntil: "load" });
  const loaded = Date.now() - started;
  const kb = await page.evaluate(() => {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const sum = entries.reduce((total, e) => total + (e.encodedBodySize || 0), 0);
    return Math.round((sum + (nav.encodedBodySize || 0)) / 1024);
  });
  return { loaded, kb };
}

test.describe("on a Slow 4G connection", () => {
  test.skip(!enabled, "set E2E_SLOW_NETWORK=1 to run");

  for (const { path, name } of PAGES) {
    test(`${name} loads within the budget`, async ({ page, context }) => {
      const client = await context.newCDPSession(page);
      await client.send("Network.enable");
      await client.send("Network.emulateNetworkConditions", SLOW_4G);

      const { loaded, kb } = await measure(page, path);
      console.log(`${name}: ${loaded} ms, ${kb} KB (uncompressed over loopback)`);
      expect(loaded, `${name} took too long on Slow 4G`).toBeLessThan(15_000);
      expect(kb, `${name} is heavier than expected`).toBeLessThan(900);
    });
  }

  test("the CMS on a phone connection", async ({ page, context }) => {
    // Signing up is not what is being measured, so it happens before the throttling.
    const email = uniqueEmail();
    await page.goto("/signup");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill("correct horse battery staple");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/onboarding\/profile$/);
    grantRole(email, "content_expert");

    const client = await context.newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", SLOW_4G);

    for (const { path, name } of SIGNED_IN_PAGES) {
      const { loaded, kb } = await measure(page, path);
      console.log(`${name}: ${loaded} ms, ${kb} KB (uncompressed over loopback)`);
      expect(loaded, `${name} took too long on Slow 4G`).toBeLessThan(15_000);
      expect(kb, `${name} is heavier than expected`).toBeLessThan(900);
    }
  });
});
