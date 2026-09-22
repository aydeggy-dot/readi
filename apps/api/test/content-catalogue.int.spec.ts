import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type {
  CareerLevel,
  CareerLevelInput,
  CareerRole,
  CareerRoleInput,
  CareerRolesResponse,
  ContentVersionsResponse,
  Stack,
  StackInput,
} from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service";
import { setUserRole } from "../src/users/roles.service";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";

/**
 * The catalogue as content (ADR-0015): career roles, career levels and stacks move through the
 * same workflow as a question, and a published role is what a candidate chooses from.
 *
 * This file creates its own roles, levels and stacks with unique slugs and removes them again, so
 * it needs no `(role, level)` pair of its own and does not disturb the seeded catalogue.
 */
describe("the catalogue: career roles, levels and stacks", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let expert: string;
  let admin: string;
  let candidate: string;

  const roles: string[] = [];
  const levels: string[] = [];
  const stacks: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({ cookie });
  const id = () => randomUUID().slice(0, 8);

  const createLevel = async (
    cookie: string,
    overrides: Partial<CareerLevelInput> = {},
  ): Promise<CareerLevel> => {
    const body: CareerLevelInput = {
      slug: `level-${id()}`,
      name: "Mid-level",
      summary: null,
      rank: 20,
      ...overrides,
    };
    const response = await http()
      .post("/api/admin/content/career-levels")
      .set(as(cookie))
      .send(body);
    expect(response.status).toBe(201);
    const level = response.body as CareerLevel;
    levels.push(level.id);
    return level;
  };

  const createStack = async (
    cookie: string,
    overrides: Partial<StackInput> = {},
  ): Promise<Stack> => {
    const body: StackInput = {
      slug: `stack-${id()}`,
      name: "Java / Spring",
      summary: null,
      ...overrides,
    };
    const response = await http().post("/api/admin/content/stacks").set(as(cookie)).send(body);
    expect(response.status).toBe(201);
    const stack = response.body as Stack;
    stacks.push(stack.id);
    return stack;
  };

  const createRole = async (
    cookie: string,
    overrides: Partial<CareerRoleInput> = {},
  ): Promise<CareerRole> => {
    const body: CareerRoleInput = {
      slug: `role-${id()}`,
      name: "Platform engineer",
      summary: "Golden paths and the tooling the rest of the team builds on.",
      position: 50,
      supported_question_types: ["technical", "scenario"],
      levels: [],
      stacks: [],
      ...overrides,
    };
    const response = await http()
      .post("/api/admin/content/career-roles")
      .set(as(cookie))
      .send(body);
    expect(response.status).toBe(201);
    const role = response.body as CareerRole;
    roles.push(role.id);
    return role;
  };

  const move = (cookie: string, path: string, entityId: string, transition: string) =>
    http()
      .post(`/api/admin/content/${path}/${entityId}/transition`)
      .set(as(cookie))
      .send({ transition, note: null });

  /** A role, a level and a stack, all published and linked — the shape a candidate reads. */
  const publishedRole = async (
    overrides: Partial<CareerRoleInput> = {},
  ): Promise<{ role: CareerRole; level: CareerLevel; stack: Stack }> => {
    const level = await createLevel(admin);
    const stack = await createStack(admin);
    const role = await createRole(admin, {
      levels: [level.id],
      stacks: [{ stack_id: stack.id, is_default: true }],
      ...overrides,
    });
    for (const [path, entityId] of [
      ["career-levels", level.id],
      ["stacks", stack.id],
      ["career-roles", role.id],
    ] as const) {
      expect((await move(admin, path, entityId, "submit")).status).toBe(201);
      expect((await move(admin, path, entityId, "publish")).status).toBe(201);
    }
    return { role, level, stack };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const expertUser = await signUpWithEmail(app, uniqueEmail());
    expert = expertUser.cookie;
    await setUserRole(prisma, {
      email: expertUser.email,
      role: "content_expert",
      actor: { type: "system" },
    });

    const adminUser = await signUpWithEmail(app, uniqueEmail());
    admin = adminUser.cookie;
    await setUserRole(prisma, { email: adminUser.email, role: "admin", actor: { type: "system" } });

    const candidateUser = await signUpWithEmail(app, uniqueEmail());
    candidate = candidateUser.cookie;
  });

  afterAll(async () => {
    // A role cannot be deleted while a candidate is preparing for it — the FK is `restrict`, which
    // is `role_in_use` doing its job. Test users outlive their spec, so their profiles go first.
    await prisma.profile.deleteMany({ where: { targetRoleId: { in: roles } } });
    await prisma.careerRole.deleteMany({ where: { id: { in: roles } } });
    await prisma.careerLevel.deleteMany({ where: { id: { in: levels } } });
    await prisma.stack.deleteMany({ where: { id: { in: stacks } } });
    await prisma.contentVersion.deleteMany({
      where: { entityId: { in: [...roles, ...levels, ...stacks] } },
    });
    await app.close();
  });

  describe("who may edit the catalogue", () => {
    it("turns a candidate away from all three", async () => {
      const responses = await Promise.all([
        http().get("/api/admin/content/career-roles").set(as(candidate)),
        http().get("/api/admin/content/career-levels").set(as(candidate)),
        http().get("/api/admin/content/stacks").set(as(candidate)),
      ]);
      expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
    });

    it("lets a content expert write one and an admin publish it", async () => {
      const level = await createLevel(expert);
      expect(level.status).toBe("draft");
      expect((await move(expert, "career-levels", level.id, "submit")).status).toBe(201);

      const refused = await move(expert, "career-levels", level.id, "publish");
      expect(refused.status).toBe(403);
      expect(refused.body).toMatchObject({ code: "content_transition_forbidden" });

      const published = await move(admin, "career-levels", level.id, "publish");
      expect(published.status).toBe(201);
      expect(published.body).toMatchObject({ status: "published", version: 3 });
    });
  });

  describe("a role and what it offers", () => {
    it("keeps its levels and stacks in the order they were given", async () => {
      const first = await createLevel(admin, { rank: 10 });
      const second = await createLevel(admin, { rank: 20 });
      const stack = await createStack(admin);
      const role = await createRole(admin, {
        levels: [second.id, first.id],
        stacks: [{ stack_id: stack.id, is_default: true }],
      });
      // The order is the content: it is what a candidate sees in the picker.
      expect(role.levels).toEqual([second.id, first.id]);
      expect(role.stacks).toEqual([{ stack_id: stack.id, is_default: true }]);

      const read = await http().get(`/api/admin/content/career-roles/${role.id}`).set(as(admin));
      expect((read.body as CareerRole).levels).toEqual([second.id, first.id]);
    });

    it("says which field is wrong when a level does not exist", async () => {
      const response = await http()
        .post("/api/admin/content/career-roles")
        .set(as(admin))
        .send({
          slug: `role-${id()}`,
          name: "Ghost",
          summary: null,
          position: 90,
          supported_question_types: ["technical"],
          levels: [randomUUID()],
          stacks: [],
        });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("levels");
    });

    it("refuses two default stacks, because a picker starts in one place", async () => {
      const [first, second] = await Promise.all([createStack(admin), createStack(admin)]);
      const response = await http()
        .post("/api/admin/content/career-roles")
        .set(as(admin))
        .send({
          slug: `role-${id()}`,
          name: "Two defaults",
          summary: null,
          position: 91,
          supported_question_types: ["technical"],
          levels: [],
          stacks: [
            { stack_id: first.id, is_default: true },
            { stack_id: second.id, is_default: true },
          ],
        });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("stacks");
    });

    it("refuses a slug that is already taken", async () => {
      const level = await createLevel(admin);
      const response = await http()
        .post("/api/admin/content/career-levels")
        .set(as(admin))
        .send({ slug: level.slug, name: "Again", summary: null, rank: 30 });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "content_slug_taken" });
    });

    it("versions an edit, and writes nothing when nothing changed", async () => {
      const role = await createRole(admin);
      const input = {
        slug: role.slug,
        name: role.name,
        summary: role.summary,
        position: role.position,
        supported_question_types: role.supported_question_types,
        levels: role.levels,
        stacks: role.stacks,
      };

      const same = await http()
        .put(`/api/admin/content/career-roles/${role.id}`)
        .set(as(admin))
        .send(input);
      expect(same.status).toBe(200);
      expect((same.body as CareerRole).version).toBe(1);

      const changed = await http()
        .put(`/api/admin/content/career-roles/${role.id}`)
        .set(as(admin))
        .send({ ...input, name: "Platform engineer (renamed)" });
      expect(changed.status).toBe(200);
      expect((changed.body as CareerRole).version).toBe(2);

      const history = await http()
        .get(`/api/admin/content/career-roles/${role.id}/versions`)
        .set(as(admin));
      expect((history.body as ContentVersionsResponse).versions).toHaveLength(1);
    });

    it("refuses to publish a role whose levels are all still drafts", async () => {
      const level = await createLevel(admin);
      const role = await createRole(admin, { levels: [level.id] });
      expect((await move(admin, "career-roles", role.id, "submit")).status).toBe(201);

      const refused = await move(admin, "career-roles", role.id, "publish");
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: "career_role_has_no_published_level" });

      // Publish the level and the role goes out.
      expect((await move(admin, "career-levels", level.id, "submit")).status).toBe(201);
      expect((await move(admin, "career-levels", level.id, "publish")).status).toBe(201);
      expect((await move(admin, "career-roles", role.id, "publish")).status).toBe(201);
    });
  });

  describe("retiring something a published role still offers", () => {
    it("refuses to retire the level", async () => {
      const { level } = await publishedRole();
      const refused = await move(admin, "career-levels", level.id, "retire");
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: "level_in_use" });
    });

    it("refuses to retire the stack", async () => {
      const { stack } = await publishedRole();
      const refused = await move(admin, "stacks", stack.id, "retire");
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: "stack_in_use" });
    });

    it("allows it once the role itself is retired", async () => {
      const { role, level } = await publishedRole();
      expect((await move(admin, "career-roles", role.id, "retire")).status).toBe(201);
      expect((await move(admin, "career-levels", level.id, "retire")).status).toBe(201);
    });
  });

  describe("what a candidate is offered", () => {
    it("lists published roles with their labels, levels and stacks", async () => {
      const { role, level, stack } = await publishedRole();
      const response = await http().get("/api/content/career-roles").set(as(candidate));
      expect(response.status).toBe(200);

      const mine = (response.body as CareerRolesResponse).roles.find(
        (item) => item.slug === role.slug,
      );
      expect(mine).toBeDefined();
      expect(mine?.name).toBe(role.name);
      expect(mine?.level_options).toEqual([
        { slug: level.slug, name: level.name, summary: level.summary },
      ]);
      expect(mine?.stacks).toEqual([
        { slug: stack.slug, name: stack.name, summary: stack.summary, is_default: true },
      ]);
    });

    it("hides a role that is not published", async () => {
      const draft = await createRole(admin);
      const response = await http().get("/api/content/career-roles").set(as(candidate));
      expect(JSON.stringify(response.body)).not.toContain(draft.slug);
    });

    /*
     * A published role may well list a level or stack that is not published yet — an admin adds
     * next quarter's "senior" to the role before the level itself goes out. The candidate is
     * offered what is published and nothing else: offering a choice and then refusing it is the
     * worse failure, and it is the one the M2 handover recorded for rubrics.
     */
    it("offers only the levels and stacks that are themselves published", async () => {
      const { role, level, stack } = await publishedRole();
      const draftLevel = await createLevel(admin, { rank: 30 });
      const draftStack = await createStack(admin);
      await http()
        .put(`/api/admin/content/career-roles/${role.id}`)
        .set(as(admin))
        .send({
          slug: role.slug,
          name: role.name,
          summary: role.summary,
          position: role.position,
          supported_question_types: role.supported_question_types,
          levels: [level.id, draftLevel.id],
          stacks: [
            { stack_id: stack.id, is_default: true },
            { stack_id: draftStack.id, is_default: false },
          ],
        })
        .expect(200);

      // The CMS sees both...
      const admins = await http().get(`/api/admin/content/career-roles/${role.id}`).set(as(admin));
      expect((admins.body as CareerRole).levels).toEqual([level.id, draftLevel.id]);

      // ...the candidate sees only what is published.
      const response = await http().get("/api/content/career-roles").set(as(candidate));
      const mine = (response.body as CareerRolesResponse).roles.find(
        (item) => item.slug === role.slug,
      );
      expect(mine?.level_options.map((option) => option.slug)).toEqual([level.slug]);
      expect(mine?.stacks.map((option) => option.slug)).toEqual([stack.slug]);
    });

    it("turns away a visitor with no session", async () => {
      expect((await http().get("/api/content/career-roles")).status).toBe(401);
    });

    /*
     * The other half of the test above. Hiding a draft level from the picker is not enough: the
     * profile endpoint takes a slug, and a candidate who sends one the picker never drew must be
     * refused too. The level is the field this was missed on — the role and the stack were both
     * checked for `published` from the start, and the level was not (M2.5 review, 2026-09-22).
     */
    it("refuses a profile at a level the role offers but has not published", async () => {
      const { role, level } = await publishedRole();
      const draftLevel = await createLevel(admin, { rank: 40 });
      await http()
        .put(`/api/admin/content/career-roles/${role.id}`)
        .set(as(admin))
        .send({
          slug: role.slug,
          name: role.name,
          summary: role.summary,
          position: role.position,
          supported_question_types: role.supported_question_types,
          levels: [level.id, draftLevel.id],
          stacks: [],
        })
        .expect(200);

      const { cookie } = await signUpWithEmail(app, uniqueEmail());
      const response = await http()
        .put("/api/me/profile")
        .set(as(cookie))
        .send({
          name: "Ada",
          target_role: role.slug,
          level: draftLevel.slug,
          target_stack: null,
          years_experience: 2,
          technologies: ["Go"],
          target_company_type: "local_startup",
          target_date: null,
        });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("level");

      // And the published one still works, so the fix refused the right thing.
      const ok = await http()
        .put("/api/me/profile")
        .set(as(cookie))
        .send({
          name: "Ada",
          target_role: role.slug,
          level: level.slug,
          target_stack: null,
          years_experience: 2,
          technologies: ["Go"],
          target_company_type: "local_startup",
          target_date: null,
        });
      expect(ok.status).toBe(200);
    });
  });
});
