import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const API_DIR = fileURLToPath(new URL("../../api", import.meta.url));

const API_URL = process.env.E2E_API_URL ?? `http://127.0.0.1:${process.env.E2E_API_PORT ?? 4010}`;

/**
 * A fresh address per run, so a rerun never meets the previous run's account. Deliberately long
 * and unbreakable: it is echoed in the "verify your email" banner, which must wrap at 360px
 * rather than push the page sideways.
 */
export const uniqueEmail = () => `e2e-${randomUUID()}@a-long-employer-domain.example`;

export interface MailboxEntry {
  channel: string;
  to: string;
  subject?: string;
  body: string;
}

/** Emails and texts the console providers "sent" (development only; ADR-0009). */
export async function readMailbox(to: string): Promise<MailboxEntry[]> {
  const response = await fetch(`${API_URL}/api/dev/mailbox?to=${encodeURIComponent(to)}`);
  if (!response.ok) throw new Error(`dev mailbox read failed: HTTP ${response.status}`);
  return (await response.json()) as MailboxEntry[];
}

/**
 * Gives an account a role the way an operator would — through the audited CLI against the e2e
 * database — because no HTTP route grants roles, by design (ADR-0009). The built CLI is in
 * `dist-cli`, which `scripts/e2e.sh` has already produced.
 */
export function grantRole(email: string, role: "content_expert" | "admin"): void {
  execFileSync("node", ["dist-cli/src/cli/grant-role.js", "--email", email, "--role", role], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://readi:readi@127.0.0.1:15432/readi_e2e",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:16379/2",
    },
    stdio: "pipe",
  });
}

/**
 * Runs the seed importer against the e2e database. With no argument it imports `/content/seed`, so
 * the CMS screens have real content to show; with a directory it imports that instead, which is
 * how a test makes an item the importer has marked as an unreviewed AI draft (ADR-0014 decision 6)
 * — nothing written through the CMS carries that mark, because a person wrote it.
 *
 * Idempotent, like the importer itself (ADR-0014 decision 5).
 */
export function seedContent(directory?: string): void {
  execFileSync(
    "node",
    ["dist-cli/src/cli/seed-content.js", ...(directory ? ["--dir", directory] : [])],
    {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ?? "postgresql://readi:readi@127.0.0.1:15432/readi_e2e",
        REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:16379/2",
      },
      stdio: "pipe",
    },
  );
}

/** The password every e2e account uses. Never a secret: these accounts live for one run. */
export const E2E_PASSWORD = "correct horse battery staple";

/**
 * A signed-up, onboarded candidate, parked on `/home` — the state most specs need before they can
 * test anything, and which none of them are testing (`onboarding.spec.ts` is where that flow is
 * actually asserted, step by step, and it deliberately does not use this).
 *
 * The CV step is **skipped**: it is optional, and waiting for a background parse costs a minute
 * for something no caller of this looks at.
 *
 * It fills the onboarding form by accessible name, which is the thing that rots. When a field is
 * renamed this breaks loudly on the next run — the M2.5 lesson, where a rename went unnoticed for
 * two phases because the only spec that filled the form was skipped unless an env var was set.
 */
export async function signUpAndOnboard(
  page: Page,
  options: {
    name?: string;
    role?: string;
    level?: string;
    /**
     * Consent labels to tick before continuing. The default is none, which is the screen's own
     * default and a no to every type — so a caller that needs a grant has to say so, rather than
     * inheriting one from a helper.
     */
    consents?: readonly string[];
  } = {},
): Promise<string> {
  const email = uniqueEmail();
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding\/profile$/);

  await page
    .getByRole("textbox", { name: "What should we call you?" })
    .fill(options.name ?? "Ada Obi");
  await page.getByRole("radio", { name: options.role ?? "Backend engineer" }).check();
  await page.getByRole("radio", { name: options.level ?? "Mid-level" }).check();
  await page.getByRole("spinbutton", { name: "Years of professional experience" }).fill("3");
  // Required, and a different field from the variant radio above it since M2.5: the variant is the
  // catalogue row being interviewed for, this is free text about what they actually know.
  await page.getByRole("textbox", { name: "What do you work with?" }).fill("Go");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("radio", { name: "Remote role at a foreign company" }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/onboarding\/cv$/);

  await page.getByRole("link", { name: "Skip for now" }).click();
  await page.waitForURL(/\/onboarding\/consent$/);
  for (const consent of options.consents ?? []) await page.getByText(consent).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/home$/);
  return email;
}

