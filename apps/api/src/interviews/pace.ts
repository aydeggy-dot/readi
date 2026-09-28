/**
 * How long a candidate actually takes to answer — measured, so the engine's reserves stop being a
 * guess (M4 phase 7).
 *
 * `interview/budgets.py` decides whether to open another question by asking whether the answer
 * **and one probe** still fit (`SECONDS_TO_OPEN_A_QUESTION`, the owner's decision of 2026-09-27).
 * Those numbers were written before anybody had typed an answer into this, and the comment on
 * `SECONDS_FOR_A_QUESTION` says as much: "roughly enough for the answer, if not for the probing".
 * This module is what replaces "roughly".
 *
 * **It reports; the constants are the owner's.** Nothing here changes behaviour, and the reserves
 * are passed in rather than imported so the arithmetic has no opinion about them — the CLI supplies
 * what the engine currently uses and the report prints both side by side.
 *
 * ## Three things a naive version of this gets wrong
 *
 * **Not every candidate turn is an answer.** Spec §4.3 gives the candidate their own questions at
 * the end, and those are candidate turns too — 8 of the 51 in the first database this ran against.
 * Counted as answers they reported 6 questions in a session whose budget was 4, which is how the
 * mistake was caught; uncaught, they would also have dragged the median down, because a candidate's
 * question is short. An answer is a turn with a `sessionQuestionId`, and nothing else is.
 *
 * **An opening answer and a follow-up answer are different jobs**, and the turn's own `state` says
 * which: `question` or `follow_up`. Their own questions are measured too but kept apart, because
 * `SECONDS_FOR_CANDIDATE_QUESTIONS` is a reserve as well.
 *
 * **A session the stand-in drove is not evidence about pace.** `LLM_PROVIDER=fake` answers in
 * microseconds, so its interviewer latency is noise, and a scripted session is not a person typing.
 * The first database this ran against held 47 fake calls and 42 real ones, mixed. So sessions that
 * never reached a real model are **excluded and counted**, never averaged in.
 *
 * ## What a turn's timing means, and what it does not
 *
 * A candidate turn spans from the interviewer finishing to the answer arriving
 * (`interview-sessions.repository.ts`), so it is reading **plus** thinking **plus** typing: exactly
 * what a reserve has to cover. It also covers a candidate who walked away, and nothing in the data
 * can tell that from one who thought hard. So the report leads with the **median**, gives p90 beside
 * it, prints the longest, and counts answers that ran past the session's own length — an answer
 * longer than the whole interview is somebody's lunch break, and a p90 with one of those in it would
 * set a constant wrongly.
 */
import type { InterviewState, TurnSpeaker } from "@readi/shared-types";

/** One turn, as the report needs it. */
export interface PaceTurn {
  seq: number;
  speaker: TurnSpeaker;
  state: InterviewState;
  /** Null on every turn outside a question — the intro, the close, the candidate's own questions. */
  sessionQuestionId: string | null;
  text: string;
  /** Milliseconds from the session's `started_at`. */
  startedMs: number;
  endedMs: number;
}

export interface PaceSession {
  id: string;
  plannedMinutes: number;
  questionBudget: number;
  maxFollowUps: number;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  /** Whether any call in it reached a real provider (`model_config`), rather than the stand-in. */
  usedRealModel: boolean;
  turns: readonly PaceTurn[];
}

/** The reserves the engine currently applies, in seconds — `interview/budgets.py`. */
export interface PaceReserves {
  forAQuestion: number;
  forAFollowUp: number;
  toOpenAQuestion: number;
  forCandidateQuestions: number;
}

export interface Spread {
  n: number;
  medianSeconds: number;
  p90Seconds: number;
  maxSeconds: number;
  medianWords: number;
  p90Words: number;
  /** Turns that ran past the planned length of their own session — somebody was away. */
  longerThanTheSession: number;
}

export interface SessionPace {
  id: string;
  status: string;
  plannedMinutes: number;
  /** Null while a session has not ended; an abandoned one ends when the sweep says so. */
  actualMinutes: number | null;
  questionsAnswered: number;
  questionBudget: number;
  followUpsAnswered: number;
  ownQuestionsAsked: number;
}

export interface FitsIn {
  minutes: number;
  /** At the median pace, and at p90 — the pessimistic one is what a reserve should respect. */
  atMedian: number;
  atP90: number;
}

