import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findSeedFiles, formatProblem, loadSeedDirectory, loadSeedSource } from "./seed-loader";

const SEED_ROOT = resolve(__dirname, "../../../../content/seed");

const valid = `
version: 1
author: ai_draft
status: draft
topics:
  - slug: one-topic
    name: One topic
    description: null
`;

describe("reading a seed file", () => {
  it("accepts a well-formed file", () => {
    const { data, problems } = loadSeedSource("x.yaml", valid);
    expect(problems).toEqual([]);
    expect(data?.topics?.[0]?.slug).toBe("one-topic");
  });

  it("reports the line and column of a syntax error", () => {
    const broken = "version: 1\nauthor: ai_draft\nstatus: draft\ntopics:\n  - slug: [unclosed\n";
    const { data, problems } = loadSeedSource("content/seed/x.yaml", broken);
    expect(data).toBeNull();
    expect(problems[0]?.file).toBe("content/seed/x.yaml");
    expect(problems[0]?.line).toBeGreaterThan(0);
  });

  it("points at the offending value, not at the top of the file", () => {
    const wrong = valid.replace("slug: one-topic", "slug: One Topic");
    const [problem, ...rest] = loadSeedSource("x.yaml", wrong).problems;
    expect(rest).toEqual([]);
    // `slug: One Topic` is on line 6 of the source above; a reader can go straight there.
    expect(problem).toMatchObject({ line: 6, path: "topics[0].slug" });
    expect(problem && formatProblem(problem)).toContain("x.yaml:6:");
  });

  it("names a missing field against the item that is missing it", () => {
    const missing = valid.replace("    name: One topic\n", "");
    const { problems } = loadSeedSource("x.yaml", missing);
    expect(problems[0]?.path).toBe("topics[0].name");
    // The item's own line (`- slug: one-topic`), since the absent key has no line of its own.
    expect(problems[0]?.line).toBe(6);
  });

  it("reports every problem in the file, not just the first", () => {
    const twice = valid
      .replace("slug: one-topic", "slug: One Topic")
      .replace("version: 1", "version: 2");
    expect(loadSeedSource("x.yaml", twice).problems.length).toBeGreaterThan(1);
  });

  it("refuses a file that asks for anything but draft", () => {
    const published = valid.replace("status: draft", "status: published");
    const { problems } = loadSeedSource("x.yaml", published);
    expect(problems[0]?.path).toBe("status");
  });
});

/*
 * A role written in a file must obey the same rules as a role written in the CMS. The importer
 * builds a `CareerRoleInput` out of `SeedCareerRole` and hands it to `ContentService`, which does
 * not re-parse — so anything only `CareerRoleInput` enforces, the files could break silently
 * (M2.5 review, 2026-09-22).
 */
describe("a role in a seed file", () => {
  const role = (stacks: string) => `
version: 1
author: ai_draft
status: draft
career_roles:
  - slug: a-role
    name: A role
    summary: null
    position: 0
    supported_question_types: [technical]
    levels: [mid]
    stacks:
${stacks}
`;

  it("accepts one default stack, and none", () => {
    expect(
      loadSeedSource("roles.yaml", role("      - { stack: one, default: true }")).problems,
    ).toEqual([]);
    expect(
      loadSeedSource("roles.yaml", role("      - { stack: one, default: false }")).problems,
    ).toEqual([]);
  });

  it("refuses two default stacks, because the picker starts in one place", () => {
    const { problems } = loadSeedSource(
      "roles.yaml",
      role("      - { stack: one, default: true }\n      - { stack: two, default: true }"),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain("only one stack can be the default");
  });

  it("refuses the same stack twice", () => {
    const { problems } = loadSeedSource(
      "roles.yaml",
      role("      - { stack: one, default: true }\n      - { stack: one, default: false }"),
    );
    expect(problems[0]?.message).toContain("a stack may be listed only once");
  });

  it("refuses the same level twice", () => {
    const source = role("      - { stack: one, default: true }").replace(
      "levels: [mid]",
      "levels: [mid, mid]",
    );
    expect(loadSeedSource("roles.yaml", source).problems[0]?.message).toContain(
      "a level may be listed only once",
    );
  });
});

describe("the seed corpus we ship", () => {
  it("is valid against the contract, every file", () => {
    const { files, problems } = loadSeedDirectory(SEED_ROOT, resolve(__dirname, "../../../.."));
    expect(problems.map(formatProblem)).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it("is all drafted content, marked as such (CLAUDE.md §7.7)", () => {
    const { files } = loadSeedDirectory(SEED_ROOT);
    for (const { file, data } of files) {
      expect({ file, status: data.status }).toEqual({ file, status: "draft" });
      expect(data.author).toBe("ai_draft");
    }
  });

  it("names a rubric and a topic that some file defines, for every question", () => {
    const { files } = loadSeedDirectory(SEED_ROOT);
    const topics = new Set(files.flatMap(({ data }) => data.topics ?? []).map((t) => t.slug));
    const rubrics = new Set(files.flatMap(({ data }) => data.rubrics ?? []).map((r) => r.slug));
    for (const { data } of files) {
      for (const question of data.questions ?? []) {
        expect({ slug: question.slug, topic: topics.has(question.topic) }).toEqual({
          slug: question.slug,
          topic: true,
        });
        expect({ slug: question.slug, rubric: rubrics.has(question.rubric) }).toEqual({
          slug: question.slug,
          rubric: true,
        });
      }
    }
  });

  it("gives every question notes for the reviewer", () => {
    // An empty field usually means nobody looked; the contract requires one, and so does review.
    const { files } = loadSeedDirectory(SEED_ROOT);
    for (const { data } of files) {
      for (const question of data.questions ?? []) {
        expect({ slug: question.slug, notes: question.reviewer_notes.length > 40 }).toEqual({
          slug: question.slug,
          notes: true,
        });
      }
    }
  });

  it("has the eight frontend questions the milestone asks for, in a mix of types", () => {
    const questions = findSeedFiles(join(SEED_ROOT, "frontend"))
      .map((path) => loadSeedSource(path, readFileSync(path, "utf8")).data)
      .flatMap((file) => file?.questions ?? []);
    expect(questions).toHaveLength(8);
    expect(new Set(questions.map((question) => question.type))).toEqual(
      new Set(["technical", "scenario", "behavioral"]),
    );
  });

  it("gives every rubric criteria that add up to a whole score", () => {
    const { files } = loadSeedDirectory(SEED_ROOT);
    for (const { data } of files) {
      for (const rubric of data.rubrics ?? []) {
        const total = rubric.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
        expect({ slug: rubric.slug, total }).toEqual({ slug: rubric.slug, total: 100 });
      }
    }
  });
});
