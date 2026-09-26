import { z } from "zod";
import {
  CONTENT_LIMITS,
  EVALUATION_CONFIDENCE,
  EVALUATION_LIMITS,
  MAX_CRITERION_SCORE,
} from "../constants.js";
import { QuestionType, Topic } from "./content.js";
import { AiCallRecord } from "./cv.js";
import { TurnSpeaker } from "./interviews.js";
import { Slug } from "./slug.js";

/**
 * Evaluation: how one answer becomes a score, and what a candidate is then shown (spec §4.4, §6.2;
 * CLAUDE.md §5 "Evaluation").
 *
 * ## The fourth width, and the first time a rubric reaches a model
 *
 * `interviews.ts` describes a question at three widths — the pinned snapshot, which never leaves the
 * API; the bundle question, which carries no answer key at all; and the candidate question. M4 adds a
 * fourth, and it is the only one that carries the rubric: `EvaluateAnswerRequest`. It is built by
 * `evaluationRequest()` in `apps/api/src/interviews/session-bundle.ts`, beside the other two doors,
 * because one file crossing the widths is the rule that has held since M3.
 *
 * Two things the evaluator is deliberately **not** given, although the snapshot has both:
 *
 * - **The criterion weights.** The model scores each criterion on its own evidence; how much each is
 *   worth is arithmetic and belongs in code (spec §6.2: "computed in code"). Telling a model that one
 *   criterion is 45% of the answer invites it to spend its judgement there and skim the rest, and
 *   there is no version of that which makes a score more honest.
 * - **The planned follow-ups.** They are already in the transcript wherever the engine actually asked
 *   one, and sending the unasked ones would have the model scoring "did they answer the probe"
 *   instead of "does the answer meet this criterion".
 *
 * ## The prompting adjustment is not in here either
 *
 * Whether a criterion was only reached after the engine asked about it changes the **weighting**, in
 * code, under `SCORING_VERSION` (owner's decision, 2026-09-26). The model is never told, for the same
 * reason it is not told the weights: it would be scoring the interview rather than the answer. What is
 * stored is the model's raw per-criterion score untouched, so the `/evals` agreement metric compares
 * a human to the model and not to our arithmetic.
 *
 * ## Which schemas carry `.meta({ id })`
 *
 * As everywhere else (ADR-0003): a registered contract carries no root id; reusable nested pieces do.
 */

const text = (max: number) => z.string().trim().min(1).max(max);
const label = () => text(CONTENT_LIMITS.titleMaxLength);

// -----------------------------------------------------------------------------------------------
// What the evaluator is given.

/**
 * One rubric criterion as the evaluator sees it: what it scores, and the five rungs of its ladder.
 * No `weight` — see the header.
 */
export const EvaluationCriterion = z
  .object({
    /** Its position in the pinned rubric. The identifier everywhere: a snapshot has no row ids. */
    position: z.int().min(0),
    dimension: text(CONTENT_LIMITS.dimensionMaxLength),
    description: text(CONTENT_LIMITS.criterionDescriptionMaxLength),
    /** Keyed `"0"`–`"4"`, as the rubric stores them. */
    levels: z.record(z.string(), text(CONTENT_LIMITS.levelDescriptorMaxLength)),
  })
  .meta({ id: "EvaluationCriterion" });
export type EvaluationCriterion = z.infer<typeof EvaluationCriterion>;

/**
 * The question, exactly as the session was run against it — read from
 * `interview_session_questions.snapshot` and never from the live `questions` row. An admin editing a
 * published question after the session must not change what the candidate was scored on, which is the
 * whole reason the snapshot exists (ADR-0014 decision 2).
 */
export const EvaluationQuestion = z
  .object({
    slug: Slug,
    type: QuestionType,
    topic: Topic,
    prompt: text(CONTENT_LIMITS.questionPromptMaxLength),
    context: text(CONTENT_LIMITS.questionContextMaxLength).nullable(),
    /** What a strong answer covers. Answer key — and, after scoring, the one part a candidate sees. */
    ideal_points: z.array(text(CONTENT_LIMITS.idealPointMaxLength)).max(CONTENT_LIMITS.idealPoints),
    rubric: z.object({
      slug: Slug,
      name: label(),
      criteria: z
        .array(EvaluationCriterion)
        .min(CONTENT_LIMITS.rubricCriteria.min)
        .max(CONTENT_LIMITS.rubricCriteria.max),
    }),
  })
  .meta({ id: "EvaluationQuestion" });
export type EvaluationQuestion = z.infer<typeof EvaluationQuestion>;

