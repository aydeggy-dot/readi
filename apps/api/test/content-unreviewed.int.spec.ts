import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Rubric, RubricInput } from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env";
import { ENV } from "../src/config/env.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { setUserRole } from "../src/users/roles.service";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";

/**
 * The one rule that behaves differently in production: nothing a model drafted reaches candidates
 * until a person has said it is fit to (ADR-0014 decision 6, CLAUDE.md §7.7).
 *
 * The app is built as usual and only the `ENV` value is swapped afterwards, so the module wiring
 * stays the development one — no real email or SMS provider is required to prove the guard. That
 * is enough, because the guard reads `NODE_ENV` per request rather than at startup.
 */
describe("publishing an unreviewed AI draft in production", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let expert: string;
  let admin: string;
  const rubrics: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({ cookie });

  const createRubric = async (): Promise<Rubric> => {
    const body: RubricInput = {
      slug: `unreviewed-${randomUUID().slice(0, 8)}`,
      name: "Drafted by a model",
      criteria: [
        {
          dimension: "Problem framing",
          description: "Restates the problem and names the constraint that matters.",
          weight: 60,
          levels: { "0": "Absent", "1": "Vague", "2": "Partial", "3": "Clear", "4": "Excellent" },
        },
        {
          dimension: "Measurement",
          description: "Measures before changing anything.",
          weight: 40,
          levels: { "0": "Absent", "1": "Vague", "2": "Partial", "3": "Clear", "4": "Excellent" },
        },
      ],
    };
    const response = await http().post("/api/admin/content/rubrics").set(as(expert)).send(body);
    expect(response.status).toBe(201);
    const rubric = response.body as Rubric;
    rubrics.push(rubric.id);
    // Only the seed importer marks a row this way; the tests reach the same state directly.
    await prisma.rubric.update({ where: { id: rubric.id }, data: { aiDraftUnreviewed: true } });
    await http()
      .post(`/api/admin/content/rubrics/${rubric.id}/transition`)
      .set(as(expert))
      .send({ transition: "submit", note: null });
    return rubric;
  };

  const publish = (acknowledge: boolean, id: string) =>
    http()
      .post(`/api/admin/content/rubrics/${id}/transition`)
      .set(as(admin))
      .send({ transition: "publish", note: null, acknowledge_unreviewed: acknowledge });

  beforeAll(async () => {
    const production = { ...parseEnv({ ...process.env }), NODE_ENV: "production" as const };
    app = await createTestApp({ overrides: [[ENV, production]] });
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
    await setUserRole(prisma, {
      email: adminUser.email,
      role: "admin",
      actor: { type: "system" },
    });
  });

  afterAll(async () => {
    await prisma.rubric.deleteMany({ where: { id: { in: rubrics } } });
    await app.close();
  });

  it("is refused, and the item stays where it was", async () => {
    const rubric = await createRubric();
    const response = await publish(false, rubric.id);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "content_unreviewed_ai_draft" });

    const row = await prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
    expect(row.status).toBe("in_review");
    expect(row.publishedAt).toBeNull();
  });

  it("goes through once an expert has marked it reviewed", async () => {
    const rubric = await createRubric();
    expect((await publish(false, rubric.id)).status).toBe(409);

    const reviewed = await http()
      .post(`/api/admin/content/rubrics/${rubric.id}/reviewed`)
      .set(as(expert))
      .send({ note: null });
    expect(reviewed.status).toBe(200);

    expect((await publish(false, rubric.id)).status).toBe(201);
  });

  it("goes through on an admin's explicit override, which the audit log records", async () => {
    const rubric = await createRubric();
    expect((await publish(true, rubric.id)).status).toBe(201);

    const entry = await prisma.auditLog.findFirst({
      where: { action: "content.rubric.published", targetId: rubric.id },
    });
    expect(entry?.after).toMatchObject({ acknowledged_unreviewed: true });
    // The row is still an unreviewed draft: overriding the guard is not a review.
    const row = await prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
    expect(row.aiDraftUnreviewed).toBe(true);
  });

  it("never mentions the override for content nobody had flagged", async () => {
    const response = await http()
      .post("/api/admin/content/rubrics")
      .set(as(expert))
      .send({
        slug: `human-${randomUUID().slice(0, 8)}`,
        name: "Written by a person",
        criteria: [
          {
            dimension: "Problem framing",
            description: "Restates the problem and names the constraint that matters.",
            weight: 60,
            levels: { "0": "Absent", "1": "Vague", "2": "Partial", "3": "Clear", "4": "Excellent" },
          },
          {
            dimension: "Measurement",
            description: "Measures before changing anything.",
            weight: 40,
            levels: { "0": "Absent", "1": "Vague", "2": "Partial", "3": "Clear", "4": "Excellent" },
          },
        ],
      });
    const rubric = response.body as Rubric;
    rubrics.push(rubric.id);
    await http()
      .post(`/api/admin/content/rubrics/${rubric.id}/transition`)
      .set(as(expert))
      .send({ transition: "submit", note: null });
    expect((await publish(false, rubric.id)).status).toBe(201);

    const entry = await prisma.auditLog.findFirst({
      where: { action: "content.rubric.published", targetId: rubric.id },
    });
    expect(entry?.after).not.toMatchObject({ acknowledged_unreviewed: true });
  });
});
