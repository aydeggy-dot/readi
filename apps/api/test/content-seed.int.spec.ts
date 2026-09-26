import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { CandidatePracticeResponse } from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentService } from "../src/content/content.service";
import {
  questionContent,
  questionInclude,
  rubricContent,
  rubricInclude,
} from "../src/content/content.mappers";
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

    /*
     * It defines its own role and level, and borrows nothing.
     *
     * It used to say `roles: [frontend]` and `levels: [mid]`, which no file in this temporary
     * directory defines — so the import only succeeded when some *other* spec had already put those
     * rows in the database, or when a previous run had left them there. On a genuinely empty
     * database, which is what CI creates, every test in this block failed with
     * `SeedReferenceError: … names role frontend, which no seed file defines`. That was true on
     * `main` before M3 touched anything; it is the M2.5 lesson exactly — a test that names content
     * it does not create is borrowing, and what it borrows can change under it.
     */
    const file = (prompt: string, rubricName = "Seed test rubric", author = "ai_draft") => `
version: 1
author: ${author}
status: draft
career_levels:
  - slug: ${slug}-level
    name: Seed test level
    summary: null
    rank: 20
career_roles:
  - slug: ${slug}-role
    name: Seed test role
    summary: null
    position: 0
    supported_question_types: [technical]
    levels: [${slug}-level]
    stacks: []
topics:
  - slug: ${slug}-topic
    name: Seed test topic
    description: null
rubrics:
  - slug: ${slug}-rubric
    name: ${rubricName}
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
    roles: [${slug}-role]
    levels: [${slug}-level]
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

    const write = (prompt: string, rubricName?: string, author?: string) => {
      writeFileSync(join(directory, "seed.yaml"), file(prompt, rubricName, author));
      return loadSeedDirectory(directory, directory).files;
    };

    /** A person editing in the CMS: a real actor id, which is what takes the item over. */
    const expert = { id: randomUUID(), role: "content_expert" as const };

    afterAll(async () => {
      await prisma.question.deleteMany({ where: { slug: `${slug}-question` } });
      await prisma.rubric.deleteMany({ where: { slug: `${slug}-rubric` } });
      await prisma.topic.deleteMany({ where: { slug: `${slug}-topic` } });
      await prisma.careerRoleLevel.deleteMany({ where: { role: { slug: `${slug}-role` } } });
      await prisma.careerRole.deleteMany({ where: { slug: `${slug}-role` } });
      await prisma.careerLevel.deleteMany({ where: { slug: `${slug}-level` } });
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

    /**
     * The case the whole of ADR-0014 decision 5 exists for: an expert rewords a seeded question in
     * the CMS, someone re-runs `pnpm db:seed` from muscle memory, and the expert's work survives.
     */
    it("keeps an item the CMS has edited, and names it in the report", async () => {
      const question = await prisma.question.findUniqueOrThrow({
        where: { slug: `${slug}-question` },
      });
      expect(question.seedManaged).toBe(true);

      const full = await prisma.question.findUniqueOrThrow({
        where: { id: question.id },
        include: questionInclude,
      });
      await content.updateQuestion(
        question.id,
        { ...questionContent(full), prompt: "The expert's wording." },
        { actor: expert },
      );
      const edited = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
      expect(edited.seedManaged).toBe(false);

      const report = await new SeedImporter(prisma, content).import(write("A fourth prompt."));

      expect(report.questions.skipped).toEqual([`${slug}-question`]);
      expect(report.questions).toMatchObject({ created: 0, updated: 0, unchanged: 0 });
      const after = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
      expect(after.prompt).toBe("The expert's wording.");
      expect(after.version).toBe(edited.version);
      expect(after.updatedAt).toEqual(edited.updatedAt);
    });

    /**
     * The other half of the rule: the skipped list is for file changes that did not land, so an
     * item the CMS owns but whose content still matches its file is not named in every future run.
     */
    it("does not name a CMS-owned item whose content still matches its file", async () => {
      const report = await new SeedImporter(prisma, content).import(write("The expert's wording."));
      expect(report.questions).toMatchObject({ created: 0, updated: 0, unchanged: 1, skipped: [] });
    });

    it("plans the same way in a dry run", async () => {
      const report = await new SeedImporter(prisma, content, { dryRun: true }).import(
        write("A fifth prompt."),
      );
      expect(report.questions.skipped).toEqual([`${slug}-question`]);
    });

    it("overwrites it with --force, and takes the item back for the files", async () => {
      const report = await new SeedImporter(prisma, content, { force: true }).import(
        write("The file's wording."),
      );

      expect(report.questions).toMatchObject({ updated: 1, skipped: [] });
      const after = await prisma.question.findUniqueOrThrow({
        where: { slug: `${slug}-question` },
      });
      expect(after.prompt).toBe("The file's wording.");
      expect(after.seedManaged).toBe(true);
      // The history says what happened, so a forced overwrite is never a silent one.
      const snapshot = await prisma.contentVersion.findFirstOrThrow({
        where: { entityId: after.id },
        orderBy: { version: "desc" },
      });
      expect(snapshot.changeNote).toBe("seed import (forced)");
      expect(snapshot.snapshot).toMatchObject({ prompt: "The expert's wording." });
    });

    /**
     * Publishing seeded content is an admin's decision about its readiness, not a claim on its
     * words, so the files keep it (ADR-0014 decision 5).
     */
    it("leaves published content alone and names it, unless forced", async () => {
      const rubric = await prisma.rubric.findUniqueOrThrow({ where: { slug: `${slug}-rubric` } });
      const admin = { id: randomUUID(), role: "admin" as const };
      await content.transition(expert, "rubrics", rubric.id, {
        transition: "submit",
        note: null,
        acknowledge_unreviewed: false,
      });
      await content.transition(admin, "rubrics", rubric.id, {
        transition: "publish",
        note: null,
        acknowledge_unreviewed: false,
      });
      // Still the files', in the `seed_managed` sense — that is not what stops the write.
      expect(
        (await prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } })).seedManaged,
      ).toBe(true);

      /*
       * Candidates are reading these words now. Rewriting them from a file is the same act as an
       * expert rewriting them in the CMS, which is an admin's call (ADR-0014 decision 7) — and it
       * is how model-drafted text could reach candidates without the publish guard running, since
       * an import changes no status.
       */
      const report = await new SeedImporter(prisma, content).import(
        write("The file's wording.", "A renamed rubric"),
      );
      expect(report.rubrics).toMatchObject({ updated: 0, published: [`${slug}-rubric`] });
      expect((await prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } })).name).not.toBe(
        "A renamed rubric",
      );

      // `--force` is the deliberate way through, and says so in the history.
      const forced = await new SeedImporter(prisma, content, { force: true }).import(
        write("The file's wording.", "A renamed rubric"),
      );
      expect(forced.rubrics).toMatchObject({ updated: 1, published: [] });
      const after = await prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
      expect(after.name).toBe("A renamed rubric");
      expect(after.status).toBe("published");
    });

    /**
     * The narrow half of `--force`, and the reason it exists (2026-09-26).
     *
     * A dev database seeded before a bank was rewritten holds published rows the importer will not
     * touch, so a session pins content nobody has read in weeks — that is what made the first paid
     * interview run worthless. `--force` fixes it and also drags back every row a person has edited
     * in the CMS, which is a much bigger act than the one being asked for. This is the refresh:
     * the publish guard moves, the `seed_managed` guard does not.
     */
    it("refreshes published rows the files own with --force-published, and no others", async () => {
      const admin = { id: randomUUID(), role: "admin" as const };
      const before = await prisma.rubric.findUniqueOrThrow({ where: { slug: `${slug}-rubric` } });
      // Where the test above left it: published, and still the files'.
      expect(before).toMatchObject({ status: "published", seedManaged: true });

      const refreshed = await new SeedImporter(prisma, content, { forcePublished: true }).import(
        write("The file's wording.", "Refreshed from the file"),
      );
      expect(refreshed.rubrics).toMatchObject({ updated: 1, published: [], skipped: [] });
      const rubric = await prisma.rubric.findUniqueOrThrow({ where: { id: before.id } });
      expect(rubric).toMatchObject({
        name: "Refreshed from the file",
        status: "published",
        seedManaged: true,
      });

      // A row a person has taken over stays theirs: only the publish guard moved.
      const full = await prisma.rubric.findUniqueOrThrow({
        where: { id: before.id },
        include: rubricInclude,
      });
      await content.updateRubric(
        before.id,
        { ...rubricContent(full), name: "An admin renamed it" },
        { actor: admin },
      );
      expect(
        (await prisma.rubric.findUniqueOrThrow({ where: { id: before.id } })).seedManaged,
      ).toBe(false);

      const kept = await new SeedImporter(prisma, content, { forcePublished: true }).import(
        write("The file's wording.", "The file tries again"),
      );
      expect(kept.rubrics).toMatchObject({ updated: 0, skipped: [`${slug}-rubric`] });
      expect((await prisma.rubric.findUniqueOrThrow({ where: { id: before.id } })).name).toBe(
        "An admin renamed it",
      );
    });

    it("marks what a model drafted, and unmarks it when the file says a person wrote it", async () => {
      // `author: ai_draft` — the state the whole shipped corpus is in (ADR-0014 decision 6).
      await new SeedImporter(prisma, content).import(write("What does the event loop do?"));
      const drafted = await prisma.question.findUniqueOrThrow({
        where: { slug: `${slug}-question` },
      });
      expect(drafted.aiDraftUnreviewed).toBe(true);
      expect(drafted.reviewedAt).toBeNull();

      // An expert reviews the bank in the YAML and says so. A re-import clears the mark.
      await new SeedImporter(prisma, content).import(
        write("What does the event loop actually do?", undefined, "human"),
      );
      const reviewed = await prisma.question.findUniqueOrThrow({
        where: { slug: `${slug}-question` },
      });
      expect(reviewed.aiDraftUnreviewed).toBe(false);
    });

    /*
     * The case the review round is actually made of, and the one the test above misses by changing
     * the prompt and the author together: an expert reads a bank, says "these are fine as they
     * stand", and changes nothing but `author`. No content moves, so the importer's ordinary
     * update path never runs, and for a while this did nothing at all.
     */
    it("clears the mark when ONLY the author changed, without writing a version", async () => {
      const PROMPT = "What does the event loop do, exactly?";
      await new SeedImporter(prisma, content).import(write(PROMPT));
      const before = await prisma.question.findUniqueOrThrow({
        where: { slug: `${slug}-question` },
      });
      expect(before.aiDraftUnreviewed).toBe(true);
      const versionsBefore = await prisma.contentVersion.count({
        where: { entityType: "question", entityId: before.id },
      });

      // The same words; a different claim about who stands behind them.
      const report = await new SeedImporter(prisma, content).import(
        write(PROMPT, undefined, "human"),
      );
      expect(report.questions).toMatchObject({ updated: 0, unchanged: 1, reviewed: 1 });

      const after = await prisma.question.findUniqueOrThrow({
        where: { slug: `${slug}-question` },
      });
      expect(after.aiDraftUnreviewed).toBe(false);
      // Not a content change: no new version, and no history entry saying otherwise.
      expect(after.version).toBe(before.version);
      expect(
        await prisma.contentVersion.count({
          where: { entityType: "question", entityId: before.id },
        }),
      ).toBe(versionsBefore);

      // The audit log says a review happened, and that the files are what said so.
      const entry = await prisma.auditLog.findFirst({
        where: { action: "content.question.reviewed", targetId: before.id },
      });
      expect(entry?.after).toMatchObject({ ai_draft_unreviewed: false, by: "seed" });
    });

    it("plans an author-only flip in a dry run without writing it", async () => {
      const PROMPT = "What does the event loop do, in a dry run?";
      await new SeedImporter(prisma, content).import(write(PROMPT));
      const report = await new SeedImporter(prisma, content, { dryRun: true }).import(
        write(PROMPT, undefined, "human"),
      );
      expect(report.questions).toMatchObject({ reviewed: 1 });
      const row = await prisma.question.findUniqueOrThrow({
        where: { slug: `${slug}-question` },
      });
      expect(row.aiDraftUnreviewed).toBe(true);
    });

    it("re-marks a question whose text a model has redrafted, and forgets the stale review", async () => {
      await new SeedImporter(prisma, content).import(write("First wording.", undefined, "human"));
      const id = (await prisma.question.findUniqueOrThrow({ where: { slug: `${slug}-question` } }))
        .id;
      await prisma.question.update({
        where: { id },
        data: { reviewedAt: new Date(), reviewedByUserId: randomUUID() },
      });

      await new SeedImporter(prisma, content).import(
        write("Second wording, drafted again.", undefined, "ai_draft"),
      );
      const row = await prisma.question.findUniqueOrThrow({ where: { id } });
      expect(row.aiDraftUnreviewed).toBe(true);
      // The review was of words this import replaced, so it no longer stands.
      expect(row.reviewedAt).toBeNull();
      expect(row.reviewedByUserId).toBeNull();
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

  /**
   * The catalogue (ADR-0015). A role names its levels and its stacks by slug, so the importer has
   * to create them first and resolve the names — the pattern a question's `topic` already uses,
   * and the one that fails loudest when a slug has a typo in it.
   */
  describe("a catalogue of its own", () => {
    const directory = mkdtempSync(join(tmpdir(), "readi-seed-catalogue-"));
    const slug = `cattest-${Date.now()}`;

    const file = (roleName = "Test role") => `
