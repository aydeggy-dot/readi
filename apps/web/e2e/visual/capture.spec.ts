import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { grantRole, seedContent, uniqueEmail } from "../helpers";

/**
 * Before/after screenshots of every screen, for reviewing a visual change (D1 and later UI
 * milestones). Not part of CI: it costs a few minutes and its output is for a human to look at.
 *
 *   E2E_SCREENSHOTS=before pnpm test:e2e visual   # on the base commit
 *   E2E_SCREENSHOTS=after  pnpm test:e2e visual   # on the branch
 *
 * Writes `screenshots/<label>/<screen>-<width>-<theme>.png` at the repo root (gitignored). Runs
 * with reduced motion, so every page is caught in its settled state and two runs are comparable.
 * See e2e/visual/README.md.
 */
const label = process.env.E2E_SCREENSHOTS;
const OUT = fileURLToPath(new URL("../../../../screenshots", import.meta.url));
const CV_FIXTURE = fileURLToPath(new URL("../fixtures/cv.pdf", import.meta.url));
const PASSWORD = "correct horse battery staple";

/** Every screen the app can render, and the account state needed to reach it. */
const SCREENS = [
  ["01-landing", "/", null],
  ["02-signup", "/signup", null],
  ["03-login", "/login", null],
  ["04-phone", "/phone", null],
  ["05-forgot-password", "/forgot-password", null],
  ["06-reset-password", "/reset-password?token=sample-token", null],
  ["07-account-deleted", "/account-deleted", null],
  ["08-not-found", "/no-such-page", null],
  ["09-offline", "/~offline", null],
  ["10-status", "/status", null],
  ["11-onboarding-profile", "/onboarding/profile", "fresh"],
  ["12-onboarding-cv", "/onboarding/cv", "mid"],
  ["13-onboarding-consent", "/onboarding/consent", "mid"],
  ["14-home", "/home", "done"],
  ["15-profile", "/profile", "done"],
  ["16-profile-edit", "/profile/edit", "done"],
  ["17-profile-cv", "/profile/cv", "done"],
  ["18-profile-consent", "/profile/consent", "done"],
  ["19-profile-account", "/profile/account", "done"],
  ["20-admin", "/admin", "done"],
  ["21-content-home", "/admin/content", "expert"],
  ["22-content-questions", "/admin/content/questions", "expert"],
  ["23-content-question-new", "/admin/content/questions/new", "expert"],
  ["24-content-rubrics", "/admin/content/rubrics", "expert"],
  ["25-content-rubric-new", "/admin/content/rubrics/new", "expert"],
  ["26-content-lessons", "/admin/content/lessons", "expert"],
  ["27-content-tracks", "/admin/content/tracks", "expert"],
  ["28-content-topics", "/admin/content/topics", "expert"],
  // The catalogue (M2.5, ADR-0015). The role editor is the widest form in the CMS — every level
  // and every stack, each with a Default radio — so 360px is worth a picture of.
  ["29-content-roles", "/admin/content/roles", "expert"],
  ["30-content-role-new", "/admin/content/roles/new", "expert"],
  ["31-content-levels", "/admin/content/levels", "expert"],
  ["32-content-level-new", "/admin/content/levels/new", "expert"],
  ["33-content-stacks", "/admin/content/stacks", "expert"],
  ["34-content-stack-new", "/admin/content/stacks/new", "expert"],
] as const satisfies ReadonlyArray<readonly [string, string, StateKey | null]>;

/** 360px is the narrowest width we support; 1280px is where the desktop layout applies. */
const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 1280, height: 860 },
] as const;
const THEMES = ["light", "dark"] as const;

type StateKey = "fresh" | "mid" | "done" | "expert";
type States = Record<StateKey, Awaited<ReturnType<BrowserContext["storageState"]>>>;

async function signUp(page: Page, address: string): Promise<void> {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email" }).fill(address);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding\/profile$/);
}

