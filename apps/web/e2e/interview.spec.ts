import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  adminApiContext,
  forgetInterviewState,
  publishBySlug,
  seedContent,
  signUpAndOnboard,
} from "./helpers";

/**
 * M3's acceptance criterion, in a real browser at 360px: a candidate sets up a text interview,
 * answers, earns follow-ups, and ends it cleanly with everything they said written down.
 *
 * It runs on `LLM_PROVIDER=fake`, whose interviewer stand-in is deliberately dull: asked to phrase
 * a question it returns the **pinned prompt**, asked to phrase a follow-up it returns the **probe**
 * (`readi_worker/interview/fake_script.py`). So the words on the screen are the bank's own words,
 * which is what makes the assertions below possible without a provider key and without a cost.
 *
 * The one lever the stand-in gives a test is `covered:<n>` in an answer: the coverage call then
 * reports probe `n` — its index in the question's `planned_follow_ups` — as already answered. That
 * is how "a complete answer earns no follow-up" and "an incomplete one does" are driven from the
 * same code, deterministically.
 *
 * **It owns its content, and that is not fussiness.** The first version of this spec interviewed
 * for `backend`/`mid` off the shipped bank and failed: `content.spec.ts` publishes a question into
 * that same pair, with no planned follow-ups, and the e2e database is never reset between runs, so
 * every past run had left one behind. A question with no probes can never produce a follow-up, so
 * the cap assertion was testing whichever question selection happened to draw. A role of its own
 * is the only way "answering incompletely earns exactly two follow-ups" means anything.
 *
 * What is **not** here, and why: the time budget ending a session. A 15-minute deadline cannot be
 * reached in an e2e run, and faking a clock the API owns would test the fake. `machine.py`'s unit
 * tests own that, and `interviews-advance.int.spec.ts` owns it against the real API.
 */

/** Marks everything this run creates, so a rerun never meets the previous run's content. */
const mark = randomUUID().slice(0, 8);
const roleSlug = `e2e-interview-${mark}`;
const roleName = `Interview subject ${mark}`;
const topicSlug = `e2e-interview-topic-${mark}`;

/** What each question is worth having: one criterion the prompt asks, and two the probes do. */
const rubricFor = (index: number) => `e2e-interview-rubric-${mark}-${index}`;
const questionFor = (index: number) => `e2e-interview-question-${mark}-${index}`;

/**
 * Four questions, each with three criteria and **two** probes — the follow-up budget exactly. A
 * question answered without the `covered:` markers therefore earns two follow-ups and no more,
 * which is the cap this spec is here to hold.
 */
function seedFile(): string {
  const questions = [0, 1, 2, 3]
    .map(
      (index) => `
  - slug: ${questionFor(index)}
    roles: [${roleSlug}]
    levels: [mid]
    type: technical
    topic: ${topicSlug}
    subtopic: null
    difficulty: 2
    prompt: Question ${index} for ${mark}. How did you approach it?
    context: null
    rubric: ${rubricFor(index)}
    ideal_points:
      - Says what they did, in order.
    planned_follow_ups:
      - criterion: 1
        probe: Probe one on question ${index} for ${mark}. What would you measure?
      - criterion: 2
        probe: Probe two on question ${index} for ${mark}. What would you do differently?
    reviewer_notes: Written by an end-to-end test; no expert needs to look at this.`,
    )
    .join("");

  const rubrics = [0, 1, 2, 3]
    .map(
      (index) => `
  - slug: ${rubricFor(index)}
    name: Rubric ${index} for ${mark}
    criteria:
      - dimension: Approach
        description: Says what they did.
        weight: 40
        levels: { "0": Absent, "1": Vague, "2": Partial, "3": Clear, "4": Excellent }
      - dimension: Measurement
        description: Says how they knew it worked.
        weight: 30
        levels: { "0": Absent, "1": Vague, "2": Partial, "3": Clear, "4": Excellent }
      - dimension: Hindsight
        description: Says what they would change.
        weight: 30
        levels: { "0": Absent, "1": Vague, "2": Partial, "3": Clear, "4": Excellent }`,
    )
    .join("");

  return `
version: 1
author: ai_draft
status: draft
career_roles:
  - slug: ${roleSlug}
    name: ${roleName}
    summary: A role that exists only for the end-to-end interview test.
    position: 90
    supported_question_types: [technical]
    levels: [mid]
    stacks: []
topics:
  - slug: ${topicSlug}
    name: Interview test topic ${mark}
    description: null
rubrics:${rubrics}
questions:${questions}
`;
}

