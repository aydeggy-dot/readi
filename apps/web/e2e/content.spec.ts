import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { grantRole, uniqueEmail } from "./helpers";

const PASSWORD = "correct horse battery staple";

/**
 * M2's acceptance criterion, through the CMS a person actually uses: a content expert writes a
 * rubric and a question and submits them, an admin publishes them, and only then does the
 * candidate API return the question — without any of the answer key (ADR-0014 decision 3).
 *
 * Runs at 360px like the rest of the suite. Slugs carry a random suffix because the e2e database
 * outlives a run.
 */
const suffix = randomUUID().slice(0, 8);
const RUBRIC_SLUG = `e2e-rubric-${suffix}`;
const QUESTION_SLUG = `e2e-question-${suffix}`;
const IDEAL_POINT = `Names the index that makes the query cheap ${suffix}`;

/**
 * Picks the option whose text contains `text`. The values are uuids the test cannot know, and the
 * labels carry a status that changes as the item moves through the workflow.
 */
async function selectByText(page: Page, label: string, text: string): Promise<void> {
  const select = page.getByLabel(label, { exact: true });
  const value = await select.locator("option", { hasText: text }).getAttribute("value");
  if (!value) throw new Error(`no option containing "${text}" in "${label}"`);
  await select.selectOption(value);
}

async function signUp(page: Page, address: string): Promise<void> {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email" }).fill(address);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding\/profile$/);
}

/** The profile the candidate reads default to: a mid-level backend engineer. */
async function fillProfile(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox", { name: "What should we call you?" }).fill(name);
  await page.getByRole("radio", { name: "Backend engineer" }).check();
  await page.getByRole("radio", { name: "Mid-level" }).check();
  await page.getByRole("spinbutton", { name: "Years of professional experience" }).fill("3");
  await page.getByRole("textbox", { name: "Your main stack" }).fill("Go");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("radio", { name: "Remote role at a foreign company" }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/onboarding\/cv$/);
}

