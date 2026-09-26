import { describe, expect, it } from "vitest";
import {
  bundleQuestion,
  candidateQuestion,
  type QuestionForSnapshot,
  questionsWithNoProbes,
  sessionBundle,
  snapshotOf,
} from "./session-bundle";

/**
 * The two doors out of a pinned snapshot, and what each one is not allowed to carry.
 *
 * Built like the leak test it is the unit-level half of: every answer-key string in the fixture is
 * a unique marker, and the first assertion proves the snapshot really holds them. A test that
 * "found no rubric" in a fixture that never had one proves nothing.
 */

const IDEAL = "MARKER-ideal-point";
const DIMENSION = "MARKER-dimension";
const DESCRIPTION = "MARKER-criterion-description";
const DESCRIPTOR = "MARKER-level-descriptor";
const RUBRIC_NAME = "MARKER-rubric-name";
const PROBE = "MARKER-probe";
const PROMPT = "VISIBLE how would you make this endpoint fast?";
const TOPIC = "Caching";

const question = (): QuestionForSnapshot => ({
  slug: "a-slow-endpoint",
  type: "technical",
  difficulty: 3,
  prompt: PROMPT,
  context: null,
  idealPoints: [`${IDEAL}-1`, `${IDEAL}-2`],
  plannedFollowUps: [
    { criterion: 1, probe: `${PROBE}-1` },
    { criterion: 2, probe: `${PROBE}-2` },
  ],
  topic: {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "caching",
    name: TOPIC,
    description: null,
  },
  rubric: {
    slug: "endpoint-performance",
    name: RUBRIC_NAME,
    criteria: [0, 1, 2].map((position) => ({
      position,
      dimension: `${DIMENSION}-${position}`,
      description: `${DESCRIPTION}-${position}`,
      weight: position === 0 ? 40 : 30,
      levels: Object.fromEntries(
        ["0", "1", "2", "3", "4"].map((band) => [band, `${DESCRIPTOR}-${position}-${band}`]),
      ),
    })),
  },
});

const answerKey = [IDEAL, DIMENSION, DESCRIPTION, DESCRIPTOR, RUBRIC_NAME];
const json = (value: unknown) => JSON.stringify(value);

describe("snapshotOf", () => {
  it("pins the answer key, so there is something to leak in the first place", () => {
    const raw = json(snapshotOf(question()));
    for (const marker of answerKey) expect(raw).toContain(marker);
    expect(raw).toContain(PROBE);
  });

  it("orders the criteria by position, however they arrive", () => {
    const shuffled = question();
    shuffled.rubric.criteria.reverse();
    expect(snapshotOf(shuffled).rubric.criteria.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it("refuses a question whose stored follow-ups are not follow-ups", () => {
    const broken = { ...question(), plannedFollowUps: [{ criterion: "first", probe: 7 }] };
    // Named by slug — content, not personal data — so the log says which row to look at.
    expect(() => snapshotOf(broken)).toThrow();
  });
});

describe("bundleQuestion", () => {
  const bundled = bundleQuestion(snapshotOf(question()), 0);

  it("carries nothing the interviewer model has no use for", () => {
    /*
     * The rule this file exists for (owner's decision, 2026-09-23). The interviewer model phrases
     * a probe the engine chose and judges whether an answer already covered one; neither needs the
     * criteria, the weights or the level descriptors, so none of them cross. The rubric reaches
     * the evaluator in M4, which is a different call with a different prompt.
     */
    const raw = json(bundled);
    for (const marker of answerKey) expect(raw).not.toContain(marker);
    expect(Object.keys(bundled)).not.toContain("rubric");
    expect(Object.keys(bundled)).not.toContain("ideal_points");
  });

  it("carries the probes, which are the whole point of it", () => {
    expect(bundled.planned_follow_ups.map((plan) => plan.probe)).toEqual([
      `${PROBE}-1`,
      `${PROBE}-2`,
    ]);
  });

  it("says how many criteria there are without saying what they are", () => {
    // So the coverage log can record "criterion 0 has no probe" without being told what it is.
    expect(bundled.criterion_count).toBe(3);
  });

  it("speaks the topic's name, not its slug", () => {
    expect(bundled.topic_label).toBe(TOPIC);
  });
});

describe("candidateQuestion", () => {
  const asked = new Date("2026-09-25T10:00:00.000Z");
  const shown = candidateQuestion(snapshotOf(question()), 2, asked);

  it("carries no answer key at all — the probes included", () => {
    const raw = json(shown);
    for (const marker of answerKey) expect(raw).not.toContain(marker);
    /*
     * The probes are the difference between this and the bundle: they tell a candidate what they
     * are about to be asked next, so they are answer key on this side of the wall even though the
     * worker needs them on the other.
     */
    expect(raw).not.toContain(PROBE);
  });

  it("carries what the candidate is supposed to read", () => {
    expect(shown.prompt).toBe(PROMPT);
    expect(shown.position).toBe(2);
    expect(shown.asked_at).toBe(asked.toISOString());
  });
});

describe("sessionBundle", () => {
  it("describes the candidate in labels, and in nothing else", () => {
    const bundle = sessionBundle(
      {
        id: "11111111-1111-4111-8111-111111111111",
        mode: "text",
        persona: "friendly",
        isDiagnostic: true,
        plannedMinutes: 15,
        endsAt: new Date("2026-09-25T10:15:00.000Z"),
        questionBudget: 4,
        maxFollowUps: 2,
      },
      [snapshotOf(question())],
      {
        role_label: "Backend engineer",
        level_label: "Mid-level",
        stack_label: "Java / Spring",
        weak_topics: [],
      },
    );
    expect(bundle.candidate).toEqual({
      role_label: "Backend engineer",
      level_label: "Mid-level",
      stack_label: "Java / Spring",
      weak_topics: [],
    });
    // Positions are the session's own numbering, not the question's id anywhere.
    expect(bundle.questions.map((q) => q.position)).toEqual([0]);
    expect(json(bundle)).not.toContain("a-slow-endpoint");
  });
});

/**
 * What the first paid run looked like from the outside, as a predicate.
 *
 * Four questions, no follow-ups, and every criterion but the one the opening asked charged for
 * something the candidate was never asked. The cause was a stale dev database, but the candidate
 * cannot tell a stale database from a badly written question, and `check-bank.mjs` already makes
 * this an error in the files — so if one reaches a session, something is wrong upstream of here.
 */
describe("a question the engine cannot follow up on", () => {
  const withProbes = (probes: QuestionForSnapshot["plannedFollowUps"]): QuestionForSnapshot => ({
    ...question(),
    plannedFollowUps: probes,
  });

  it("is named when a multi-criterion question carries no probes", () => {
    expect(questionsWithNoProbes([snapshotOf(withProbes([]))])).toEqual(["a-slow-endpoint"]);
  });

  it("is not named when the question carries any probe at all", () => {
    expect(questionsWithNoProbes([snapshotOf(question())])).toEqual([]);
    expect(
      questionsWithNoProbes([snapshotOf(withProbes([{ criterion: 1, probe: "And then?" }]))]),
    ).toEqual([]);
  });

  it("is not named when there is only one criterion, which the opening asks", () => {
    const base = question();
    const single: QuestionForSnapshot = {
      ...withProbes([]),
      rubric: { ...base.rubric, criteria: base.rubric.criteria.slice(0, 1) },
    };
    expect(questionsWithNoProbes([snapshotOf(single)])).toEqual([]);
  });
});
