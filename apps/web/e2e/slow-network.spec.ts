import { expect, test, type CDPSession, type Page } from "@playwright/test";
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

/**
 * What a page cost to load **cold**, with the connection already throttled.
 *
 * Three things here are the M3 leftover this finally fixes (`docs/progress/2026-09-26-m3.md`: "the
 * CMS form reported a *negative* duration this run"). The old version started a wall clock, called
 * `page.goto` and subtracted — which measures our own navigation call, not the page load, and on a
 * route the **Next router had already prefetched** measures the swap instead. That is how a figure
 * ends up implausibly small, and how the interview screen came out at 1221 ms when nothing else was
 * under 2800.
 *
 * So the load is made genuinely cold and the browser is asked what it cost, rather than us timing
 * it from outside:
 *
 * 1. **Leave the app first.** `about:blank` is a different document, so what follows is a real
 *    navigation rather than a client-side transition into something already fetched.
 * 2. **Drop the HTTP cache**, because the question this spec asks is what a first visit costs on a
 *    phone connection. A warm cache answers a different question and answers it flatteringly.
 * 3. **Take `PerformanceNavigationTiming.duration`**, which is `loadEventEnd - startTime` measured
 *    inside the page. It is only final once the load event has fired, which `waitUntil: "load"`
 *    has waited for — read any earlier it is 0, and a figure derived from a zero `loadEventEnd` is
 *    where a negative duration comes from.
 *
 * It also reports whether the navigation really transferred anything, so a measurement that was
 * served from cache announces itself instead of quietly passing.
 */
async function measure(
  page: Page,
  path: string,
  client: CDPSession,
): Promise<{ loaded: number; kb: number; cold: boolean }> {
  await page.goto("about:blank");
  await client.send("Network.clearBrowserCache");
  await page.goto(path, { waitUntil: "load" });
  return page.evaluate(() => {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const sum = entries.reduce((total, e) => total + (e.encodedBodySize || 0), 0);
    return {
      loaded: Math.round(nav.duration),
      kb: Math.round((sum + (nav.encodedBodySize || 0)) / 1024),
      cold: nav.transferSize > 0,
    };
  });
}

test.describe("on a Slow 4G connection", () => {
  test.skip(!enabled, "set E2E_SLOW_NETWORK=1 to run");

  for (const { path, name } of PAGES) {
    test(`${name} loads within the budget`, async ({ page, context }) => {
      const client = await context.newCDPSession(page);
      await client.send("Network.enable");
      await client.send("Network.emulateNetworkConditions", SLOW_4G);

      const { loaded, kb, cold } = await measure(page, path, client);
      console.log(`${name}: ${loaded} ms, ${kb} KB (uncompressed over loopback)`);
      expect(cold, `${name} was served from cache, so the figure is not a first visit`).toBe(true);
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
        const { loaded, kb, cold } = await measure(coldPage, path, client);
        console.log(`${name}: ${loaded} ms, ${kb} KB (uncompressed over loopback)`);
        expect(cold, `${name} was served from cache, so the figure is not a first visit`).toBe(
          true,
        );
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
        const { loaded, kb, cold } = await measure(coldPage, path, client);
        console.log(`${name}: ${loaded} ms, ${kb} KB (uncompressed over loopback)`);
        expect(cold, `${name} was served from cache, so the figure is not a first visit`).toBe(
          true,
        );
        expect(loaded, `${name} took too long on Slow 4G`).toBeLessThan(15_000);
        expect(kb, `${name} is heavier than expected`).toBeLessThan(900);
      }
    } finally {
      await cold.close();
    }
  });
});
