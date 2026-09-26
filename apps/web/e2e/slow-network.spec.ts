import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, grantRole, signUpAndOnboard, uniqueEmail } from "./helpers";

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

  test("the CMS on a phone connection", async ({ page, browser }) => {
    // Signing up is not what is being measured, so it happens first, unthrottled.
    const email = uniqueEmail();
    await page.goto("/signup");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/onboarding\/profile$/);
    grantRole(email, "content_expert");

    // A *fresh* context with those cookies: measuring in the context that just signed up would
    // count chunks the browser already had, which is how a 250 KB page reports 800 KB.
    const cold = await browser.newContext({ storageState: await page.context().storageState() });
    const coldPage = await cold.newPage();
    const client = await cold.newCDPSession(coldPage);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", SLOW_4G);

    try {
      for (const { path, name } of SIGNED_IN_PAGES) {
        const { loaded, kb } = await measure(coldPage, path);
        console.log(`${name}: ${loaded} ms, ${kb} KB (uncompressed over loopback)`);
        expect(loaded, `${name} took too long on Slow 4G`).toBeLessThan(15_000);
        expect(kb, `${name} is heavier than expected`).toBeLessThan(900);
      }
    } finally {
      await cold.close();
    }
  });

  /**
   * The interview screen is the one a candidate sits on for fifteen minutes, on their own data, so
   * its weight matters more than any other page in the product. It has its own test because it
   * needs a live session: the id is only known once one exists, and the screen has to be *started*
   * before it is measured or the figure is for an empty transcript nobody ever sees.
   *
   * It is also where the budget could quietly go: no markdown renderer on this route, and Monaco,
   * MediaPipe and LiveKit are all still ahead of us (CLAUDE.md §5).
   */
  test("the interview screen on a phone connection", async ({ page, browser }) => {
    await signUpAndOnboard(page);
    await page.getByRole("button", { name: "Start the diagnostic" }).click();
    await page.waitForURL(/\/interview\/[0-9a-f-]{36}$/);
    const url = new URL(page.url()).pathname;
    // Started, and with one answer in it, so the measured page is a transcript rather than a stub.
    await expect(page.getByText("Question 1 of 4")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("textbox", { name: "Your answer" }).fill("We split it into two services.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sending…" })).toHaveCount(0, {
      timeout: 60_000,
    });

    const cold = await browser.newContext({ storageState: await page.context().storageState() });
    const coldPage = await cold.newPage();
    const client = await cold.newCDPSession(coldPage);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", SLOW_4G);

    try {
      for (const { path, name } of [
        { path: "/practice", name: "Practice list" },
        { path: url, name: "interview screen" },
      ]) {
        const { loaded, kb } = await measure(coldPage, path);
        console.log(`${name}: ${loaded} ms, ${kb} KB (uncompressed over loopback)`);
        expect(loaded, `${name} took too long on Slow 4G`).toBeLessThan(15_000);
        expect(kb, `${name} is heavier than expected`).toBeLessThan(900);
      }
    } finally {
      await cold.close();
    }
  });
});
