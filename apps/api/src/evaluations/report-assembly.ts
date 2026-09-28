import {
  type AnswerEvaluation,
  type CandidateCriterionFeedback,
  type CandidateQuestionReport,
  EVALUATION_LIMITS,
  MAX_CRITERION_SCORE,
  type QuestionType,
  type RecommendedLesson,
  type ReportHighlight,
  type ReportTopicScore,
  type ReportTypeScore,
  type SessionCatalogue,
  type SessionReportResponse,
  type SessionReportStatus,
  type Topic,
} from "@readi/shared-types";
import type { AnswerScore } from "./scoring";
import { sessionOverall } from "./scoring";

/**
 * The session report, assembled **in code** from the per-answer JSON (CLAUDE.md §5 "Evaluation").
 *
 * No model writes a report here. Asking one to would be asking it to re-read four evaluations it has
 * already made and summarise them, which is a second opportunity to be wrong about the first — and it
 * would make the report unreproducible from its own inputs, so a candidate disputing it and a
 * reviewer calibrating it would be looking at different things. Everything below is arithmetic and
 * selection over the stored evaluations, and it is pure: the same rows always assemble the same
 * report.
 *
 * ## What is in it, and the three spec corrections it carries
 *
 * Spec §4.4 asks for "overall score, per-dimension scores, top 3 strengths, top 3 fixes, per-question
 * breakdown with 'what a strong answer covers', links to relevant lessons".
 *
 * - **"per-dimension" cannot mean what it says** (owner's decision 3). A rubric's dimensions are free
 *   prose written for one question — "Looks at what actually ran" — so there is nothing to average
 *   across a session. What genuinely aggregates is **topic** and **question type**, which is also the
 *   shape §7's readiness buckets need. Per-criterion scores stay, inside each question's breakdown.
 * - **"what a strong answer covers" is the pinned `ideal_points`** (owner's decision 4) — answer key
 *   everywhere else, allowed here because the session has already been scored. The same narrowing M3
 *   made for planned follow-ups, which are answer key right up until an interviewer speaks one.
 * - **Volunteered-vs-prompted is in the report, in words** (owner's decision 6), as counts the web
 *   turns into one sentence per question. Not a per-criterion grid: "you covered two of the three
 *   before I asked" is advice, and a table of which ones is an answer key with extra steps.
 *
 * And one thing the spec does not ask for at all, added after the first paid run (owner's decision,
 * 2026-09-27): **a criterion the interview never asked about is named, and is not in the score**. An
 * answer scored on two of three criteria has to say which one is missing, or its number cannot be
 * checked against the transcript — and a candidate who finds nothing in their own interview that asked
 * about a point they lost 35% of an answer to has been told something untrue by us.
 *
 * And what is never in it: a criterion's `description`, its `weight`, or any of the five level
 * descriptors. `CandidateCriterionFeedback` is a separate, smaller shape rather than the admin one
 * with fields omitted (ADR-0014 decision 3), because an omission is one careless `.extend()` from a
 * leak.
 */

/** One answered question, everything the report needs about it, from the **pinned** snapshot. */
export interface AnswerForReport {
  position: number;
  type: QuestionType;
  topic: Topic;
  prompt: string;
  /** Pinned `ideal_points`. */
  idealPoints: string[];
  /** Pinned criteria, in rubric order: position and the dimension name only. */
  criteria: { position: number; dimension: string }[];
  /**
   * The engine facts, which exist whether or not the answer could be scored: the probes it asked and
   * the criteria they were for (`promptedCriteria()`).
   */
  followUpsAsked: number;
  promptedCriteria: number[];
  /**
   * The criteria this answer was **not scored on** — never asked about, and not covered anyway
   * (`notAssessedCriteria()`). Read from the stored row rather than recomputed, so the report names
   * exactly the set `overall` was computed from.
   */
  notAssessedCriteria: number[];
  /** Null when this answer could not be scored; the rest of the report still stands. */
  evaluation: AnswerEvaluation | null;
  score: AnswerScore | null;
}

