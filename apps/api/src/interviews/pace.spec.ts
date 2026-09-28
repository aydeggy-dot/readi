import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countWords,
  ENOUGH_ANSWERS,
  measurePace,
  type PaceSession,
  type PaceTurn,
  quantile,
  renderPace,
} from "./pace";
import { ENGINE_RESERVES } from "./pace-reserves";

function turn(partial: Partial<PaceTurn> & { seq: number }): PaceTurn {
  return {
    speaker: "candidate",
    state: "question",
    sessionQuestionId: "q1",
    text: "because the write and the read raced",
    startedMs: 0,
    endedMs: 0,
    ...partial,
  };
}

/** One question: the interviewer asks, the candidate answers, then `probes` probe-and-answer pairs. */
function exchange(
  start: number,
  answerSeconds: number,
  probes: readonly number[] = [],
): PaceTurn[] {
  const turns: PaceTurn[] = [];
  let at = start;
  let seq = turns.length;
  turns.push(turn({ seq: seq++, speaker: "interviewer", startedMs: at, endedMs: at + 2_000 }));
  at += 2_000;
  turns.push(turn({ seq: seq++, startedMs: at, endedMs: at + answerSeconds * 1_000 }));
  at += answerSeconds * 1_000;
  for (const probeSeconds of probes) {
    turns.push(
      turn({
        seq: seq++,
        speaker: "interviewer",
        state: "follow_up",
        startedMs: at,
        endedMs: at + 2_000,
      }),
    );
    at += 2_000;
    turns.push(
      turn({ seq: seq++, state: "follow_up", startedMs: at, endedMs: at + probeSeconds * 1_000 }),
    );
    at += probeSeconds * 1_000;
  }
  return turns.map((entry, index) => ({ ...entry, seq: index }));
}

/** The first entry, checked — `noUncheckedIndexedAccess` is on and a silent undefined in a test
 * assertion is a test that proves nothing. */
function only<T>(items: readonly T[]): T {
  const first = items[0];
  if (first === undefined) throw new Error("expected at least one entry");
  return first;
}

function session(partial: Partial<PaceSession> = {}): PaceSession {
  return {
    id: "s1",
    plannedMinutes: 30,
    questionBudget: 8,
    maxFollowUps: 2,
    status: "completed",
    usedRealModel: true,
    startedAt: new Date("2026-09-28T10:00:00Z"),
    endedAt: new Date("2026-09-28T10:28:00Z"),
    turns: exchange(0, 90, [30, 30]),
    ...partial,
  };
}

describe("quantile", () => {
  it("is nearest-rank, so p90 is a value somebody really took", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(values, 0.5)).toBe(5);
    expect(quantile(values, 0.9)).toBe(9);
    // Never interpolated: a reserve set from a number nobody took would be indefensible in a review.
    expect(values).toContain(quantile(values, 0.9));
  });

  it("answers 0 for nothing rather than throwing, because an empty slice is an ordinary case", () => {
    expect(quantile([], 0.5)).toBe(0);
  });
});

