import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { readMailbox, uniqueEmail } from "./helpers";

const PASSWORD = "correct horse battery staple";
const CV_FIXTURE = fileURLToPath(new URL("./fixtures/cv.pdf", import.meta.url));

/**
 * M1's acceptance criterion: a new user signs up with email and finishes onboarding, including the
 * CV step (parsed by the worker's `LLM_PROVIDER=fake` stand-in). Runs at 360px.
 */
test("email sign-up through onboarding to home", async ({ page }) => {
  const email = uniqueEmail();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding\/profile$/);
  });

  await test.step("the verification email is sent", async () => {
    const messages = await readMailbox(email);
    expect(messages.map((message) => message.subject)).toContain("Confirm your email for Readi");
    // The link is what the user clicks; the code never emails anything else at sign-up.
    expect(messages[0]?.body).toContain("/api/auth/verify-email?token=");
  });

  await test.step("goals", async () => {
    await page.getByRole("textbox", { name: "What should we call you?" }).fill("Ada Obi");
    await page.getByRole("radio", { name: "Backend engineer" }).check();
    await page.getByRole("radio", { name: "Mid-level" }).check();
    // The picker starts on the role's default variant; this candidate says otherwise (ADR-0015).
    await expect(page.getByRole("radio", { name: "Node.js (Express / NestJS)" })).toBeChecked();
    await page.getByRole("radio", { name: "Go", exact: true }).check();
    await page.getByRole("spinbutton", { name: "Years of professional experience" }).fill("3");
    await page.getByRole("textbox", { name: "What do you work with?" }).fill("Go");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("radio", { name: "Remote role at a foreign company" }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/onboarding\/cv$/);
  });

  await test.step("CV: uploaded, parsed by the worker, shown for review", async () => {
    // The visible control is a button that clicks a hidden input; the file goes to the input.
    await page.locator('input[type="file"]').setInputFiles(CV_FIXTURE);
    // Parsing is a background job: the page polls until it settles.
    await expect(page.getByRole("heading", { name: "Check what we found" })).toBeVisible({
      timeout: 60_000,
    });
    // Skills come back as editable tags; the worker's stand-in reads these from the fixture's text.
    for (const skill of ["Python", "Go", "PostgreSQL"]) {
      await expect(page.getByRole("button", { name: `Remove ${skill}` })).toBeVisible();
    }
    await page.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/onboarding\/consent$/);
  });

  await test.step("privacy choices, then home", async () => {
    await page.getByText("Process my voice during interviews").click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "Hi Ada Obi" })).toBeVisible();
  });

  await test.step("onboarding is complete and the profile kept what was entered", async () => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Your profile", level: 1 })).toBeVisible();
    // The unverified-email banner echoes the address; at 360px it must wrap, not overflow.
    await expect(page.getByText(email, { exact: false }).first()).toBeVisible();
    await page.screenshot({ path: "e2e/.artifacts/profile-360.png", fullPage: true });
    await expect(page.getByText("Backend engineer")).toBeVisible();
    // The variant it kept is the one that was chosen, not the one it started on.
    await expect(page.getByText("Interviewing for")).toBeVisible();
    await expect(page.getByText("Ready", { exact: true })).toBeVisible();
    // Onboarding is finished, so the app stops redirecting to its steps.
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/home$/);
  });

  await test.step("the navigation bar marks where you are, and shows focus on its own grey", async () => {
    await page.goto("/profile");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // The page's focus ring (#C2410C) is 1.46:1 on the bar's grey, so inside the bar it becomes
    // --nav-accent (#FB923C). Tab once from the top: the wordmark is the first thing focusable.
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus-visible");
    await expect(focused).toHaveAttribute("aria-label", "Readi home");
    expect(await focused.evaluate((el) => getComputedStyle(el).outlineColor)).toBe(
      "rgb(251, 146, 60)",
    );
  });

  expect(await horizontalOverflow(page)).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test("a signed-out visitor is sent to log in", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login\?next=%2Fhome$/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

/** True if the page scrolls sideways at this width (CLAUDE.md §5: it must not at 360px). */
async function horizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}