export interface PaceReport {
  /** Sessions measured, after the stand-in ones were set aside. */
  sessions: number;
  sessionsWithAnAnswer: number;
  /** Sessions that never reached a real model, and so are not evidence about pace. */
  sessionsExcludedAsFake: number;
  openingAnswers: Spread;
  followUpAnswers: Spread;
  /** The candidate's own questions at the end — not answers, and measured for their own reserve. */
  ownQuestions: Spread;
  /** What the candidate waited for the interviewer, which is the other half of every pace unit. */
  interviewerLatency: Spread;
  perSession: readonly SessionPace[];
  /** Seconds one question really costs: its answer, plus `maxFollowUps` probes and their answers. */
  questionUnitSeconds: { atMedian: number; atP90: number; maxFollowUps: number };
  fits: readonly FitsIn[];
  /** How the current reserves stand against the measurement. */
  reserves: {
    current: PaceReserves;
    /** Opening answers that ran past `forAQuestion` — the reserve that admits a question. */
    answersOverForAQuestion: number;
    followUpsOverForAFollowUp: number;
    ownQuestionsOverTheirReserve: number;
    /** A p90 answer plus a p90 probe against `toOpenAQuestion`. False means it is optimistic. */
    toOpenAQuestionCoversP90: boolean;
  };
}

/**
 * Nearest-rank: the smallest value at or above the quantile, never interpolated, so every figure the
 * report prints is a duration somebody really took. Empty is 0, which reads as "none".
 */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(q * sorted.length);
  const index = Math.min(Math.max(rank, 1), sorted.length) - 1;
  // `index` is clamped into [0, length - 1] over a non-empty array, so the fallback is unreachable;
  // it is what `noUncheckedIndexedAccess` costs for a bound the compiler cannot see, not a value
  // anybody should ever read.
  return sorted[index] ?? 0;
}

/** Words, the way a person counts them. Only ever compared with itself, so runs of space are one. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

interface Sample {
  seconds: number;
  words: number;
  sessionSeconds: number;
}

function spread(samples: readonly Sample[]): Spread {
  const seconds = samples.map((sample) => sample.seconds);
  const words = samples.map((sample) => sample.words);
  return {
    n: samples.length,
    medianSeconds: round(quantile(seconds, 0.5)),
    p90Seconds: round(quantile(seconds, 0.9)),
    maxSeconds: round(seconds.length === 0 ? 0 : Math.max(...seconds)),
    medianWords: Math.round(quantile(words, 0.5)),
    p90Words: Math.round(quantile(words, 0.9)),
    longerThanTheSession: samples.filter((sample) => sample.seconds > sample.sessionSeconds).length,
  };
}

/**
 * Everything the report says, from the sessions given. Pure: no clock, no database, no constants of
 * its own.
 */