version: 1
author: ai_draft
status: draft
career_levels:
  - slug: ${slug}-junior
    name: Junior
    summary: null
    rank: 10
stacks:
  - slug: ${slug}-spring
    name: Java / Spring
    summary: null
career_roles:
  - slug: ${slug}-role
    name: ${roleName}
    summary: null
    position: 70
    supported_question_types: [technical, scenario]
    levels: [${slug}-junior]
    stacks:
      - { stack: ${slug}-spring, default: true }
`;

    const write = (roleName?: string) => {
      writeFileSync(join(directory, "seed.yaml"), file(roleName));
      return loadSeedDirectory(directory, directory).files;
    };

    afterAll(async () => {
      await prisma.careerRole.deleteMany({ where: { slug: `${slug}-role` } });
      await prisma.careerLevel.deleteMany({ where: { slug: `${slug}-junior` } });
      await prisma.stack.deleteMany({ where: { slug: `${slug}-spring` } });
    });

    it("creates levels and stacks first, then the role that names them", async () => {
      const report = await new SeedImporter(prisma, content).import(write());
      expect(report.career_levels.created).toBe(1);
      expect(report.stacks.created).toBe(1);
      expect(report.career_roles.created).toBe(1);

      const role = await prisma.careerRole.findUniqueOrThrow({
        where: { slug: `${slug}-role` },
        include: { levels: true, stacks: true },
      });
      expect(role.status).toBe("draft");
      expect(role.aiDraftUnreviewed).toBe(true);
      const level = await prisma.careerLevel.findUniqueOrThrow({
        where: { slug: `${slug}-junior` },
      });
      expect(role.levels.map((link) => link.levelId)).toEqual([level.id]);
      expect(role.stacks[0]?.isDefault).toBe(true);
    });

    it("changes nothing on a second run", async () => {
      const before = await prisma.careerRole.findUniqueOrThrow({ where: { slug: `${slug}-role` } });
      const report = await new SeedImporter(prisma, content).import(write());
      expect(report).toMatchObject({
        career_levels: { created: 0, updated: 0, unchanged: 1 },
        stacks: { created: 0, updated: 0, unchanged: 1 },
        career_roles: { created: 0, updated: 0, unchanged: 1 },
      });
      const after = await prisma.careerRole.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.updatedAt).toEqual(before.updatedAt);
      expect(after.version).toBe(before.version);
    });

    it("versions a change to the role", async () => {
      const before = await prisma.careerRole.findUniqueOrThrow({ where: { slug: `${slug}-role` } });
      const report = await new SeedImporter(prisma, content).import(write("Renamed role"));
      expect(report.career_roles).toMatchObject({ created: 0, updated: 1, unchanged: 0 });
      const after = await prisma.careerRole.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.name).toBe("Renamed role");
      expect(after.version).toBe(before.version + 1);
    });

    it("refuses a level slug nothing defines, naming the file", async () => {
      const broken = file().replace(`levels: [${slug}-junior]`, "levels: [no-such-level]");
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
      // Every file in /content/seed says `author: ai_draft`, so nothing here may be published
      // in production until an expert has been through it (ADR-0014 decision 6).
      expect(questions.every((question) => question.aiDraftUnreviewed)).toBe(true);
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
        ...seeded.planned_follow_ups.map((plan) => plan.probe),
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