/**
 * One turn of the exchange being scored: the question as it was actually spoken, the answer, any
 * follow-up the engine asked and the answer to that. The evaluator scores the **combined** answer,
 * because a candidate who needed a nudge still said the thing.
 *
 * `kind` has one member today and exists so that it can have two. When the coding round arrives
 * ([P2], owner's decision 2026-09-25) a turn's content is a program and a test result rather than
 * prose, and that should be a new member of this union rather than a rename of `text` — a rename
 * would reach every stored evaluation. It costs one string on the wire.
 */
export const EvaluationTurn = z
  .object({
    kind: z.literal("text"),
    seq: z.int().min(0),
    speaker: TurnSpeaker,
    /** Which planned probe the interviewer was asking, if this turn was a follow-up. */
    follow_up_index: z.int().min(0).nullable(),
    text: text(CONTENT_LIMITS.questionPromptMaxLength + EVALUATION_LIMITS.evidenceMaxLength),
  })
  .meta({ id: "EvaluationTurn" });
export type EvaluationTurn = z.infer<typeof EvaluationTurn>;

/** `POST /evaluate/answer` on the worker: one answer, so each is retried and stored on its own. */
export const EvaluateAnswerRequest = z.object({
  session_id: z.uuid(),
  /**
   * Opaque, and carried for exactly one reason: it puts a user on the Langfuse trace so account
   * erasure can find it again (ADR-0008, ADR-0011). It reaches no prompt.
   */
  user_id: z.uuid(),
  /** Which question of the session this is — the answer's identity, with `session_id`. */
  position: z.int().min(0),
  question: EvaluationQuestion,
  exchange: z.array(EvaluationTurn).min(1),
});
export type EvaluateAnswerRequest = z.infer<typeof EvaluateAnswerRequest>;

// -----------------------------------------------------------------------------------------------
// What comes back.

export const EvaluationConfidence = z
  .enum(EVALUATION_CONFIDENCE)
  .meta({ id: "EvaluationConfidence" });
export type EvaluationConfidence = z.infer<typeof EvaluationConfidence>;

/**
 * One criterion's score, and the words it is based on.
 *
 * `evidence` is quoted from the candidate's own turns and **verified in code** against them before
 * this is stored: a quote that cannot be found is dropped and the confidence lowered, and a non-zero
 * score left with no evidence is invalid output and retried (spec §6.2, CLAUDE.md §5 "Evaluation").
 * `evidenceRuleViolations` is that rule, written once and checked on both sides of the boundary.
 */
export const CriterionScore = z
  .object({
    criterion: z.int().min(0),
    score: z.int().min(0).max(MAX_CRITERION_SCORE),
    /** What the score was out of, as it stood — not what we currently think the ladder is. */
    max_score: z.literal(MAX_CRITERION_SCORE),
    evidence: z
      .array(text(EVALUATION_LIMITS.evidenceMaxLength))
      .max(EVALUATION_LIMITS.evidencePerCriterion),
    reasoning: text(EVALUATION_LIMITS.reasoningMaxLength),
  })
  .meta({ id: "CriterionScore" });
export type CriterionScore = z.infer<typeof CriterionScore>;

/**
 * One answer, evaluated (spec §6.2). This is what the worker returns and what
 * `answer_evaluations.criteria` and its sibling columns hold — the model's reading, normalised but
 * not re-weighted. Nothing here has been adjusted for prompting and nothing is a percentage.
 */
export const AnswerEvaluation = z
  .object({
    criteria: z
      .array(CriterionScore)
      .min(CONTENT_LIMITS.rubricCriteria.min)
      .max(CONTENT_LIMITS.rubricCriteria.max),
    covered_points: z
      .array(text(EVALUATION_LIMITS.pointMaxLength))
      .max(EVALUATION_LIMITS.pointsPerAnswer),
    missing_points: z
      .array(text(EVALUATION_LIMITS.pointMaxLength))
      .max(EVALUATION_LIMITS.pointsPerAnswer),
    strengths: z
      .array(text(EVALUATION_LIMITS.strengthMaxLength))
      .max(EVALUATION_LIMITS.strengthsPerAnswer),
    improvement_tip: text(EVALUATION_LIMITS.tipMaxLength),
    /** Factual errors the candidate stated. Empty is the normal case, not a gap in the output. */
    red_flags: z
      .array(text(EVALUATION_LIMITS.redFlagMaxLength))
      .max(EVALUATION_LIMITS.redFlagsPerAnswer),
    confidence: EvaluationConfidence,
  })
  .meta({ id: "AnswerEvaluation" });
export type AnswerEvaluation = z.infer<typeof AnswerEvaluation>;