describe("measurePace", () => {
  it("tells an opening answer from a follow-up answer by the state the turn was in", () => {
    const report = measurePace([session({ turns: exchange(0, 90, [30, 20]) })], ENGINE_RESERVES);
    expect(report.openingAnswers.n).toBe(1);
    expect(report.openingAnswers.medianSeconds).toBe(90);
    expect(report.followUpAnswers.n).toBe(2);
    // 20, not 25: nearest-rank takes the lower of two rather than interpolating, so every figure
    // the report prints is a duration somebody really took.
    expect(report.followUpAnswers.medianSeconds).toBe(20);
    expect(only(report.perSession)).toMatchObject({ questionsAnswered: 1, followUpsAnswered: 2 });
  });

  it("counts the interviewer's latency separately, once per turn", () => {
    const report = measurePace([session({ turns: exchange(0, 90, [30, 20]) })], ENGINE_RESERVES);
    // Three interviewer turns at 2 s: the question and two probes.
    expect(report.interviewerLatency.n).toBe(3);
    expect(report.interviewerLatency.medianSeconds).toBe(2);
  });

  it("prices a question as its answer plus every probe it may ask, latency included", () => {
    const report = measurePace([session({ turns: exchange(0, 90, [30, 30]) })], ENGINE_RESERVES);
    // 90 + 2 (the asking) + 2 x (30 + 2) = 156, worked out here rather than copied from a run.
    expect(report.questionUnitSeconds.atMedian).toBe(156);
    expect(report.questionUnitSeconds.maxFollowUps).toBe(2);
    const fortyFive = report.fits.find((fit) => fit.minutes === 45);
    expect(fortyFive?.atMedian).toBe(Math.floor(2_700 / 156));
  });

  it("holds the reserves to the measurement, and says when one does not cover p90", () => {
    const slow = session({ turns: exchange(0, 200, [90]) });
    const report = measurePace([slow], ENGINE_RESERVES);
    expect(report.reserves.answersOverForAQuestion).toBe(1);
    expect(report.reserves.followUpsOverForAFollowUp).toBe(1);
    // 200 + 90 is past SECONDS_TO_OPEN_A_QUESTION, which is the case the owner's 2026-09-27 decision
    // was about: a question opened with no room to probe it.
    expect(report.reserves.toOpenAQuestionCoversP90).toBe(false);

    const brisk = measurePace([session({ turns: exchange(0, 60, [20]) })], ENGINE_RESERVES);
    expect(brisk.reserves.toOpenAQuestionCoversP90).toBe(true);
    expect(brisk.reserves.answersOverForAQuestion).toBe(0);
  });

  it("does not count the candidate's own questions as answers", () => {
    /*
     * The bug the first real run exposed. Spec §4.3 gives the candidate their own questions at the
     * end and those are candidate turns too — 8 of 51 in the dev database. Counted as answers, the
     * report said a 15-minute session had answered 6 questions against a budget of 4, which is an
     * impossible number and is how it was caught. It would also have dragged the median down,
     * because a candidate's question is short.
     */
    const withOwnQuestions = session({
      plannedMinutes: 15,
      questionBudget: 4,
      turns: [
        ...exchange(0, 90),
        turn({
          seq: 99,
          speaker: "interviewer",
          state: "candidate_questions",
          sessionQuestionId: null,
          startedMs: 100_000,
          endedMs: 101_000,
        }),
        turn({
          seq: 100,
          state: "candidate_questions",
          sessionQuestionId: null,
          text: "how soon do people hear back?",
          startedMs: 101_000,
          endedMs: 109_000,
        }),
      ],
    });
    const report = measurePace([withOwnQuestions], ENGINE_RESERVES);
    expect(report.openingAnswers.n).toBe(1);
    expect(only(report.perSession).questionsAnswered).toBeLessThanOrEqual(
      only(report.perSession).questionBudget,
    );
    expect(report.ownQuestions.n).toBe(1);
    expect(report.ownQuestions.medianSeconds).toBe(8);
    expect(only(report.perSession).ownQuestionsAsked).toBe(1);
  });

  it("leaves out a session the stand-in drove, and counts it as left out", () => {
    // `LLM_PROVIDER=fake` answers in microseconds, so its latency is noise and a scripted session is
    // not a person typing. The dev database held 47 fake calls beside 42 real ones.
    const report = measurePace(
      [session({ turns: exchange(0, 90) }), session({ id: "fake", usedRealModel: false })],
      ENGINE_RESERVES,
    );
    expect(report.sessions).toBe(1);
    expect(report.sessionsExcludedAsFake).toBe(1);
    expect(report.perSession).toHaveLength(1);
    expect(renderPace(report)).toContain("never reached a real model");
  });

  it("counts an answer longer than the whole session, because that is somebody's lunch break", () => {
    const away = session({ plannedMinutes: 15, turns: exchange(0, 1_200) });
    const report = measurePace([away], ENGINE_RESERVES);
    expect(report.openingAnswers.longerThanTheSession).toBe(1);
    expect(renderPace(report)).toContain("longer than the whole planned session");
  });

  it("reports planned against actual, and leaves an unfinished session's actual null", () => {
    const report = measurePace(
      [
        session({ endedAt: new Date("2026-09-28T10:21:00Z") }),
        session({ id: "s2", endedAt: null }),
      ],
      ENGINE_RESERVES,
    );
    expect(only(report.perSession).actualMinutes).toBe(21);
    expect(report.perSession.at(1)?.actualMinutes).toBeNull();
  });

  it("survives a session with no answers at all", () => {
    const empty = session({
      turns: [
        turn({
          seq: 0,
          speaker: "interviewer",
          state: "intro",
          sessionQuestionId: null,
          startedMs: 0,
          endedMs: 1_000,
        }),
      ],
    });
    const report = measurePace([empty], ENGINE_RESERVES);
    expect(report.sessions).toBe(1);
    expect(report.sessionsWithAnAnswer).toBe(0);
    expect(report.openingAnswers.n).toBe(0);
    // No answers means no pace, and therefore no count of questions that fit — never a division by
    // zero dressed up as Infinity questions per session.
    expect(report.fits.every((fit) => fit.atMedian === 0)).toBe(true);
  });
});

