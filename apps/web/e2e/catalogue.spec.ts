import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { grantRole, uniqueEmail } from "./helpers";

const PASSWORD = "correct horse battery staple";

/**
 * M2.5's point, through the CMS a person actually uses: **a role is content**. An admin adds a
 * level and a role, publishes them, and a candidate is offered them — with no code change, no
 * migration and no deploy (ADR-0015).
 *
 * The two refusals matter as much as the happy path, because they are what stops the catalogue
 * becoming a picker with nothing in it:
 *
 * - a role whose levels are all still drafts cannot be published;
 * - a level a published role still offers cannot be retired.
 *
 * Runs at 360px like the rest of the suite. Slugs carry a random suffix because the e2e database
 * outlives a run, and everything this test creates is its own.
 */
const suffix = randomUUID().slice(0, 8);
const LEVEL_SLUG = `e2e-level-${suffix}`;
const LEVEL_NAME = `Principal ${suffix}`;
const STACK_SLUG = `e2e-stack-${suffix}`;
const STACK_NAME = `Elixir / Phoenix ${suffix}`;
const ROLE_SLUG = `e2e-role-${suffix}`;
const ROLE_NAME = `Platform engineer ${suffix}`;

async function signUp(page: Page, address: string): Promise<void> {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email" }).fill(address);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding\/profile$/);
}

/** Publish and retire ask twice: the panel's button, then the one in the confirmation. */
async function confirm(page: Page, action: "Publish" | "Retire"): Promise<void> {
  await page.getByRole("button", { name: action }).first().click();
  await page.getByRole("button", { name: action }).last().click();
}

test("an admin adds a role to the catalogue, and a candidate is offered it", async ({
  browser,
}) => {
  test.setTimeout(3 * 60 * 1000);

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminEmail = uniqueEmail();

  await test.step("an admin signs in", async () => {
    await signUp(admin, adminEmail);
    grantRole(adminEmail, "admin");
    await admin.goto("/admin/content/roles");
    await expect(admin.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();
  });

  await test.step("adds a level", async () => {
    await admin.goto("/admin/content/levels/new");
    await admin.getByRole("textbox", { name: "Name" }).fill(LEVEL_NAME);
    await admin.getByRole("textbox", { name: "Slug" }).fill(LEVEL_SLUG);
    await admin.getByRole("spinbutton", { name: "Rank" }).fill("30");
    await admin.getByRole("button", { name: "Create" }).click();
    await admin.waitForURL(/\/admin\/content\/levels\/[0-9a-f-]{36}$/);
    await expect(admin.getByTestId("status-draft")).toBeVisible();
  });

  await test.step("and a stack", async () => {
    await admin.goto("/admin/content/stacks/new");
    await admin.getByRole("textbox", { name: "Name" }).fill(STACK_NAME);
    await admin.getByRole("textbox", { name: "Slug" }).fill(STACK_SLUG);
    await admin.getByRole("button", { name: "Create" }).click();
    await admin.waitForURL(/\/admin\/content\/stacks\/[0-9a-f-]{36}$/);
  });

  await test.step("then builds the role out of them", async () => {
    await admin.goto("/admin/content/roles/new");
    await admin.getByRole("textbox", { name: "Name" }).fill(ROLE_NAME);
    await admin.getByRole("textbox", { name: "Slug" }).fill(ROLE_SLUG);
    await admin.getByRole("checkbox", { name: LEVEL_NAME }).check();
    await admin.getByRole("checkbox", { name: STACK_NAME }).check();
    await admin.getByRole("radio", { name: `Default: ${STACK_NAME}` }).check();
    await admin.getByRole("button", { name: "Create" }).click();
    await admin.waitForURL(/\/admin\/content\/roles\/[0-9a-f-]{36}$/);
  });

  const roleUrl = admin.url();

  await test.step("a role whose levels are all drafts cannot be published", async () => {
    await admin.getByRole("button", { name: "Submit for review" }).click();
    await expect(admin.getByText("Now: In review.")).toBeVisible();
    await confirm(admin, "Publish");
    await expect(
      admin.getByText("Publish one of the role's levels first", { exact: false }),
    ).toBeVisible();
  });

  await test.step("so the level goes out first, then the stack, then the role", async () => {
    await admin.goto("/admin/content/levels");
    await admin.getByRole("link", { name: LEVEL_NAME }).click();
    await admin.getByRole("button", { name: "Submit for review" }).click();
    await confirm(admin, "Publish");
    await expect(admin.getByText("Now: Published.")).toBeVisible();

    await admin.goto("/admin/content/stacks");
    await admin.getByRole("link", { name: STACK_NAME }).click();
    await admin.getByRole("button", { name: "Submit for review" }).click();
    await confirm(admin, "Publish");
    await expect(admin.getByText("Now: Published.")).toBeVisible();

    await admin.goto(roleUrl);
    await confirm(admin, "Publish");
    await expect(admin.getByText("Now: Published.")).toBeVisible();
  });

  await test.step("the catalogue now offers it, with its label, level and stack", async () => {
    const response = await admin.request.get("/api/content/career-roles");
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as {
      roles: {
        slug: string;
        name: string;
        level_options: { slug: string }[];
        stacks: { slug: string; is_default: boolean }[];
      }[];
    };
    const role = body.roles.find((item) => item.slug === ROLE_SLUG);
    expect(role?.name).toBe(ROLE_NAME);
    expect(role?.level_options.map((option) => option.slug)).toEqual([LEVEL_SLUG]);
    expect(role?.stacks).toEqual([
      { slug: STACK_SLUG, name: STACK_NAME, summary: null, is_default: true },
    ]);
  });

  await test.step("and the level it offers cannot be retired out from under it", async () => {
    await admin.goto("/admin/content/levels");
    await admin.getByRole("link", { name: LEVEL_NAME }).click();
    await confirm(admin, "Retire");
    /*
     * The refusal is explained in the CMS's own words, not the server's (ADR-0012). Matched on the
     * clause that names the level rather than on the whole sentence: the copy lists all four things
     * that can hold a level (a published role, track or question, or a candidate's profile), and
     * the list is the sort of thing that grows.
     */
    await expect(
      admin.getByText("still uses this level, so it cannot be withdrawn", { exact: false }),
    ).toBeVisible();
  });

  await adminContext.close();
});