export const EvaluateAnswerResponse = z.object({
  position: z.int().min(0),
  /**
   * Absent when the model would not produce valid output after its retries. The answer is then
   * `failed` and the report says so for that question rather than inventing a score (ADR-0016's rule
   * for a model that will not answer, applied to scoring: a plainer report, not a broken one).
   */
  evaluation: AnswerEvaluation.nullable(),
  /** Why not, as a stable code. Never prose, and never anything the candidate wrote. */
  error: z.enum(["invalid_output", "refused", "provider_error", "timeout"]).nullable(),
  ai_calls: z.array(AiCallRecord),
});
export type EvaluateAnswerResponse = z.infer<typeof EvaluateAnswerResponse>;

// -----------------------------------------------------------------------------------------------
// The rule that has to hold in two languages (ADR-0003 decision 5).

/** Which criterion broke the rule, and the sentence a retry can put in front of the model. */
export interface EvidenceViolation {
  criterion: number;
  message: string;
}

/**
 * "A score of 0 may have empty evidence only when the criterion was not addressed at all; otherwise
 * evidence is mandatory" (spec §6.2).
 *
 * It is a function rather than a `.refine`, because a refinement does not survive export to JSON
 * Schema and so could not reach Pydantic — the rule would then exist on one side of the boundary and
 * be a comment on the other. The Python twin is `readi_worker/evaluation/evidence.py`, and both are
 * held to the same cases in `packages/shared-types/src/evidence-cases.json`, the way
 * `ask-vectors.json` already keeps the two ask-counters from drifting.
 *
 * Note what the rule does **not** forbid: a score of **0 with** evidence. A candidate can address a
 * criterion squarely and be wrong about it, and quoting the sentence where they were wrong is the
 * fairest thing the report does — it is the case the rubric descriptors were rewritten for in
 * September 2026 ("a confident, specific, wrong answer"). A rule that demanded empty evidence at 0
 * would push the evaluator into scoring 1 just to keep its quote.
 *
 * Returns one entry per offending criterion, in the rubric's order. Empty means the rule holds.
 */
export function evidenceRuleViolations(
  evaluation: Pick<AnswerEvaluation, "criteria">,
): EvidenceViolation[] {
  return evaluation.criteria
    .filter((criterion) => criterion.score > 0 && criterion.evidence.length === 0)
    .map((criterion) => ({
      criterion: criterion.criterion,
      message: `criterion ${criterion.criterion} scored ${criterion.score} with no evidence quoted`,
    }));
}

// -----------------------------------------------------------------------------------------------
// What the candidate reads. A separate, smaller shape — never an admin one with fields omitted
// (ADR-0014 decision 3), because an omission is one careless `.extend()` away from a leak.

/**
 * One criterion, as feedback.
 *
 * This is the narrowing that matters in M4, so it is worth being explicit about all four fields that
 * are **not** here. `description` and the five `levels` are the answer key in its most usable form —
 * a candidate reading the ladder knows exactly what sentence to say next time, which is preparation
 * for our rubric rather than for an interview. `weight` would turn a report into a guide to where the
 * marks are. And the criterion's `position` is not here because nothing candidate-facing needs it and
 * an index into a hidden list is an invitation to go looking for the list.
 *
 * What is here is the `dimension` — the name of the thing being judged, which is the vocabulary the
 * feedback is written in and useless as an answer key on its own — with the score, the words it was
 * based on, and why.
 */
export const CandidateCriterionFeedback = z
  .object({
    dimension: text(CONTENT_LIMITS.dimensionMaxLength),
    score: z.int().min(0).max(MAX_CRITERION_SCORE),
    max_score: z.literal(MAX_CRITERION_SCORE),
    evidence: z
      .array(text(EVALUATION_LIMITS.evidenceMaxLength))
      .max(EVALUATION_LIMITS.evidencePerCriterion),
    reasoning: text(EVALUATION_LIMITS.reasoningMaxLength),
  })
  .meta({ id: "CandidateCriterionFeedback" });
export type CandidateCriterionFeedback = z.infer<typeof CandidateCriterionFeedback>;

/**
 * How much of this answer the candidate volunteered (owner's decision, 2026-09-26).
 *
 * Keyed on what the **engine** did, not on what the coverage model judged: a probe the interviewer
 * actually asked is in the transcript, so a candidate can argue with it, and M3 wrote that
 * `criteria_covered` reaches the evaluator "as a prior and **never** as a score". Two criteria may
 * share one probe's worth of prompting and a criterion may carry two probes, so these are counted per
 * criterion from the probes that were asked rather than derived from `follow_ups_asked`.
 *
 * The web turns this into one sentence. It is not a per-criterion grid: "you covered two of three
 * before I asked" is advice, and a table of which ones is an answer key with extra steps.
 */