describe("renderPace", () => {
  it("leads with the sample size and says so twice when the sample is thin", () => {
    const page = renderPace(measurePace([session()], ENGINE_RESERVES));
    expect(page).toMatch(
      /^Answer pace over 1 session\(s\) that reached a real model, 1 with an answer/,
    );
    expect(page).toContain("NOT ENOUGH TO SET A CONSTANT FROM");
    expect(page).toContain("<- thin");
    expect(page).toContain("the constants are the owner's");
  });

  it("drops the warning once there are enough answers", () => {
    const many = Array.from({ length: ENOUGH_ANSWERS }, (_, index) =>
      session({ id: `s${index}`, turns: exchange(0, 90) }),
    );
    const page = renderPace(measurePace(many, ENGINE_RESERVES));
    expect(page).not.toContain("NOT ENOUGH TO SET A CONSTANT FROM");
    expect(page).not.toContain("<- thin");
  });

  it("calls the fitted counts a ceiling, because a session is not only questions", () => {
    expect(renderPace(measurePace([session()], ENGINE_RESERVES))).toContain("as a ceiling");
  });
});

describe("countWords", () => {
  it("counts the way a person would, and an empty answer as none", () => {
    expect(countWords("  two  words  ")).toBe(2);
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("ENGINE_RESERVES", () => {
  /*
   * The reserves are the worker's (`interview/budgets.py`) and this is a TypeScript copy of three
   * integers, which CLAUDE.md is right to distrust: two copies drift. So the copy is not trusted —
   * it is checked against the original file, the way `ask-vectors.json` keeps the ask counter's two
   * implementations honest. A report that printed "SECONDS_TO_OPEN_A_QUESTION 165s" while the engine
   * applied 200 would be worse than no report, because somebody would set a constant from it.
   */
  const source = readFileSync(
    resolve(__dirname, "../../../ai-worker/readi_worker/interview/budgets.py"),
    "utf8",
  );
  const pythonValue = (name: string): number => {
    const match = new RegExp(`^${name} = (\\d+)$`, "m").exec(source);
    if (!match) throw new Error(`budgets.py no longer defines ${name} as a literal`);
    return Number(match[1]);
  };

  it("matches interview/budgets.py", () => {
    expect(ENGINE_RESERVES.forAQuestion).toBe(pythonValue("SECONDS_FOR_A_QUESTION"));
    expect(ENGINE_RESERVES.forAFollowUp).toBe(pythonValue("SECONDS_FOR_A_FOLLOW_UP"));
    // The third is derived there — the answer plus one probe (the owner's decision, 2026-09-27) —
    // so it is checked as the sum rather than as a literal, which is also what keeps it correct if
    // either part moves.
    expect(ENGINE_RESERVES.toOpenAQuestion).toBe(
      ENGINE_RESERVES.forAQuestion + ENGINE_RESERVES.forAFollowUp,
    );
    expect(source).toContain(
      "SECONDS_TO_OPEN_A_QUESTION = SECONDS_FOR_A_QUESTION + SECONDS_FOR_A_FOLLOW_UP",
    );
  });
});
