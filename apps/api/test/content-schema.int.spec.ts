import type { NestExpressApplication } from "@nestjs/platform-express";
import { EMBEDDING_DIMENSIONS } from "@readi/shared-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service";
import { createTestApp } from "./helpers";

/**
 * The parts of the content schema that Prisma cannot express, and that therefore live as
 * hand-written SQL in the migration (ADR-0006, ADR-0014). If a future `prisma migrate dev`
 * regenerates the migration and drops them, these fail rather than the loss showing up later as a
 * slow duplicate search or two published tracks fighting over one candidate.
 */
describe("content schema", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const created: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (created.length > 0) await prisma.track.deleteMany({ where: { id: { in: created } } });
    await app.close();
  });

  it(`stores question embeddings as vector(${EMBEDDING_DIMENSIONS})`, async () => {
    const [column] = await prisma.$queryRaw<{ type: string }[]>`
      SELECT format_type(a.atttypid, a.atttypmod) AS type
      FROM pg_attribute a
      WHERE a.attrelid = 'questions'::regclass AND a.attname = 'embedding'`;
    expect(column?.type).toBe(`vector(${EMBEDDING_DIMENSIONS})`);
  });

  /*
   * This is the test that catches the mistake this project makes most often. Prisma cannot see an
   * index over an `Unsupported` column, so **every** `prisma migrate dev` that touches `questions`
   * — and some that do not — generates `DROP INDEX questions_embedding_hnsw`, which has to be
   * deleted by hand before the migration is applied (CLAUDE.md §5, `tasks/lessons.md`). It has
   * happened in three migrations so far. Without the index, duplicate detection still *works*, so
   * nothing else in the suite notices: it just scans the whole table and gets slower as the bank
   * grows.
   *
   * Checked by hand on 2026-09-22 by dropping the index in `readi_test` and running this file:
   * this test failed and the other three passed.
   */
  it("indexes those embeddings for cosine distance with HNSW", async () => {
    const [index] = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'questions_embedding_hnsw'`;
    // Asserted before the shape, so a missing index fails with what actually went wrong rather
    // than with "undefined is not a string".
    expect(
      index,
      "questions_embedding_hnsw is missing: a migration dropped it — see CLAUDE.md §5",
    ).toBeDefined();
    expect(index?.indexdef).toContain("USING hnsw");
    expect(index?.indexdef).toContain("vector_cosine_ops");
  });

  it("allows only one published track per role and level", async () => {
    const base = {
      role: "qa" as const,
      level: "intern_junior" as const,
      title: "QA, intern",
      summary: null,
    };
    const first = await prisma.track.create({
      data: { ...base, slug: `schema-test-published-${Date.now()}`, status: "published" },
    });
    created.push(first.id);

    // A second published track for the same audience is refused by the partial unique index...
    await expect(
      prisma.track.create({
        data: { ...base, slug: `schema-test-second-${Date.now()}`, status: "published" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    // ...while drafts of the same audience are not, so a replacement can be written.
    const draft = await prisma.track.create({
      data: { ...base, slug: `schema-test-draft-${Date.now()}`, status: "draft" },
    });
    created.push(draft.id);
    expect(draft.status).toBe("draft");
  });

  it("keeps one history row per entity and version", async () => {
    const entityId = crypto.randomUUID();
    const row = {
      entityType: "question" as const,
      entityId,
      version: 1,
      snapshot: { slug: "schema-test" },
    };
    await prisma.contentVersion.create({ data: row });
    await expect(prisma.contentVersion.create({ data: row })).rejects.toMatchObject({
      code: "P2002",
    });
    await prisma.contentVersion.deleteMany({ where: { entityId } });
  });
});