export function measurePace(
  allSessions: readonly PaceSession[],
  reserves: PaceReserves,
  fitMinutes: readonly number[] = [15, 30, 45],
): PaceReport {
  const sessions = allSessions.filter((session) => session.usedRealModel);
  const opening: Sample[] = [];
  const followUp: Sample[] = [];
  const own: Sample[] = [];
  const latency: Sample[] = [];
  const perSession: SessionPace[] = [];

  for (const session of sessions) {
    const sessionSeconds = session.plannedMinutes * 60;
    let questionsAnswered = 0;
    let followUpsAnswered = 0;
    let ownQuestionsAsked = 0;

    for (const turn of session.turns) {
      const sample = {
        seconds: Math.max(0, (turn.endedMs - turn.startedMs) / 1000),
        words: countWords(turn.text),
        sessionSeconds,
      };
      if (turn.speaker === "interviewer") {
        latency.push(sample);
        continue;
      }
      // An answer is a turn attached to a question. A candidate turn without one is them asking
      // something of their own (spec §4.3) — a real part of the session, and not an answer.
      if (turn.sessionQuestionId === null) {
        own.push(sample);
        ownQuestionsAsked += 1;
        continue;
      }
      if (turn.state === "follow_up") {
        followUp.push(sample);
        followUpsAnswered += 1;
      } else {
        opening.push(sample);
        questionsAnswered += 1;
      }
    }

    perSession.push({
      id: session.id,
      status: session.status,
      plannedMinutes: session.plannedMinutes,
      actualMinutes:
        session.endedAt === null
          ? null
          : round((session.endedAt.getTime() - session.startedAt.getTime()) / 60_000),
      questionsAnswered,
      questionBudget: session.questionBudget,
      followUpsAnswered,
      ownQuestionsAsked,
    });
  }

  const openingSpread = spread(opening);
  const followUpSpread = spread(followUp);
  const ownSpread = spread(own);
  const latencySpread = spread(latency);
  const maxFollowUps = Math.max(0, ...sessions.map((session) => session.maxFollowUps));
  // The pace unit the engine reserves for: this question's answer, plus every probe it may ask and
  // the answer to each. The interviewer's latency is in it once per turn, because the candidate
  // waits through it before they can start.
  const unit = (kind: "medianSeconds" | "p90Seconds"): number =>
    // No answer measured means no pace, and the answer is 0 rather than the latency alone. Without
    // this, sessions opened and abandoned before anybody typed gave a pace of a few seconds a
    // question and a report claiming several hundred fit in 45 minutes — a figure that looks like a
    // measurement and is made of nothing. A unit test watched it happen.
    openingSpread.n === 0
      ? 0
      : round(
          openingSpread[kind] +
            latencySpread[kind] +
            maxFollowUps * (followUpSpread[kind] + latencySpread[kind]),
        );
  const atMedian = unit("medianSeconds");
  const atP90 = unit("p90Seconds");

  return {
    sessions: sessions.length,
    sessionsWithAnAnswer: sessions.filter((session) =>
      session.turns.some((turn) => turn.speaker === "candidate" && turn.sessionQuestionId !== null),
    ).length,
    sessionsExcludedAsFake: allSessions.length - sessions.length,
    openingAnswers: openingSpread,
    followUpAnswers: followUpSpread,
    ownQuestions: ownSpread,
    interviewerLatency: latencySpread,
    perSession,
    questionUnitSeconds: { atMedian, atP90, maxFollowUps },
    fits: fitMinutes.map((minutes) => ({
      minutes,
      atMedian: atMedian === 0 ? 0 : Math.floor((minutes * 60) / atMedian),
      atP90: atP90 === 0 ? 0 : Math.floor((minutes * 60) / atP90),
    })),
    reserves: {
      current: reserves,
      answersOverForAQuestion: opening.filter((s) => s.seconds > reserves.forAQuestion).length,
      followUpsOverForAFollowUp: followUp.filter((s) => s.seconds > reserves.forAFollowUp).length,
      ownQuestionsOverTheirReserve: own.filter((s) => s.seconds > reserves.forCandidateQuestions)
        .length,
      toOpenAQuestionCoversP90:
        reserves.toOpenAQuestion >= openingSpread.p90Seconds + followUpSpread.p90Seconds,
    },
  };
}

/**
 * How few answers is too few to set a constant from.
 *
 * Not a statistical threshold — there is no distribution here worth testing — but the point past
 * which a p90 stops being one person's slowest answer. Under it the report says so in its first line
 * and again beside every figure, because the requirement was that a guess must not be able to pass
 * for data, and a table of numbers is exactly how a guess does that.
 */
export const ENOUGH_ANSWERS = 40;

function fmt(seconds: number): string {
  return seconds.toFixed(seconds < 10 ? 1 : 0);
}

function figure(label: string, values: Spread, enough: boolean): string[] {
  if (values.n === 0) return [label, "     none of these"];
  return [
    label,
    `     n=${String(values.n).padStart(3)}   median ${fmt(values.medianSeconds)}s   ` +
      `p90 ${fmt(values.p90Seconds)}s   longest ${fmt(values.maxSeconds)}s   ` +
      `words ${values.medianWords}/${values.p90Words}${enough ? "" : "  <- thin"}`,
  ];
}