async function fillProfile(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox", { name: "What should we call you?" }).fill(name);
  await page.getByRole("radio", { name: "Backend engineer" }).check();
  await page.getByRole("radio", { name: "Mid-level" }).check();
  await page.getByRole("spinbutton", { name: "Years of professional experience" }).fill("3");
  /*
   * The variant the candidate is interviewing for, and then the free-text list of what else they
   * know — two different fields since M2.5 (ADR-0015). This step named "Your main stack", which
   * stopped existing when `stack` became `technologies`, and nothing noticed for two phases
   * because this spec only runs when `E2E_SCREENSHOTS` is set. A screen it cannot reach is a
   * screen it cannot photograph, so the captures are only as current as this function.
   */
  await page.getByRole("radio", { name: "Go", exact: true }).check();
  await page.getByRole("textbox", { name: "What do you work with?" }).fill("Go");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("radio", { name: "Remote role at a foreign company" }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/onboarding\/cv$/);
}

/**
 * Four accounts, each parked at the point that makes a group of screens reachable. They are made
 * once and replayed as cookies, so the captures themselves never mutate anything.
 */
async function seedAccounts(browser: Browser): Promise<States> {
  const states: Partial<States> = {};

  const fresh = await browser.newContext();
  await signUp(await fresh.newPage(), uniqueEmail());
  states.fresh = await fresh.storageState();
  await fresh.close();

  const mid = await browser.newContext();
  const midPage = await mid.newPage();
  await signUp(midPage, uniqueEmail());
  await fillProfile(midPage, "Chidi Nwosu");
  states.mid = await mid.storageState();
  await mid.close();

  const done = await browser.newContext();
  const donePage = await done.newPage();
  const address = uniqueEmail();
  await signUp(donePage, address);
  await fillProfile(donePage, "Ada Obi");
  await donePage.locator('input[type="file"]').setInputFiles(CV_FIXTURE);
  await donePage.getByRole("heading", { name: "Check what we found" }).waitFor({ timeout: 60_000 });
  await donePage.getByRole("link", { name: "Continue" }).click();
  await donePage.waitForURL(/\/onboarding\/consent$/);
  await donePage.getByText("Process my voice during interviews").click();
  await donePage.getByRole("button", { name: "Continue" }).click();
  await donePage.waitForURL(/\/home$/);
  grantRole(address, "admin");
  await donePage.reload();
  states.done = await done.storageState();
  await done.close();

  // The CMS is only worth looking at with content in it, so the seed bank is imported once and
  // an account is given the role that can see it.
  const expert = await browser.newContext();
  const expertPage = await expert.newPage();
  const expertAddress = uniqueEmail();
  await signUp(expertPage, expertAddress);
  await fillProfile(expertPage, "Ngozi Bello");
  seedContent();
  grantRole(expertAddress, "content_expert");
  states.expert = await expert.storageState();
  await expert.close();

  return states as States;
}

test.describe("visual review", () => {
  test.skip(!label, "set E2E_SCREENSHOTS=<label> to capture");

  test(`every screen at ${VIEWPORTS.map((v) => `${v.width}px`).join(" and ")}, light and dark`, async ({
    browser,
  }) => {
    /*
     * 34 screens × 2 widths × 2 themes is 136 full-page screenshots, and the whole run takes about
     * two and a half minutes. The ceiling is this high because the failure it guards against is a
     * *hang* — a locator in `seedAccounts` that will never match, which is how this spec spent
     * twenty minutes producing nothing when a field was renamed under it. A generous timeout costs
     * nothing on a run that is skipped unless `E2E_SCREENSHOTS` is set.
     */
    test.setTimeout(20 * 60 * 1000);
    const states = await seedAccounts(browser);
    const dir = `${OUT}/${label ?? "unlabelled"}`;
    let taken = 0;

    for (const viewport of VIEWPORTS) {
      for (const colorScheme of THEMES) {
        for (const key of [null, "fresh", "mid", "done", "expert"] as const) {
          const screens = SCREENS.filter(([, , state]) => state === key);
          const context = await browser.newContext({
            viewport,
            colorScheme,
            reducedMotion: "reduce",
            storageState: key ? states[key] : undefined,
          });
          const page = await context.newPage();
          for (const [name, path] of screens) {
            await page.goto(path, { waitUntil: "networkidle" });
            await page.screenshot({
              path: `${dir}/${name}-${viewport.width}-${colorScheme}.png`,
              fullPage: true,
            });
            taken += 1;
          }
          await context.close();
        }
        console.log(`  ${viewport.width}px ${colorScheme}: done`);
      }
    }

    console.log(`${taken} screenshots in ${dir}`);
    expect(taken).toBe(SCREENS.length * VIEWPORTS.length * THEMES.length);
  });
});