export interface ReportInput {
  sessionId: string;
  /**
   * What the session said it was interviewing for — `interview_sessions.catalogue`, the pinned names.
   * Never the live rows: renaming a role must not rewrite a report somebody has already read.
   */
  catalogue: SessionCatalogue;
  /** Answered questions, in the order they were asked. A question nobody answered is not here. */
  answers: readonly AnswerForReport[];
  /** Lessons for the topics that went worst, from the repository. Often none. */
  lessons: readonly RecommendedLesson[];
  /** When the interview ended. Null only if a session somehow reached scoring without it set. */
  endedAt: Date | null;
  generatedAt: Date;
}

export function assembleReport(input: ReportInput): SessionReportResponse {
  const scored = input.answers.filter((answer) => answer.score !== null);
  const overalls = scored.map((answer) => answer.score?.overall ?? 0);

  return {
    session_id: input.sessionId,
    status: statusOf(input.answers.length, scored.length),
    ...input.catalogue,
    overall: sessionOverall(overalls),
    scored_answers: scored.length,
    total_answers: input.answers.length,
    strengths: highlights(scored, "strengths"),
    fixes: highlights(scored, "fixes"),
    by_topic: byTopic(scored),
    by_type: byType(scored),
    questions: input.answers.map(questionReport),
    lessons: input.lessons.slice(0, EVALUATION_LIMITS.lessonsPerReport),
    ended_at: input.endedAt?.toISOString() ?? null,
    generated_at: input.generatedAt.toISOString(),
  };
}

/**
 * `ready` is every answer scored, `partial` is some, `failed` is none — and the last one says so
 * plainly rather than showing a 0. A session with no answers at all does not get a report (no job is
 * enqueued for one), so that case reads as `failed` here only if it is ever reached.
 */
function statusOf(total: number, scored: number): SessionReportStatus {
  if (total === 0 || scored === 0) return "failed";
  return scored === total ? "ready" : "partial";
}

/**
 * The top three strengths and the top three fixes, **chosen in code** (spec §4.4).
 *
 * Chosen by where they came from rather than by asking a model which mattered most: strengths from the
 * questions that went best, fixes from the questions that went worst. That is the ranking a candidate
 * would make themselves, it is reproducible, and it cannot flatter — the three fixes are the three
 * that stand to gain the most marks.
 *
 * A fix is the answer's own `improvement_tip`, which is one per answer by contract ("one concrete,
 * actionable tip — not a list wearing a singular name"), so a three-question session yields at most
 * three fixes and a one-question session yields one. Fewer than three is the honest number, not a
 * shortfall to pad.
 */
function highlights(
  scored: readonly AnswerForReport[],
  kind: "strengths" | "fixes",
): ReportHighlight[] {
  const order = [...scored].sort((a, b) =>
    kind === "strengths"
      ? (b.score?.overall ?? 0) - (a.score?.overall ?? 0)
      : (a.score?.overall ?? 0) - (b.score?.overall ?? 0),
  );
  const items = order.flatMap((answer) =>
    (kind === "strengths"
      ? (answer.evaluation?.strengths ?? [])
      : [answer.evaluation?.improvement_tip].filter((tip): tip is string => Boolean(tip))
    ).map((text) => ({ text, question_position: answer.position })),
  );
  return dedupe(items).slice(0, EVALUATION_LIMITS.reportHighlights);
}

/**
 * Same advice twice is one piece of advice. Compared case- and space-insensitively, and the **first**
 * occurrence keeps its question — which is the best answer's for a strength and the worst answer's for
 * a fix, because the list is already in that order. A tip that two answers earned is attributed to the
 * one where following it gains the most.
 */
