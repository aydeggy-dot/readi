import { describe, expect, it } from "vitest";
import { formatDrift, hasDrift } from "./seed-drift";
import type { SeedCounts, SeedReport } from "./seed-import";

/**
 * `--check`: does the database say what the files say?
 *
 * This exists because the report alone was not enough. Before the first paid interview run
 * (2026-09-25) a dry run printed "questions: 73 to update" and named 31 more under "left alone —
 * published"; it was read, and the run went ahead anyway on content three days stale, which is the
 * single reason that run produced no follow-ups. Prose in a command that exits 0 is advisory.
 */

const counts = (over: Partial<SeedCounts> = {}): SeedCounts => ({
  created: 0,
  updated: 0,
  unchanged: 0,
  reviewed: 0,
  skipped: [],
  published: [],
  ...over,
});

const report = (over: Partial<Record<keyof SeedReport, SeedCounts>> = {}): SeedReport => ({
  career_levels: counts(),
  stacks: counts(),
  career_roles: counts(),
  topics: counts(),
  rubrics: counts(),
  questions: counts(),
  tracks: counts(),
  modules: counts(),
  lessons: counts(),
  ...over,
});

describe("hasDrift", () => {
  it("is quiet when everything is unchanged", () => {
    expect(hasDrift(report({ questions: counts({ unchanged: 104 }) }))).toBe(false);
    expect(formatDrift(report())).toContain("the database matches content/seed");
  });

  /** The exact shape of the paid run's dry run: content the database has not got. */
  it("catches content the files have and the database has not", () => {
    expect(hasDrift(report({ questions: counts({ updated: 73, unchanged: 31 }) }))).toBe(true);
    expect(hasDrift(report({ rubrics: counts({ created: 1 }) }))).toBe(true);
  });

  /** …and the other half of it: content it has, and will not take. */
  it("catches published rows the importer is refusing to update", () => {
    const drifted = report({ questions: counts({ published: ["db-half-finished-transfer"] }) });
    expect(hasDrift(drifted)).toBe(true);
    expect(formatDrift(drifted).join("\n")).toContain("--force-published");
  });

  it("catches CMS-owned rows, and says the bigger command is needed for them", () => {
    const drifted = report({ questions: counts({ skipped: ["an-edited-question"] }) });
    expect(hasDrift(drifted)).toBe(true);
    const said = formatDrift(drifted).join("\n");
    expect(said).toContain("--force");
    expect(said).not.toContain("--force-published");
  });

  /**
   * A file claiming a person has vouched for words the database still marks as an unreviewed draft
   * is a difference too — and the one that decides whether publishing is refused in production.
   */
  it("catches an author-only flip", () => {
    expect(hasDrift(report({ questions: counts({ reviewed: 1, unchanged: 104 }) }))).toBe(true);
  });
});