/**
 * A Redis flush inside the worker, for one session: deletes the cached bundle and engine state
 * (`interview:<id>`, `readi_worker/interview/state_store.py`).
 *
 * The worker's Redis is a **cache**, not a store — the snapshot the API sends is always the
 * authority — so losing it must cost one extra round trip and never a session. That is a claim
 * about two services agreeing, which is why it is worth making in the e2e run and not only in the
 * worker's own tests: the worker answers `bundle_required` and the API has to notice and resend.
 *
 * `redis-cli` through compose, because the e2e run already requires those services and the web
 * app has no Redis client of its own.
 */
export function forgetInterviewState(sessionId: string): void {
  const url = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:16379/2");
  const database = url.pathname.slice(1) || "0";
  execFileSync(
    "docker",
    [
      "compose",
      "-f",
      fileURLToPath(new URL("../../../infra/docker-compose.yml", import.meta.url)),
      "exec",
      "-T",
      "redis",
      "redis-cli",
      "-n",
      database,
      "DEL",
      `interview:${sessionId}`,
    ],
    { stdio: "pipe" },
  );
}

/**
 * An API client signed in as a **new admin**, for the setup a test needs but is not testing.
 *
 * Roles are granted through the audited CLI, as an operator would (ADR-0009), and the cookie from
 * sign-up already carries the new role on its next request.
 */
export async function adminApiContext(): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL: API_URL });
  const email = uniqueEmail();
  const signUp = await api.post("/api/auth/sign-up/email", {
    data: { email, password: E2E_PASSWORD, name: "E2E setup admin" },
  });
  expect(signUp.ok(), await signUp.text()).toBeTruthy();
  grantRole(email, "admin");
  return api;
}

/**
 * Submits and publishes one piece of content, the way a person would (ADR-0014).
 *
 * Idempotent: a row that is already published has no transition left to make, which matters
 * because several questions share a rubric and the second one would otherwise be refused.
 */
export async function publishBySlug(
  api: APIRequestContext,
  entity: "rubrics" | "questions" | "career-roles",
  slug: string,
): Promise<void> {
  const list = await api.get(`/api/admin/content/${entity}`, { params: { q: slug } });
  expect(list.ok(), await list.text()).toBeTruthy();
  const { items } = (await list.json()) as {
    items: { id: string; slug: string; status: string }[];
  };
  const row = items.find((item) => item.slug === slug);
  expect(row, `${entity} ${slug} was not found`).toBeTruthy();
  const steps =
    row?.status === "draft"
      ? (["submit", "publish"] as const)
      : row?.status === "in_review"
        ? (["publish"] as const)
        : ([] as const);
  for (const transition of steps) {
    const response = await api.post(`/api/admin/content/${entity}/${row?.id}/transition`, {
      // The importer marks seeded content an unreviewed AI draft; outside production that never
      // refuses, and acknowledging it keeps the audit entry honest either way (ADR-0014).
      data: { transition, note: null, acknowledge_unreviewed: true },
    });
    expect(response.ok(), `${entity} ${slug} ${transition}: ${await response.text()}`).toBeTruthy();
  }
}

/**
 * Publishes a few of the **shipped bank's** questions for one role and level, with their rubrics.
 *
 * `seedContent()` imports the bank as drafts and never publishes (ADR-0014 decision 5), and
 * `catalogue.setup.ts` publishes only the catalogue — so in a fresh e2e database **no question is
 * published at all** and an interview cannot be started. That went unnoticed because
 * `content.spec.ts` leaves a published question behind in backend/mid on every run and the
 * database is never reset, so the screens appeared to work on somebody else's fixture.
 *
 * Only questions with **no stack tags** are taken, so they are offered whatever variant the
 * candidate picked (`question-eligibility.ts`).
 */
export async function publishSeededQuestions(options: {
  role: string;
  level: string;
  count: number;
}): Promise<string[]> {
  const api = await adminApiContext();
  try {
    const list = await api.get("/api/admin/content/questions", {
      params: { role: options.role, level: options.level, status: "draft", limit: 100 },
    });
    expect(list.ok(), await list.text()).toBeTruthy();
    const { items } = (await list.json()) as {
      items: { slug: string; rubric_slug: string; stacks: string[] }[];
    };
    const general = items.filter((item) => item.stacks.length === 0).slice(0, options.count);
    expect(
      general.length,
      `no unpublished general questions for ${options.role}/${options.level}`,
    ).toBeGreaterThan(0);

    for (const item of general) {
      // Its rubric first: a question may not be published while its rubric is a draft.
      await publishBySlug(api, "rubrics", item.rubric_slug);
      await publishBySlug(api, "questions", item.slug);
    }
    return general.map((item) => item.slug);
  } finally {
    await api.dispose();
  }
}
