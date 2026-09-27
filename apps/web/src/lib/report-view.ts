import type { CandidatePrompting, SessionReportResponse } from "@readi/shared-types";
import type { MessageKey } from "@/i18n";

/**
 * The arithmetic and the wording choices behind the report screen, kept out of the components so they
 * can be tested (`report-view.test.ts`) and so the page stays a layout.
 *
 * Nothing here scores anything. The score is assembled in the API, in code, under `SCORING_VERSION`
 * (`apps/api/src/evaluations/report-assembly.ts`); this only decides which sentence describes it.
 */

/**
 * The four bands, cut at 40, 60 and 75 — the same lines ADR-0013 puts on a chart and the same 60 that
 * spec §7 calls "practised". A band is a *label beside a number*, never instead of one: the number is
 * always on the page, so a candidate who disagrees with the word can still read the score.
 */
export type ScoreBand = "weak" | "developing" | "solid" | "strong";

export function scoreBand(overall: number): ScoreBand {
  if (overall >= 75) return "strong";
  if (overall >= 60) return "solid";
  if (overall >= 40) return "developing";
  return "weak";
}

/** The band's label key, so the copy lives in `en.json` with everything else. */
export const bandKey = (overall: number): MessageKey =>
  `interview.report.bands.${scoreBand(overall)}` as MessageKey;

/**
 * How much of the whole session the candidate volunteered, added up across its questions.
 *
 * Counted over **every** answered question, including one that could not be scored: which probes the
 * engine had to ask is a fact about the interview that a failed evaluation does not erase
 * (`CandidateQuestionReport.prompting` is filled from the engine's own record either way). A candidate
 * reading "you covered 7 of 11" should be reading about the interview they sat.
 */
export interface SessionPrompting {
  /**
   * The points the session was **scored on**, added up — `criteria_total` per question, which is the
   * rubric's criteria less any the interview never asked about. A point nobody put to the candidate is
   * not one they failed to volunteer, so counting it here would make the one number in the report they
   * can move read worse than the interview was.
   */
  total: number;
  /** Those the candidate covered before any probe was asked. */
  volunteered: number;
  /** Questions where at least one follow-up was asked. */
  questionsPrompted: number;
  questions: number;
}

export function sessionPrompting(
  questions: readonly { prompting: CandidatePrompting }[],
): SessionPrompting {
  return {
    total: questions.reduce((sum, question) => sum + question.prompting.criteria_total, 0),
    volunteered: questions.reduce(
      (sum, question) => sum + question.prompting.criteria_volunteered,
      0,
    ),
    questionsPrompted: questions.filter((question) => question.prompting.follow_ups_asked > 0)
      .length,
    questions: questions.length,
  };
}

/** One i18n key and the numbers it needs — what a component hands straight to `t()`. */
export interface Sentence {
  key: MessageKey;
  vars: Record<string, string | number>;
}

/**
 * The session's volunteered-vs-prompted line (the owner's decision 6, 2026-09-26).
 *
 * Three wordings rather than one with a plural engine, because the two ends of the range are the two
 * a candidate remembers: **all** of it volunteered is worth saying as praise, and **none** of it is
 * worth saying plainly rather than as "0 of 11". The middle case is the ordinary one.
 */
export function volunteeredSentence(prompting: SessionPrompting): Sentence {
  const vars = { volunteered: prompting.volunteered, total: prompting.total };
  if (prompting.total > 0 && prompting.volunteered === prompting.total) {
    return { key: "interview.report.volunteeredAll", vars };
  }
  if (prompting.volunteered === 0) return { key: "interview.report.volunteeredNone", vars };
  return { key: "interview.report.volunteered", vars };
}

/** The second half of the same idea, counted in questions rather than points. */
export function promptedSentence(prompting: SessionPrompting): Sentence {
  const vars = { prompted: prompting.questionsPrompted, questions: prompting.questions };
  if (prompting.questionsPrompted === 0) return { key: "interview.report.promptedNone", vars };
  if (prompting.questionsPrompted === 1) return { key: "interview.report.promptedOne", vars };
  return { key: "interview.report.prompted", vars };
}

/**
 * One question's own line. The follow-up count is in it because it is the visible half of the prompting
 * rule — a candidate can count the follow-ups in their own transcript, which is exactly why the score
 * is keyed on the engine's record of them and never on the coverage model's private verdict.
 */
export function questionPromptingSentence(prompting: CandidatePrompting): Sentence {
  const vars = {
    volunteered: prompting.criteria_volunteered,
    total: prompting.criteria_total,
    followUps: prompting.follow_ups_asked,
  };
  if (prompting.follow_ups_asked === 0) {
    return { key: "interview.report.questionPromptingNone", vars };
  }
  return {
    key:
      prompting.follow_ups_asked === 1
        ? "interview.report.questionPrompting"
        : "interview.report.questionPromptingMany",
    vars,
  };
}

/**
 * "We did not get to ask you about these" — the criteria left out of an answer's score (the owner's
 * decision, 2026-09-27).
 *
 * One wording for one point and one for several, rather than a plural engine, because one is the
 * ordinary case: a question carries a probe per criterion its opening does not ask for, and it is
 * usually the last of them the clock takes. The sentence says plainly that they are **not in the
 * score**, which is the part a candidate has to be able to check — an answer marked out of two of
 * three criteria and not saying so is a number nobody can reconcile with their own transcript.
 */
export function notAssessedSentence(count: number): Sentence {
  const vars = { count };
  return {
    key: count === 1 ? "interview.report.notAssessedOne" : "interview.report.notAssessed",
    vars,
  };
}

/**
 * How much of the session could be scored, in words.
 *
 * A **one**-answer session gets its own two wordings rather than a plural engine — "All 1 answers
 * scored" is the same bug the completion screen's "in 1 minutes" was, and an answer count of one is
 * ordinary here: a candidate who ends after the first question still gets a report.
 */
export function scoredSentence(
  report: Pick<SessionReportResponse, "scored_answers" | "total_answers">,
): Sentence {
  const vars = { scored: report.scored_answers, total: report.total_answers };
  const one = report.total_answers === 1;
  if (report.scored_answers === report.total_answers) {
    return { key: one ? "interview.report.scoredAllOne" : "interview.report.scoredAll", vars };
  }
  if (report.scored_answers === 0) {
    return { key: one ? "interview.report.scoredNoneOne" : "interview.report.scoredNone", vars };
  }
  return { key: "interview.report.scoredSome", vars };
}

/** "Backend engineer · Mid-level · React" — the pinned names, in the order the setup screen asks. */
export function catalogueLine(report: SessionReportResponse): string {
  return [report.role.name, report.level.name, report.stack?.name]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/**
 * The date a candidate means by "that interview": when it ended.
 *
 * `ended_at` is nullable on the contract and `generated_at` is not, so this falls back — but the
 * fallback is second because a report recovered by the sweep days later was assembled days later, and
 * the interview still happened when it happened.
 */
export const reportDate = (report: SessionReportResponse): string =>
  (report.ended_at ?? report.generated_at).slice(0, 10);