test("an expert writes and submits, an admin publishes, a candidate then sees it", async ({
  browser,
}) => {
  test.setTimeout(3 * 60 * 1000);

  const expertContext = await browser.newContext();
  const expert = await expertContext.newPage();
  const expertEmail = uniqueEmail();
  const candidateContext = await browser.newContext();
  const candidate = await candidateContext.newPage();
  const candidateEmail = uniqueEmail();
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminEmail = uniqueEmail();

  await test.step("a candidate who will be looking for this question later", async () => {
    await signUp(candidate, candidateEmail);
    await fillProfile(candidate, "Ada Obi");
  });

  await test.step("the CMS is not for candidates", async () => {
    const response = await candidate.goto("/admin/content");
    expect(response?.status()).toBe(404);
  });

  await test.step("a content expert signs in", async () => {
    await signUp(expert, expertEmail);
    grantRole(expertEmail, "content_expert");
    await expert.goto("/admin/content");
    await expect(expert.getByRole("heading", { name: "Content", level: 1 })).toBeVisible();
  });

  await test.step("and adds the topic the question will hang from", async () => {
    await expert.goto("/admin/content/topics");
    await expert.getByRole("textbox", { name: "Name" }).fill(`Query performance ${suffix}`);
    await expert.getByRole("textbox", { name: "Slug" }).fill(`e2e-topic-${suffix}`);
    await expert.getByRole("button", { name: "Create" }).click();
    await expect(expert.getByText("Topic added.")).toBeVisible();
  });

  await test.step("the expert writes a rubric", async () => {
    await expert.goto("/admin/content/rubrics/new");
    await expert.getByRole("textbox", { name: "Name" }).fill(`Query reasoning ${suffix}`);
    await expert.getByRole("textbox", { name: "Slug" }).fill(RUBRIC_SLUG);

    const criteria = [
      { dimension: "Diagnosis", weight: "60", description: "Finds why the query is slow." },
      { dimension: "Trade-offs", weight: "40", description: "Weighs the cost of the fix." },
    ];
    for (const [index, criterion] of criteria.entries()) {
      const group = expert.getByRole("group", { name: `Criterion ${index + 1}` });
      await group.getByRole("textbox", { name: "What is being judged" }).fill(criterion.dimension);
      await group.getByRole("spinbutton", { name: "Weight" }).fill(criterion.weight);
      await group.getByRole("textbox", { name: "What it means" }).fill(criterion.description);
      for (const level of ["0", "1", "2", "3", "4"]) {
        await group
          .getByRole("textbox", { name: `Level ${level}` })
          .fill(`Level ${level}: ${criterion.dimension.toLowerCase()}, band ${level}.`);
      }
    }
    // The running total is the editor's only live feedback that the rubric can be published.
    await expect(expert.getByTestId("weight-total")).toHaveText("Weights add up to 100.");

    await expert.getByRole("button", { name: "Create" }).click();
    await expert.waitForURL(/\/admin\/content\/rubrics\/[0-9a-f-]{36}$/);
    await expect(expert.getByTestId("status-draft")).toBeVisible();
  });

  await test.step("and submits it for review", async () => {
    await expert.getByRole("button", { name: "Submit for review" }).click();
    await expect(expert.getByText("Now: In review.")).toBeVisible();
  });

  await test.step("the expert writes a question against that rubric", async () => {
    await expert.goto("/admin/content/questions/new");
    await expert.getByRole("textbox", { name: "Slug" }).fill(QUESTION_SLUG);
    await expert.getByRole("checkbox", { name: "Backend engineer" }).check();
    await expert.getByRole("checkbox", { name: "Mid-level" }).check();
    await selectByText(expert, "Topic", `Query performance ${suffix}`);
    await expert
      .getByRole("textbox", { name: "The question" })
      .fill(`A report page takes **nine seconds** to load. Where do you start? ${suffix}`);
    await selectByText(expert, "Rubric", `Query reasoning ${suffix}`);
    await expert.getByRole("textbox", { name: "What a strong answer covers 1" }).fill(IDEAL_POINT);

    // The preview renders the markdown, in a chunk that no candidate page loads.
    await expert.getByRole("tab", { name: "Preview" }).first().click();
    await expect(expert.getByTestId("markdown-preview").first().locator("strong")).toHaveText(
      "nine seconds",
    );

    await expert.getByRole("button", { name: "Create" }).click();
    await expert.waitForURL(/\/admin\/content\/questions\/[0-9a-f-]{36}$/);
    await expert.getByRole("button", { name: "Submit for review" }).click();
    await expect(expert.getByText("Now: In review.")).toBeVisible();
  });

  await test.step("publishing is not the expert's to do", async () => {
    await expect(expert.getByRole("button", { name: "Publish" })).toHaveCount(0);
  });

  const questionUrl = expert.url();

  await test.step("the candidate cannot see it yet", async () => {
    const response = await candidate.request.get("/api/content/practice");
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { items: { slug: string }[] };
    expect(body.items.map((item) => item.slug)).not.toContain(QUESTION_SLUG);
  });

  await test.step("an admin publishes the rubric, then the question", async () => {
    await signUp(admin, adminEmail);
    grantRole(adminEmail, "admin");

    // The question's rubric has to be published first, and the CMS says so when it is not.
    await admin.goto(questionUrl);
    await admin.getByRole("button", { name: "Publish" }).first().click();
    await admin.getByRole("button", { name: "Publish" }).last().click();
    await expect(admin.getByText("Publish the question's rubric first.")).toBeVisible();

    await admin.goto("/admin/content/rubrics");
    await admin.getByRole("link", { name: `Query reasoning ${suffix}` }).click();
    await admin.getByRole("button", { name: "Publish" }).first().click();
    await admin.getByRole("button", { name: "Publish" }).last().click();
    await expect(admin.getByText("Now: Published.")).toBeVisible();

    await admin.goto(questionUrl);
    await admin.getByRole("button", { name: "Publish" }).first().click();
    await admin.getByRole("button", { name: "Publish" }).last().click();
    await expect(admin.getByText("Now: Published.")).toBeVisible();
  });

  await test.step("the history records what it said before", async () => {
    await admin.reload();
    await admin.getByRole("button", { name: "Show what it said" }).first().click();
    // A snapshot is the admin's view of the item, answer key and all.
    await expect(admin.getByText("ideal_points")).toBeVisible();
  });

  await test.step("now the candidate sees it — and none of the answer key", async () => {
    const response = await candidate.request.get("/api/content/practice");
    const raw = await response.text();
    const body = JSON.parse(raw) as { items: { slug: string }[] };
    expect(body.items.map((item) => item.slug)).toContain(QUESTION_SLUG);
    // The rule the whole milestone turns on (the exhaustive version of this check is
    // apps/api/test/content-no-answer-key.int.spec.ts).
    expect(raw).not.toContain(IDEAL_POINT);
    expect(raw).not.toContain("Diagnosis");
    expect(raw).not.toContain("band 4");
  });

  await expertContext.close();
  await adminContext.close();
  await candidateContext.close();
});
