import { expect, request as playwrightRequest, test as setup } from "@playwright/test";
import { grantRole, seedContent, uniqueEmail } from "./helpers";

const PASSWORD = "correct horse battery staple";
const API_URL = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 4010}`;

/**
 * The precondition every other spec needs: a **published catalogue**.
 *
 * Roles and levels are content now (ADR-0015), and content arrives from `/content/seed` as a
 * draft — the importer never publishes, by design (ADR-0014 decision 5). A candidate is only
 * offered published roles, so without this the onboarding form would draw an empty picker and
 * every spec that fills it would fail for a reason that has nothing to do with what it tests.
 *
 * It publishes them the way the product does: an admin, over the admin API, one transition at a
 * time. Doing it with an `UPDATE` would be shorter and would quietly stop proving that the
 * workflow lets this happen at all — and it is the workflow that M2.5 is about.
 *
 * `catalogue.spec.ts` still drives the same path through the CMS screens; this is setup, not a
 * substitute for that test.
 */
setup("seed and publish the catalogue", async () => {
  setup.setTimeout(3 * 60 * 1000);
  seedContent();

  const api = await playwrightRequest.newContext({ baseURL: API_URL });
  const email = uniqueEmail();
  const signUp = await api.post("/api/auth/sign-up/email", {
    data: { email, password: PASSWORD, name: "E2E catalogue admin" },
  });
  expect(signUp.ok(), await signUp.text()).toBeTruthy();
  grantRole(email, "admin");

  // The cookie from sign-up already carries the new role on its next request.
  // Stacks are published too: a candidate is offered only published variants, so without this the
  // onboarding form would draw the stack picker empty (ADR-0015).
  for (const entity of ["career-levels", "stacks", "career-roles"] as const) {
    const list = await api.get(`/api/admin/content/${entity}`, { params: { limit: 100 } });
    expect(list.ok(), await list.text()).toBeTruthy();
    const { items } = (await list.json()) as { items: { id: string; status: string }[] };

    // Levels before roles: publishing a role is refused while all its levels are still drafts
    // (`career_role_has_no_published_level`), which is exactly the order a person would use.
    for (const item of items) {
      if (item.status === "published") continue;
      for (const transition of ["submit", "publish"] as const) {
        const response = await api.post(`/api/admin/content/${entity}/${item.id}/transition`, {
          data: { transition, note: null },
        });
        expect(
          response.ok(),
          `${entity} ${item.id} ${transition}: ${await response.text()}`,
        ).toBeTruthy();
      }
    }
  }

  const offered = await api.get("/api/content/career-roles");
  expect(offered.ok()).toBeTruthy();
  const { roles } = (await offered.json()) as {
    roles: { level_options: unknown[]; stacks: unknown[] }[];
  };
  expect(roles.length, "the candidate catalogue is empty after setup").toBeGreaterThan(0);
  expect(roles.every((role) => role.level_options.length > 0)).toBe(true);
  expect(
    roles.some((role) => role.stacks.length > 0),
    "no role offers a stack",
  ).toBe(true);
  await api.dispose();
});