/**
 * Imports the content and publishes it over the admin API, one transition at a time — the way
 * `catalogue.setup.ts` does, and for the same reason: the importer never publishes (ADR-0014
 * decision 5), and an `UPDATE` would quietly stop proving the workflow allows this.
 */
async function publishTestContent(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "readi-e2e-interview-"));
  writeFileSync(join(directory, "seed.yaml"), seedFile());
  seedContent(directory);

  /*
   * The order is the one the guards require, and each is a real rule rather than a formality: a
   * question may not be published while its rubric is a draft, nor while none of its roles is
   * published (`question_has_no_published_role`). So rubrics, then the role, then the questions —
   * the same shape as the catalogue setup publishing levels before roles.
   */
  const api = await adminApiContext();
  try {
    for (const index of [0, 1, 2, 3]) await publishBySlug(api, "rubrics", rubricFor(index));
    await publishBySlug(api, "career-roles", roleSlug);
    for (const index of [0, 1, 2, 3]) await publishBySlug(api, "questions", questionFor(index));
  } finally {
    await api.dispose();
  }
}

/** Whatever the interviewer has just said, or the candidate just wrote. */
const lastTurn = (page: Page) => page.getByRole("listitem").last();

/** How many turns the transcript holds. */
const turnCount = (page: Page) => page.getByRole("listitem").count();

/** Send an answer and wait for the exchange to close, which is the composer coming back. */
async function answer(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Your answer" }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sending…" })).toHaveCount(0, { timeout: 60_000 });
}

test.beforeAll(async () => {
  test.setTimeout(3 * 60 * 1000);
  await publishTestContent();
});