/** The report as a page. It leads with the sample size and never prints a figure without one. */
export function renderPace(report: PaceReport): string {
  const answers = report.openingAnswers.n + report.followUpAnswers.n;
  const enough = answers >= ENOUGH_ANSWERS;
  const lines: string[] = [
    `Answer pace over ${report.sessions} session(s) that reached a real model, ` +
      `${report.sessionsWithAnAnswer} with an answer in them — ${answers} answer(s) in total.`,
  ];
  if (report.sessionsExcludedAsFake > 0) {
    lines.push(
      `${report.sessionsExcludedAsFake} further session(s) never reached a real model and are left ` +
        "out: the stand-in answers in microseconds, so its latency is noise and a scripted",
      "session is not a person typing.",
    );
  }
  lines.push("");
  if (!enough) {
    lines.push(
      `NOT ENOUGH TO SET A CONSTANT FROM. ${answers} answers is under ${ENOUGH_ANSWERS}, so the ` +
        "p90s below are one or two people's slowest answers and nothing more. Everything here is",
      "printed so the shape can be looked at, not so a number can be copied out of it.",
      "",
    );
  }
  lines.push(
    ...figure(
      "Opening answers — reading the question, thinking, typing:",
      report.openingAnswers,
      enough,
    ),
    ...figure("Follow-up answers — one probe, already in context:", report.followUpAnswers, enough),
    ...figure("The candidate's own questions at the end (spec §4.3):", report.ownQuestions, enough),
    ...figure(
      "Interviewer latency — what the candidate waited, per turn:",
      report.interviewerLatency,
      enough,
    ),
    "",
  );
  const away =
    report.openingAnswers.longerThanTheSession + report.followUpAnswers.longerThanTheSession;
  if (away > 0) {
    lines.push(
      `${away} answer(s) took longer than the whole planned session, so somebody was away and the ` +
        "p90 above is inflated by it. Nothing in the data can tell that from thinking hard.",
      "",
    );
  }

  const unit = report.questionUnitSeconds;
  lines.push(
    `One question costs its answer plus ${unit.maxFollowUps} probe(s) and their answers, with the ` +
      "interviewer's latency once per turn:",
    `     at the median  ${fmt(unit.atMedian)}s      at p90  ${fmt(unit.atP90)}s`,
    "",
    "Questions that fit, if a session were nothing but questions:",
  );
  for (const fit of report.fits) {
    lines.push(
      `     ${String(fit.minutes).padStart(2)} minutes   ${fit.atMedian} at the median pace, ` +
        `${fit.atP90} at p90`,
    );
  }
  lines.push(
    "",
    "     A session is not nothing but questions: the intro, the candidate's own questions and the",
    "     close are outside every figure above, so treat these as a ceiling.",
    "",
    "Against the reserves the engine applies now (interview/budgets.py):",
    `     SECONDS_FOR_A_QUESTION           ${report.reserves.current.forAQuestion}s   ` +
      `${report.reserves.answersOverForAQuestion} of ${report.openingAnswers.n} opening answers ran past it`,
    `     SECONDS_FOR_A_FOLLOW_UP           ${report.reserves.current.forAFollowUp}s   ` +
      `${report.reserves.followUpsOverForAFollowUp} of ${report.followUpAnswers.n} follow-up answers ran past it`,
    `     SECONDS_FOR_CANDIDATE_QUESTIONS   ${report.reserves.current.forCandidateQuestions}s   ` +
      `${report.reserves.ownQuestionsOverTheirReserve} of ${report.ownQuestions.n} own questions ran past it`,
    `     SECONDS_TO_OPEN_A_QUESTION       ${report.reserves.current.toOpenAQuestion}s   ` +
      `${report.reserves.toOpenAQuestionCoversP90 ? "covers" : "DOES NOT COVER"} a p90 answer plus a p90 probe ` +
      `(${fmt(report.openingAnswers.p90Seconds + report.followUpAnswers.p90Seconds)}s)`,
    "",
    "Per session — planned against actual, and what fitted:",
    "     planned  actual  answers  follow-ups  own qs  status",
  );
  for (const session of report.perSession) {
    lines.push(
      `     ${String(session.plannedMinutes).padStart(7)}  ` +
        `${(session.actualMinutes === null ? "—" : fmt(session.actualMinutes)).padStart(6)}  ` +
        `${`${session.questionsAnswered}/${session.questionBudget}`.padStart(7)}  ` +
        `${String(session.followUpsAnswered).padStart(10)}  ` +
        `${String(session.ownQuestionsAsked).padStart(6)}  ${session.status}`,
    );
  }
  lines.push("", "It reports; the constants are the owner's. Nothing here changes the engine.");
  return lines.join("\n");
}
