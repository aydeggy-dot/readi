import { join } from "node:path";
import type { QuestionType } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { loadSeedDirectory } from "../content/seed-loader";
import { type SelectableQuestion, selectQuestions } from "./question-selection";

const question = (id: string, overrides: Partial<SelectableQuestion> = {}): SelectableQuestion => ({
  questionId: id,
  topicId: `topic-${id}`,
  type: "technical",
  difficulty: 3,
  lastSeenAt: null,
  seenRecently: false,
  ...overrides,
});

const pool = (
  count: number,
  overrides: (index: number) => Partial<SelectableQuestion> = () => ({}),
) => Array.from({ length: count }, (_, index) => question(`q${index}`, overrides(index)));

const ids = (chosen: readonly SelectableQuestion[]) => chosen.map((item) => item.questionId);

describe("selectQuestions", () => {
  it("is deterministic given the seed, and the seed is what changes the outcome", () => {
    const questions = pool(20);
    const types: QuestionType[] = ["technical"];
    const first = selectQuestions({ pool: questions, count: 4, seed: "seed-a", types });
    const again = selectQuestions({ pool: questions, count: 4, seed: "seed-a", types });
    const other = selectQuestions({ pool: questions, count: 4, seed: "seed-b", types });

    expect(ids(first)).toEqual(ids(again));
    expect(ids(first)).not.toEqual(ids(other));
  });

  it("does not depend on the order the pool arrives in", () => {
    const questions = pool(20);
    const shuffled = [...questions].reverse();
    const types: QuestionType[] = ["technical"];
    expect(ids(selectQuestions({ pool: questions, count: 5, seed: "s", types }))).toEqual(
      ids(selectQuestions({ pool: shuffled, count: 5, seed: "s", types })),
    );
  });

  it("never asks the same question twice in one session", () => {
    const chosen = selectQuestions({
      pool: pool(6),
      count: 6,
      seed: "s",
      types: ["technical"],
    });
    expect(new Set(ids(chosen)).size).toBe(6);
  });

  it("returns what it can when the pool is smaller than the budget", () => {
    const chosen = selectQuestions({ pool: pool(2), count: 8, seed: "s", types: ["technical"] });
    expect(chosen).toHaveLength(2);
  });

  it("spreads a mixed session over the types the session asked for", () => {
    const questions = [
      ...pool(6, () => ({ type: "technical" })).map((q) => ({
        ...q,
        questionId: `t-${q.questionId}`,
      })),
      ...pool(6, () => ({ type: "behavioral" })).map((q) => ({
        ...q,
        questionId: `b-${q.questionId}`,
      })),
      ...pool(6, () => ({ type: "scenario" })).map((q) => ({
        ...q,
        questionId: `s-${q.questionId}`,
      })),
    ];
    const chosen = selectQuestions({
      pool: questions,
      count: 6,
      seed: "mixed",
      types: ["technical", "behavioral", "scenario"],
    });
    const perType = new Map<string, number>();
    for (const item of chosen) perType.set(item.type, (perType.get(item.type) ?? 0) + 1);
    expect([...perType.values()].sort()).toEqual([2, 2, 2]);
  });

  it("asks a type it has questions for even when another type has run out", () => {
    const questions: SelectableQuestion[] = [
      { ...question("t-1"), type: "technical" },
      ...pool(5, () => ({ type: "behavioral" })),
    ];
    const chosen = selectQuestions({
      pool: questions,
      count: 4,
      seed: "s",
      types: ["technical", "behavioral"],
    });
    expect(chosen).toHaveLength(4);
    expect(chosen.filter((item) => item.type === "technical")).toHaveLength(1);
  });

  it("skips what was asked in the last three sessions while anything else is left", () => {
    const questions = [
      ...pool(4).map((q) => ({ ...q, questionId: `seen-${q.questionId}`, seenRecently: true })),
      ...pool(4).map((q) => ({ ...q, questionId: `fresh-${q.questionId}` })),
    ];
    const chosen = selectQuestions({
      pool: questions,
      count: 4,
      seed: "s",
      types: ["technical"],
    });
    expect(ids(chosen).every((id) => id.startsWith("fresh-"))).toBe(true);
  });

  it("falls back to the least recently seen, oldest first, when everything is recent", () => {
    const day = (n: number) => new Date(Date.UTC(2026, 0, n));
    const questions = [
      { ...question("newest"), seenRecently: true, lastSeenAt: day(9) },
      { ...question("oldest"), seenRecently: true, lastSeenAt: day(1) },
      { ...question("middle"), seenRecently: true, lastSeenAt: day(5) },
    ];
    const chosen = selectQuestions({
      pool: questions,
      count: 3,
      seed: "s",
      types: ["technical"],
    });
    expect(ids(chosen)).toEqual(["oldest", "middle", "newest"]);
  });

  it("leans toward weak topics", () => {
    // Over many seeds rather than one: the lean is a weight, not a rule.
    const questions = [
      ...pool(10).map((q) => ({ ...q, questionId: `weak-${q.questionId}`, topicId: "weak" })),
      ...pool(10).map((q) => ({ ...q, questionId: `other-${q.questionId}`, topicId: "other" })),
    ];
    let weakFirst = 0;
    for (let seed = 0; seed < 100; seed += 1) {
      const chosen = selectQuestions({
        pool: questions,
        count: 1,
        seed: `seed-${seed}`,
        types: ["technical"],
        weakTopicIds: ["weak"],
      });
      if (chosen[0]?.topicId === "weak") weakFirst += 1;
    }
    // Weighted 3:1, so far above half and nowhere near all of them.
    expect(weakFirst).toBeGreaterThan(60);
    expect(weakFirst).toBeLessThan(95);
  });

  /**
   * The thin-corpus case, against the corpus that is actually thin.
   *
   * Backend at intern-junior offers 18 questions, 14 of them general (closing handover,
   * 2026-09-25), so a candidate practising there exhausts the fresh ones in their fourth session
   * and the least-recently-seen fallback becomes the normal path. This reads the real seed files
   * rather than a fixture, because the number is the point — and asserts a floor rather than an
   * exact count, so writing more backend questions does not fail a test about selection.
   */
  describe("against the real backend intern-junior corpus", () => {
    const seedRoot = join(__dirname, "../../../../content/seed");
    const loaded = loadSeedDirectory(seedRoot);

    const backendGeneral = loaded.files
      .flatMap((file) => file.data.questions ?? [])
      .filter(
        (q) =>
          q.roles.includes("backend") &&
          q.levels.includes("intern-junior") &&
          (q.stacks ?? []).length === 0,
      );

    it("loads a pool thin enough for the fallback to matter", () => {
      expect(loaded.problems).toEqual([]);
      expect(backendGeneral.length).toBeGreaterThanOrEqual(10);
      expect(backendGeneral.length).toBeLessThan(30);
    });

    it("still fills four sessions in a row, and never repeats inside one", () => {
      const corpus: SelectableQuestion[] = backendGeneral.map((q) => ({
        questionId: q.slug,
        topicId: q.topic,
        type: q.type,
        difficulty: q.difficulty,
        lastSeenAt: null,
        seenRecently: false,
      }));
      const types = [...new Set(corpus.map((q) => q.type))];

      const askedIn: string[][] = [];
      for (let session = 0; session < 5; session += 1) {
        const recent = new Set(askedIn.slice(-3).flat());
        const lastSeen = new Map<string, Date>();
        askedIn.forEach((asked, index) => {
          for (const id of asked) lastSeen.set(id, new Date(Date.UTC(2026, 0, index + 1)));
        });
        const chosen = selectQuestions({
          pool: corpus.map((q) => ({
            ...q,
            seenRecently: recent.has(q.questionId),
            lastSeenAt: lastSeen.get(q.questionId) ?? null,
          })),
          count: 4,
          seed: `session-${session}`,
          types,
        });
        expect(chosen).toHaveLength(4);
        expect(new Set(ids(chosen)).size).toBe(4);
        askedIn.push(ids(chosen));
      }

      // The first three sessions are disjoint: that is the "not in the last three" rule holding.
      const firstThree = askedIn.slice(0, 3).flat();
      expect(new Set(firstThree).size).toBe(firstThree.length);
    });
  });
});