function dedupe(items: readonly ReportHighlight[]): ReportHighlight[] {
  const seen = new Set<string>();
  const kept: ReportHighlight[] = [];
  for (const item of items) {
    const key = item.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return kept;
}

/**
 * Scores by topic, weakest first.
 *
 * Weakest first because this list is read to decide what to study, and the topic at the top of a
 * report is the one a candidate acts on. Only scored answers count, so a topic whose one answer could
 * not be scored is absent rather than present at 0 — `ReportTopicScore.answers` is a count of answers
 * that really produced a score, which is what makes a one-answer topic readable as the thin evidence
 * it is.
 */
function byTopic(scored: readonly AnswerForReport[]): ReportTopicScore[] {
  const groups = new Map<string, { topic: Topic; overalls: number[] }>();
  for (const answer of scored) {
    const group = groups.get(answer.topic.slug) ?? { topic: answer.topic, overalls: [] };
    group.overalls.push(answer.score?.overall ?? 0);
    groups.set(answer.topic.slug, group);
  }
  return [...groups.values()]
    .map((group) => ({
      topic: group.topic,
      overall: sessionOverall(group.overalls) ?? 0,
      answers: group.overalls.length,
    }))
    .sort((a, b) => a.overall - b.overall || a.topic.slug.localeCompare(b.topic.slug));
}

function byType(scored: readonly AnswerForReport[]): ReportTypeScore[] {
  const groups = new Map<QuestionType, number[]>();
  for (const answer of scored) {
    groups.set(answer.type, [...(groups.get(answer.type) ?? []), answer.score?.overall ?? 0]);
  }
  return [...groups.entries()]
    .map(([type, overalls]) => ({
      type,
      overall: sessionOverall(overalls) ?? 0,
      answers: overalls.length,
    }))
    .sort((a, b) => a.overall - b.overall || a.type.localeCompare(b.type));
}

/**
 * One question's breakdown.
 *
 * The criteria are joined **from the pinned rubric to the evaluator's scores by position**, so a
 * criterion the model somehow failed to score is absent rather than shown at 0 — the worker's first
 * gate makes that unreachable, and inventing a 0 for it would be putting words in the rubric's mouth.
 * Only `dimension`, the score, the quotes and the reasoning cross; the description, the weight and the
 * ladder do not.
 *
 * A criterion the interview never asked about goes in `not_assessed` **instead of** `criteria`, by its
 * dimension and with no number beside it (owner's decision, 2026-09-27). Showing it as "0 of 4" is the
 * thing that was wrong: the score it is not in cannot explain a 0 it does not contain, and a candidate
 * reading their own transcript would find nothing that asked. Exactly one of the two lists holds it,
 * so the page cannot say both.
 */
function questionReport(answer: AnswerForReport): CandidateQuestionReport {
  const scoreAt = new Map(
    (answer.evaluation?.criteria ?? []).map((criterion) => [criterion.criterion, criterion]),
  );
  const notAssessedSet = new Set(answer.notAssessedCriteria);
  const assessed = answer.criteria.filter((pinned) => !notAssessedSet.has(pinned.position));
  const criteria: CandidateCriterionFeedback[] = assessed.flatMap((pinned) => {
    const scored = scoreAt.get(pinned.position);
    if (!scored) return [];
    return [
      {
        dimension: pinned.dimension,
        score: scored.score,
        max_score: MAX_CRITERION_SCORE,
        evidence: scored.evidence,
        reasoning: scored.reasoning,
      } satisfies CandidateCriterionFeedback,
    ];
  });

  return {
    position: answer.position,
    type: answer.type,
    topic: answer.topic,
    prompt: answer.prompt,
    overall: answer.score?.overall ?? null,
    criteria,
    covered_points: answer.evaluation?.covered_points ?? [],
    missing_points: answer.evaluation?.missing_points ?? [],
    // The pinned ideal points, shown whether or not this answer could be scored: "what a strong
    // answer covers" is the most useful thing on the page for a question that went badly, and it is
    // no more secret on an unscored answer than on a scored one.
    strong_answer_covers: answer.idealPoints,
    improvement_tip: answer.evaluation?.improvement_tip ?? null,
    red_flags: answer.evaluation?.red_flags ?? [],
    // Named in rubric order, because that is the order the criteria above are in.
    not_assessed: answer.criteria
      .filter((pinned) => notAssessedSet.has(pinned.position))
      .map((pinned) => pinned.dimension),
    prompting: {
      // The points this answer was scored on, which is the denominator of the sentence the candidate
      // reads. "You covered 2 of 3 before I asked" is a lie about the interview if the third was
      // never put to them.
      criteria_total: assessed.length,
      // Everything the engine did not have to ask about. Clamped, so a snapshot and a transcript that
      // disagree cannot produce a negative count on a candidate's screen.
      criteria_volunteered: Math.max(0, assessed.length - answer.promptedCriteria.length),
      follow_ups_asked: answer.followUpsAsked,
    },
  };
}
