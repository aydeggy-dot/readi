import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { CandidatePracticeResponse } from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentService } from "../src/content/content.service";
import { SeedImporter, SeedReferenceError } from "../src/content/seed-import";
import { loadSeedDirectory, loadSeedSource } from "../src/content/seed-loader";
import { PrismaService } from "../src/prisma/prisma.service";
import { answerKeyLeaks } from "./answer-key";
import { giveProfile } from "./content-fixtures";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";

const REPOSITORY_ROOT = resolve(__dirname, "../../..");
const SEED_ROOT = join(REPOSITORY_ROOT, "content/seed");

/**
 * The seed importer against the database, and the corpus we actually ship against the rule that
 * matters most (no answer key ever reaches a candidate).
 *
 * This file publishes no track, so it needs no (role, level) pair of its own: it borrows one
 * seeded question, publishes it and its rubric, and puts them back as it found them.
 */
describe("seeding content", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let content: ContentService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    content = app.get(ContentService);
  });

  afterAll(async () => {
    await app.close();
  });

  const importReal = () =>
    new SeedImporter(prisma, content).import(loadSeedDirectory(SEED_ROOT, REPOSITORY_ROOT).files);

  describe("a small corpus of its own", () => {
    /** Slugs nothing else uses, so this can assert exact counts while other files run. */
    const directory = mkdtempSync(join(tmpdir(), "readi-seed-"));
    const slug = `seedtest-${Date.now()}`;

    const file = (prompt: string) => `
version: 1
author: ai_draft
status: draft
topics:
  - slug: ${slug}-topic
    name: Seed test topic
    description: null
rubrics:
  - slug: ${slug}-rubric
    name: Seed test rubric
    criteria:
      - dimension: One
        description: The first criterion.
        weight: 60
        levels: { "0": a, "1": b, "2": c, "3": d, "4": e }
      - dimension: Two
        description: The second criterion.
        weight: 40
        levels: { "0": a, "1": b, "2": c, "3": d, "4": e }
questions:
  - slug: ${slug}-question
    roles: [frontend]
    levels: [mid]
    type: technical
    topic: ${slug}-topic
    subtopic: null
    difficulty: 3
    prompt: ${prompt}
    context: null
    rubric: ${slug}-rubric
    ideal_points: [Measures before changing anything]
    reviewer_notes: Written by a test; nothing here needs an expert.
`;

    const write = (prompt: string) => {
      writeFileSync(join(directory, "seed.yaml"), file(prompt));
      return loadSeedDirectory(directory, directory).files;
    };

    afterAll(async () => {
      await prisma.question.deleteMany({ where: { slug: `${slug}-question` } });
      await prisma.rubric.deleteMany({ where: { slug: `${slug}-rubric` } });
      await prisma.topic.deleteMany({ where: { slug: `${slug}-topic` } });
    });

    it("creates what the files describe", async () => {
      const report = await new SeedImporter(prisma, content).import(write("The first prompt."));
      expect(report.topics.created).toBe(1);
      expect(report.rubrics.created).toBe(1);
      expect(report.questions.created).toBe(1);

      const question = await prisma.question.findUniqueOrThrow({
        where: { slug: `${slug}-question` },
      });
      // Seeded content arrives as a draft, whoever runs the importer.
      expect(question.status).toBe("draft");
      expect(question.createdByUserId).toBeNull();
    });

    it("changes nothing on a second run — no version, no audit row, no touched timestamp", async () => {
      const before = await prisma.question.findUniqueOrThrow({
        where: { slug: `${slug}-question` },
      });
      const versionsBefore = await prisma.contentVersion.count({ where: { entityId: before.id } });
      const auditBefore = await prisma.auditLog.count({ where: { targetId: before.id } });

      const report = await new SeedImporter(prisma, content).import(write("The first prompt."));

      expect(report).toMatchObject({
        topics: { created: 0, updated: 0, unchanged: 1 },
        rubrics: { created: 0, updated: 0, unchanged: 1 },
        questions: { created: 0, updated: 0, unchanged: 1 },
      });
      const after = await prisma.question.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.updatedAt).toEqual(before.updatedAt);
      expect(after.version).toBe(before.version);
      expect(await prisma.contentVersion.count({ where: { entityId: before.id } })).toBe(
        versionsBefore,
      );
      expect(await prisma.auditLog.count({ where: { targetId: before.id } })).toBe(auditBefore);
    });

    it("updates only what changed, and keeps the old version in the history", async () => {
      const before = await prisma.question.findUniqueOrThrow({
        where: { slug: `${slug}-question` },
      });
      const report = await new SeedImporter(prisma, content).import(write("A rewritten prompt."));

      expect(report.questions).toMatchObject({ created: 0, updated: 1, unchanged: 0 });
      const after = await prisma.question.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.prompt).toBe("A rewritten prompt.");
      expect(after.version).toBe(before.version + 1);

      const snapshot = await prisma.contentVersion.findFirstOrThrow({
        where: { entityId: before.id, version: before.version },
      });
      expect(snapshot.snapshot).toMatchObject({ prompt: "The first prompt." });
      // Written by nobody in particular: the importer acts as the system (ADR-0011).
      expect(snapshot.changedByUserId).toBeNull();
      expect(snapshot.changeNote).toBe("seed import");
    });

    it("plans without writing when asked to", async () => {
      const before = await prisma.question.findUniqueOrThrow({
        where: { slug: `${slug}-question` },
      });
      const report = await new SeedImporter(prisma, content, { dryRun: true }).import(
        write("A third prompt."),
      );
      expect(report.questions).toMatchObject({ updated: 1 });
      const after = await prisma.question.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.prompt).toBe("A rewritten prompt.");
    });

    it("refuses a reference nothing defines, naming the file", async () => {
      const broken = file("A prompt.").replace(`rubric: ${slug}-rubric`, "rubric: no-such-rubric");
      writeFileSync(join(directory, "seed.yaml"), broken);
      const files = loadSeedDirectory(directory, directory).files;
      await expect(new SeedImporter(prisma, content).import(files)).rejects.toBeInstanceOf(
        SeedReferenceError,
      );
    });
  });

  describe("the corpus we ship", () => {
    it("imports, and imports again with nothing to do", async () => {
      await importReal();
      const second = await importReal();
      for (const [kind, counts] of Object.entries(second)) {
        expect({ kind, created: counts.created, updated: counts.updated }).toEqual({
          kind,
          created: 0,
          updated: 0,
        });
      }
    });

    it("lands as draft content, written by nobody", async () => {
      const { files } = loadSeedDirectory(SEED_ROOT, REPOSITORY_ROOT);
      const slugs = files.flatMap(({ data }) => (data.questions ?? []).map((q) => q.slug));
      const questions = await prisma.question.findMany({ where: { slug: { in: slugs } } });
      expect(questions).toHaveLength(slugs.length);
      expect(questions.every((question) => question.status === "draft")).toBe(true);
      expect(questions.every((question) => question.createdByUserId === null)).toBe(true);
    });

    /**
     * The leak test's sentinels prove the rule against content built to be caught. This proves it
     * against the sentences an expert actually wrote: every ideal point and every level descriptor
     * in the corpus is a string a candidate must never see.
     */
    it("never shows a candidate the answer key that ships with it", async () => {
      // Read through the loader, so this sees exactly what the importer saw.
      const source = loadSeedSource(
        "frontend/questions.yaml",
        readFileSync(join(SEED_ROOT, "frontend/questions.yaml"), "utf8"),
      );
      const seeded = source.data?.questions?.find((question) => question.levels.includes("mid"));
      if (!seeded) throw new Error("no seeded frontend question for a mid-level candidate");

      const question = await prisma.question.findUniqueOrThrow({
        where: { slug: seeded.slug },
        include: { rubric: { include: { criteria: true } } },
      });
      const markers = [
        ...seeded.ideal_points,
        ...question.rubric.criteria.flatMap((criterion) => [
          criterion.dimension,
          criterion.description,
          ...Object.values(criterion.levels as Record<string, string>),
        ]),
      ];
      expect(markers.length).toBeGreaterThan(10);

      const candidate = await signUpWithEmail(app, uniqueEmail());
      await giveProfile(prisma, candidate.email, "frontend", "mid");

      // Publish this one question and its rubric, then put both back as they were.
      await prisma.rubric.update({
        where: { id: question.rubricId },
        data: { status: "published" },
      });
      await prisma.question.update({ where: { id: question.id }, data: { status: "published" } });
      try {
        const response = await request(app.getHttpServer())
          .get("/api/content/practice")
          .set({ cookie: candidate.cookie });
        expect(response.status).toBe(200);
        const items = (response.body as CandidatePracticeResponse).items;
        // The question really is in the response — otherwise this proves nothing.
        expect(items.map((item) => item.slug)).toContain(seeded.slug);
        expect(answerKeyLeaks(response.body, markers)).toEqual([]);
      } finally {
        await prisma.question.update({ where: { id: question.id }, data: { status: "draft" } });
        await prisma.rubric.update({ where: { id: question.rubricId }, data: { status: "draft" } });
      }
    });
  });
});