export const CandidatePrompting = z
  .object({
    criteria_total: z.int().min(0),
    criteria_volunteered: z.int().min(0),
    follow_ups_asked: z.int().min(0),
  })
  .meta({ id: "CandidatePrompting" });
export type CandidatePrompting = z.infer<typeof CandidatePrompting>;

export const CandidateQuestionReport = z
  .object({
    position: z.int().min(0),
    type: QuestionType,
    topic: Topic,
    prompt: text(CONTENT_LIMITS.questionPromptMaxLength),
    /** Null when this answer could not be scored; the rest of the report still stands. */
    overall: z.int().min(0).max(100).nullable(),
    criteria: z.array(CandidateCriterionFeedback).max(CONTENT_LIMITS.rubricCriteria.max),
    covered_points: z
      .array(text(EVALUATION_LIMITS.pointMaxLength))
      .max(EVALUATION_LIMITS.pointsPerAnswer),
    missing_points: z
      .array(text(EVALUATION_LIMITS.pointMaxLength))
      .max(EVALUATION_LIMITS.pointsPerAnswer),
    /**
     * The question's pinned `ideal_points`, promised to the candidate by spec §4.4 as "what a strong
     * answer covers". Answer key everywhere else and **allowed here only because the session has
     * already been scored** — the same narrowing M3 made for planned follow-ups, which are answer key
     * right up until an interviewer speaks them. The leak test asserts the count on this route and
     * their absence on every other.
     */
    strong_answer_covers: z
      .array(text(CONTENT_LIMITS.idealPointMaxLength))
      .max(CONTENT_LIMITS.idealPoints),
    improvement_tip: text(EVALUATION_LIMITS.tipMaxLength).nullable(),
    red_flags: z
      .array(text(EVALUATION_LIMITS.redFlagMaxLength))
      .max(EVALUATION_LIMITS.redFlagsPerAnswer),
    prompting: CandidatePrompting,
  })
  .meta({ id: "CandidateQuestionReport" });
export type CandidateQuestionReport = z.infer<typeof CandidateQuestionReport>;

/**
 * A score per topic and per question type — and **not** "per dimension", which spec §4.4 asks for and
 * which cannot mean what it says: a rubric's dimensions are free prose written for that one question
 * ("Looks at what actually ran"), so there is nothing to average across a session. Topic and type are
 * what genuinely aggregate, and they are also the shape §7's readiness buckets need. The spec is
 * corrected in the same change (CLAUDE.md §7.5).
 */
export const ReportTopicScore = z
  .object({ topic: Topic, overall: z.int().min(0).max(100), answers: z.int().min(1) })
  .meta({ id: "ReportTopicScore" });
export type ReportTopicScore = z.infer<typeof ReportTopicScore>;

export const ReportTypeScore = z
  .object({ type: QuestionType, overall: z.int().min(0).max(100), answers: z.int().min(1) })
  .meta({ id: "ReportTypeScore" });
export type ReportTypeScore = z.infer<typeof ReportTypeScore>;

export const RecommendedLesson = z
  .object({ slug: Slug, title: label(), topic: Topic })
  .meta({ id: "RecommendedLesson" });
export type RecommendedLesson = z.infer<typeof RecommendedLesson>;

/** `ready` is every answer scored; `partial` is some; `failed` is none, and says so plainly. */
export const SessionReportStatus = z
  .enum(["ready", "partial", "failed"])
  .meta({ id: "SessionReportStatus" });
export type SessionReportStatus = z.infer<typeof SessionReportStatus>;

/**
 * `GET /api/interviews/:id/report`. Assembled in code from the per-answer JSON, never by asking a
 * model to write a report (CLAUDE.md §5 "Evaluation").
 */
export const SessionReportResponse = z.object({
  session_id: z.uuid(),
  status: SessionReportStatus,
  /** Null only when nothing could be scored. */
  overall: z.int().min(0).max(100).nullable(),
  scored_answers: z.int().min(0),
  total_answers: z.int().min(0),
  strengths: z
    .array(text(EVALUATION_LIMITS.strengthMaxLength))
    .max(EVALUATION_LIMITS.reportHighlights),
  fixes: z.array(text(EVALUATION_LIMITS.tipMaxLength)).max(EVALUATION_LIMITS.reportHighlights),
  by_topic: z.array(ReportTopicScore),
  by_type: z.array(ReportTypeScore),
  questions: z.array(CandidateQuestionReport),
  /** Often empty: five of eight role × level pairs have no published track to recommend from. */
  lessons: z.array(RecommendedLesson).max(EVALUATION_LIMITS.lessonsPerReport),
  generated_at: z.iso.datetime(),
});
export type SessionReportResponse = z.infer<typeof SessionReportResponse>;