test("set up an interview, answer it, and end it with the transcript kept", async ({ page }) => {
  test.setTimeout(3 * 60 * 1000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await signUpAndOnboard(page, { role: roleName });

  await test.step("the Practice page offers the first one", async () => {
    await page.getByRole("link", { name: "Practice", exact: true }).click();
    await expect(page).toHaveURL(/\/practice$/);
    await expect(page.getByText("You have not taken a mock interview yet.")).toBeVisible();
    // Said before the interview as well as after it: this is the conversation round and no more.
    await expect(page.getByText(/Live coding and system design are not built yet/)).toBeVisible();
    await page.getByRole("link", { name: "Start your first interview" }).click();
    await expect(page).toHaveURL(/\/practice\/new$/);
  });

  await test.step("the setup screen is the catalogue, defaulted to the profile", async () => {
    // The defaults come from the profile and the catalogue (ADR-0015) — there is no constant in
    // the web app that knows any of these names, which is why a brand-new role works here at all.
    await expect(page.getByRole("radio", { name: roleName })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Mid-level" })).toBeChecked();
    await expect(
      page.getByRole("radio", { name: "15 minutes · About four questions" }),
    ).toBeChecked();
    // The kinds of question are the role's own `supported_question_types`, all ticked.
    await expect(page.getByRole("checkbox", { name: /Technical/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Behavioural/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Start the interview" }).click();
    await expect(page).toHaveURL(/\/interview\/[0-9a-f-]{36}$/);
  });

  let openingHtml = "";

  await test.step("the intro is spoken and the first question asked", async () => {
    // The intro is rendered, never generated: it states the length and the count, and a model
    // paraphrasing those gets them wrong eventually.
    await expect(page.getByText("Question 1 of 4")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/I have 4 questions for you and about 15 minutes/)).toBeVisible();
    expect(await turnCount(page)).toBe(2); // the intro, then the question
    await expect(lastTurn(page)).toContainText(`How did you approach it?`);
    openingHtml = await page.content();
  });

  await test.step("an incomplete answer earns a follow-up, and the cap is two", async () => {
    // No `covered:` markers, so both probes come back unanswered and the engine asks the first.
    await answer(page, "We had a service that kept falling over and I looked at the logs.");
    await expect(page.getByText("Question 1 of 4")).toBeVisible();
    await expect(lastTurn(page)).toContainText("Probe one");

    await answer(page, "I added a dashboard and an alert on the error rate.");
    await expect(page.getByText("Question 1 of 4")).toBeVisible();
    await expect(lastTurn(page)).toContainText("Probe two");

    /*
     * Two is the cap (`max_follow_ups`), enforced in code whatever the model says, so the third
     * answer has to move the interview on — and this is what would catch a regression where the
     * cap is read from the model's output rather than from the session.
     */
    await answer(page, "I would also write a runbook so the next person does not start from zero.");
    await expect(page.getByText("Question 2 of 4")).toBeVisible({ timeout: 60_000 });
  });

  await test.step("a question the session had not reached was never sent to the browser", async () => {
    /*
     * Reading ahead is not a leak of the answer key, but it is a leak of the interview
     * (CLAUDE.md §5). The API serves a question only once `asked_at` is set, so the words of the
     * second question cannot have been in the page rendered before it was asked.
     */
    // Which question comes second is the seeded selection's business, so read it rather than
    // assume it: `selectQuestions` spreads types and weights topics, and the order is not the
    // bank's order.
    const spoken = await lastTurn(page).innerText();
    const asked = /Question (\d+) for /.exec(spoken)?.[1];
    expect(asked, "the second question should be one of ours").toBeTruthy();
    expect(openingHtml).not.toContain(`Question ${asked} for ${mark}`);
    // Nor its probes, which are answer key until the moment they are spoken (M3 phase 3).
    expect(openingHtml).not.toContain(`Probe one on question ${asked} for ${mark}`);
  });

  await test.step("an answer that covers every probe earns none", async () => {
    /*
     * The menu-not-script rule, end to end: `covered:0 covered:1` tells the stand-in's coverage
     * judgement that both probes were reached, so the engine moves straight on. Punishing a
     * complete answer with two redundant follow-ups is the behaviour this prevents.
     */
    const before = await turnCount(page);
    await answer(page, "covered:0 covered:1 — I measured it and I said what I would change.");
    await expect(page.getByText("Question 3 of 4")).toBeVisible({ timeout: 60_000 });
    // Their answer and one new question, with no probe in between.
    expect(await turnCount(page)).toBe(before + 2);
  });

  await test.step("a reload resumes the same interview, with every turn still there", async () => {
    const before = await turnCount(page);
    await page.reload();
    await expect(page.getByText("Question 3 of 4")).toBeVisible({ timeout: 60_000 });
    expect(await turnCount(page)).toBe(before);
  });

  await test.step("the worker losing its Redis cache costs a round trip, not the session", async () => {
    /*
     * The worker's Redis holds the session bundle and the engine state, and it is a **cache**: the
     * snapshot the API sends is the authority. So deleting the key mid-interview must be invisible
     * to the candidate — the worker answers `bundle_required`, the API resends the bundle and
     * replays the exchange. That is a claim about two services agreeing, which is why it is worth
     * making here and not only in the worker's own tests.
     */
    forgetInterviewState(page.url().split("/").pop() ?? "");
    await answer(page, "covered:0 covered:1 — and nothing was lost when the cache went.");
    await expect(page.getByText("Question 4 of 4")).toBeVisible({ timeout: 60_000 });
    // Not `getByRole("alert")`: Next renders an always-present route announcer with that role.
    // The two failures this could have produced both end in the same sentence.
    await expect(page.getByText(/Nothing was lost — send it again/)).toHaveCount(0);
  });

  await test.step("ending early is two clicks, and the screen takes them onward", async () => {
    await page.getByRole("button", { name: "End the interview" }).click();
    // The two-click confirm rather than a modal, which is the wrong shape at 360px.
    await expect(page.getByText("End it now? Everything you have said is kept")).toBeVisible();
    await page.getByRole("button", { name: "End it now" }).click();

    /*
     * The screen navigates itself once the `state` frame says the session is over
     * (`router.replace` in `interview-screen.tsx`); the "See where you got to" link is the fallback
     * for the case where it cannot — an aborted stream, a session that ended in another tab. So the
     * assertion is the URL, not a click: clicking the link races the redirect that detaches it.
     */
    await expect(page).toHaveURL(/\/interview\/[0-9a-f-]{36}\/complete$/, { timeout: 60_000 });
  });

  await test.step("the completion screen keeps the transcript and waits for the scoring", async () => {
    // The transcript is the whole of what the candidate said, and the first question is still in it.
    await expect(page.getByRole("list", { name: "The interview so far" })).toBeVisible();
    /*
     * The **whole** prompt, not `Question 0 for ${mark}`: `getByText` matches a substring, and each
     * probe reads "Probe one on question 0 for <mark>…", so the short form matches the question and
     * both of its probes and fails on strict mode. It passed for as long as the selection happened
     * to leave question 0 unprobed — a latent flake that only showed when the order changed.
     */
    await expect(page.getByText(`Question 0 for ${mark}. How did you approach it?`)).toBeVisible();
    expect(await turnCount(page)).toBeGreaterThan(5);

    /*
     * And then the report arrives on its own, because the screen polls `/status` for it (M4 phase 4).
     * Generous, because the whole chain is in it: the enqueue after the stream closed, the BullMQ
     * job, one evaluator call per answered question and the assembly.
     */
    await expect(page.getByRole("link", { name: "Read your report" })).toBeVisible({
      timeout: 120_000,
    });
  });

  await test.step("the report quotes the candidate and shows the key only now", async () => {
    await page.getByRole("link", { name: "Read your report" }).click();
    await expect(page).toHaveURL(/\/interview\/[0-9a-f-]{36}\/report$/);
    await expect(page.getByRole("heading", { name: "Your report" })).toBeVisible();

    // The score, the criterion dimensions it was made of, and the pinned ideal point as "what a
    // strong answer covers" — the two parts of the answer key a scored report may show.
    await expect(page.getByRole("heading", { name: "This interview" })).toBeVisible();
    await expect(page.getByText("Approach", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Says what they did, in order.").first()).toBeVisible();

    /*
     * And the parts it may never show, on the rendered page rather than in a payload. The leak test
     * asserts this over the JSON of every candidate route; this is the same claim one layer out, and
     * it is worth making twice because a component is perfectly capable of rendering a field the
     * route never sent.
     */
    await expect(page.getByText("Says how they knew it worked.")).toHaveCount(0);
    await expect(page.getByText("Excellent", { exact: true })).toHaveCount(0);
    // Nor a probe: a report is not a turn an interviewer has spoken.
    await expect(page.getByText(`Probe one on question 0 for ${mark}`)).toHaveCount(0);
  });

  await test.step("the interview is on the Practice list, finished", async () => {
    await page.getByRole("link", { name: "Back to Practice" }).click();
    await expect(page).toHaveURL(/\/practice$/);
    await expect(page.getByText("Finished", { exact: true })).toBeVisible();
    // One live interview at a time, and this one is not live any more.
    await expect(page.getByText("You have an interview in progress.")).toHaveCount(0);
  });

  expect(consoleErrors, "the interview screen logged errors").toEqual([]);
});

/**
 * The diagnostic is the other way in, and a different shape of request: one tap, no setup screen,
 * `is_diagnostic` and a length and nothing else (`start-diagnostic-button.tsx`). It has been a
 * disabled button on `/home` since M1.
 */
test("the diagnostic on /home starts a 15-minute preset interview", async ({ page }) => {
  test.setTimeout(3 * 60 * 1000);
  await signUpAndOnboard(page, { name: "Chidi Nwosu", role: roleName });

  await expect(
    page.getByRole("heading", { name: "Start with a diagnostic interview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start the diagnostic" }).click();

  await expect(page).toHaveURL(/\/interview\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Question 1 of 4")).toBeVisible({ timeout: 60_000 });

  await page.goto("/practice");
  await expect(page.getByText("Diagnostic")).toBeVisible();
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
});
