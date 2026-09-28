/**
 * Calibration: a person scoring an answer a model has already scored, without being shown its marks
 * (M4 phase 6, ADR-0017).
 *
 * Everything here is an **admin surface** and carries the answer key on purpose: a reviewer cannot
 * mark an answer against a rubric they are not shown. That is why none of it is mounted under
 * `/api/content` or `/api/interviews`, the two prefixes `content-no-answer-key.int.spec.ts` sweeps —
 * the rubric belongs here, and the test's silence about this route is by construction rather than by
 * an exclusion list.
 *
 * Three things are kept out, and each is kept out for its own reason:
 *
 * - **The model's score**, because agreement between a person and a model means nothing if the person
 *   was shown the model's answer first. `CalibrationAnswer` has no `criteria`, no `overall` and no
 *   `confidence`, and the shape is separate from `AnswerEvaluation` rather than derived from it: a
 *   field omitted by an `Omit<>` comes back the first time somebody widens the parent.
 * - **Who the candidate is.** No name, no email, no CV, and no user id. A reviewer is reading an
 *   answer, not a person, and the role and level are the only context that helps them mark it.
 * - **The evidence quotes the model chose**, for the same reason as its scores: they are its reading.
 *   The reviewer has the whole answer and quotes what they mean from it.
 *
 * This contract is TS↔TS and is deliberately **not** in `contractRegistry`: the worker never sees a
 * calibration score, and registering it would generate Pydantic models nothing imports (ADR-0003).
 */

import { z } from "zod";
import {
  CALIBRATION_LIMITS,
  CONTENT_LIMITS,
  EVALUATION_LIMITS,
  INTERVIEW_LIMITS,
  MAX_CRITERION_SCORE,
} from "../constants.js";

const text = (max: number) => z.string().trim().min(1).max(max);

/** A cursor over `(updated_at, id)`, as every admin list in this API pages (ADR-0014). */
const cursor = () => z.string().min(1).max(CONTENT_LIMITS.cursorMaxLength);

/**
 * One criterion of the pinned rubric, as the reviewer is shown it.
 *
 * From `interview_session_questions.snapshot`, never from `rubric_criteria`: the reviewer has to mark
 * against the rubric the answer was actually scored against, which an expert may have reworked since
 * (CLAUDE.md §5, and `interview-pinning.int.spec.ts` is the test).
 *
 * `weight` is here because a reviewer who cannot see that a criterion is worth 40% cannot tell us the
 * rubric is wrong, which is half of what calibration is for.
 */
export const CalibrationCriterion = z
  .object({
    position: z.int().min(0),
    dimension: text(CONTENT_LIMITS.dimensionMaxLength),
    description: text(CONTENT_LIMITS.criterionDescriptionMaxLength),
    weight: z.int().min(0).max(100),
    /** The five rungs, keyed "0" to "4" as the rubric writes them. */
    levels: z.record(z.string(), text(CONTENT_LIMITS.levelDescriptorMaxLength)),
  })
  .meta({ id: "CalibrationCriterion" });
export type CalibrationCriterion = z.infer<typeof CalibrationCriterion>;

/** What the interviewer asked, and what the candidate said back, in order. */
export const CalibrationTurn = z
  .object({
    seq: z.int().min(0),
    speaker: z.enum(["interviewer", "candidate"]),
    /** Which planned follow-up produced this turn, or null for the opening question. */
    follow_up_index: z.int().min(0).nullable(),
    text: text(INTERVIEW_LIMITS.answerMaxLength),
  })
  .meta({ id: "CalibrationTurn" });
export type CalibrationTurn = z.infer<typeof CalibrationTurn>;

/**
 * One criterion as a **reviewer** marked it.
 *
 * Deliberately not `CriterionScore`, though it is stored in the same column and compared with it per
 * criterion. Two of that shape's invariants are demands on a *model* and would be wrong as demands on
 * a person: `reasoning` is required there because a score whose reason is unstated cannot be printed in
 * a candidate's report, and `evidence` is required of a non-zero score because a model with no quote
 * may have invented the reading (spec §6.2). A reviewer marking twenty answers writes a sentence where
 * a sentence is worth writing, and the alternative is a form that invents "No reason given." on their
 * behalf — which is text nobody wrote, stored as though somebody had.
 */
export const CalibrationCriterionScore = z
  .object({
    criterion: z.int().min(0),
    score: z.int().min(0).max(MAX_CRITERION_SCORE),
    max_score: z.literal(MAX_CRITERION_SCORE),
    evidence: z
      .array(text(EVALUATION_LIMITS.evidenceMaxLength))
      .max(EVALUATION_LIMITS.evidencePerCriterion),
    reasoning: text(EVALUATION_LIMITS.reasoningMaxLength).nullable(),
  })
  .meta({ id: "CalibrationCriterionScore" });
export type CalibrationCriterionScore = z.infer<typeof CalibrationCriterionScore>;

/**
 * One answer to review. **Reading this is an audited event** (`calibration.answer.read`): a staff
 * member looking at a candidate's words is the thing ADR-0017 asks consent for, so it leaves a row
 * naming who looked and at what.
 */
export const CalibrationAnswer = z.object({
  /** The `answer_evaluations` row. The only id a reviewer is given. */
  id: z.uuid(),
  question_slug: z.string().min(1).max(CONTENT_LIMITS.slugMaxLength),
  question_prompt: text(CONTENT_LIMITS.questionPromptMaxLength),
  question_context: text(CONTENT_LIMITS.questionContextMaxLength).nullable(),
  /** Catalogue names, for context a reviewer needs and nobody can be identified by. */
  role: text(CONTENT_LIMITS.titleMaxLength).nullable(),
  level: text(CONTENT_LIMITS.titleMaxLength).nullable(),
  rubric_slug: z.string().min(1).max(CONTENT_LIMITS.slugMaxLength),
  rubric_name: text(CONTENT_LIMITS.titleMaxLength),
  criteria: z.array(CalibrationCriterion).min(1),
  exchange: z.array(CalibrationTurn).min(1),
  /**
   * What the evaluator flagged as evidence that reads like an instruction — **our** matched
   * phrases, never the quote, and it changes no score (owner's decision, 2026-09-27). It is shown
   * to the reviewer because it is a reason for a person to look, which is all it has ever been.
   */
  evidence_flags: z.array(text(EVALUATION_LIMITS.evidenceFlagMaxLength)),
  /** This reviewer's own score, when they have already given one. Never anyone else's. */
  my_score: z
    .object({
      criteria: z.array(CalibrationCriterionScore),
      note: text(CALIBRATION_LIMITS.noteMaxLength).nullable(),
      created_at: z.iso.datetime(),
    })
    .nullable(),
});
// No root `.meta({ id })`: a controller uses this as a DTO root, and nestjs-zod then emits two
// OpenAPI components with the same name and refuses to build the document (ADR-0001, CLAUDE.md §6).
// The nested pieces above are reusable and do carry one, which is the other half of that rule.
export type CalibrationAnswer = z.infer<typeof CalibrationAnswer>;

/** A row in the review queue. Deliberately thin: enough to choose one, not enough to mark it. */
export const CalibrationQueueItem = z
  .object({
    id: z.uuid(),
    question_slug: z.string().min(1).max(CONTENT_LIMITS.slugMaxLength),
    rubric_name: text(CONTENT_LIMITS.titleMaxLength),
    role: text(CONTENT_LIMITS.titleMaxLength).nullable(),
    level: text(CONTENT_LIMITS.titleMaxLength).nullable(),
    criterion_count: z.int().min(1),
    /** How many people have scored it, so a reviewer can pick one nobody has read. */
    review_count: z.int().min(0),
    reviewed_by_me: z.boolean(),
    flagged: z.boolean(),
    answered_at: z.iso.datetime(),
  })
  .meta({ id: "CalibrationQueueItem" });
export type CalibrationQueueItem = z.infer<typeof CalibrationQueueItem>;

export const CalibrationQueueQuery = z.object({
  /** `unreviewed` hides what this reviewer has already scored; `mine` shows only those. */
  scope: z.enum(["unreviewed", "mine", "all"]).default("unreviewed"),
  /** Only answers whose evidence tripped the instruction flags. */
  flagged: z.stringbool().optional(),
  role: z.string().trim().min(1).max(CONTENT_LIMITS.slugMaxLength).optional(),
  cursor: cursor().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CALIBRATION_LIMITS.pageSize.max)
    .default(CALIBRATION_LIMITS.pageSize.default),
});
export type CalibrationQueueQuery = z.infer<typeof CalibrationQueueQuery>;

export const CalibrationQueueResponse = z.object({
  items: z.array(CalibrationQueueItem),
  next_cursor: cursor().nullable(),
  /**
   * Why the queue is empty, when it is — the three reasons are indistinguishable from an empty list
   * and lead to entirely different actions, so the API says which rather than leaving a reviewer to
   * guess that nobody has consented.
   */
  empty_because: z
    .enum(["nothing_to_review", "no_consent", "staff_answers_only"])
    .nullable()
    .default(null),
});
export type CalibrationQueueResponse = z.infer<typeof CalibrationQueueResponse>;

/**
 * A reviewer's score for one answer. One entry per criterion of the pinned rubric, checked against it
 * by the API — the same rule the evaluator's own readings are held to, for the same reason: a score
 * over a different set of criteria cannot be compared with anything.
 *
 * `evidence` is optional here where it is required of the model. A person quoting nothing is a person
 * who read the answer and formed a view; the evidence rule exists because a *model* with no quote may
 * have invented the reading (spec §6.2).
 */
export const CalibrationScoreInput = z.object({
  criteria: z
    .array(
      z.object({
        criterion: z.int().min(0),
        score: z.int().min(0).max(MAX_CRITERION_SCORE),
        evidence: z
          .array(text(EVALUATION_LIMITS.evidenceMaxLength))
          .max(EVALUATION_LIMITS.evidencePerCriterion)
          .default([]),
        reasoning: text(EVALUATION_LIMITS.reasoningMaxLength).nullable().default(null),
      }),
    )
    .min(CONTENT_LIMITS.rubricCriteria.min)
    .max(CONTENT_LIMITS.rubricCriteria.max),
  /** About the answer or the rubric. Never about the candidate — the form says so too. */
  note: text(CALIBRATION_LIMITS.noteMaxLength).nullable().default(null),
});
export type CalibrationScoreInput = z.infer<typeof CalibrationScoreInput>;

/**
 * Agreement between the people and the model, over the answers both have scored.
 *
 * Five figures because each hides what the others show, and they are the **same five** the harness
 * computes in `apps/ai-worker/readi_worker/evals/metrics.py` — deliberately, so a figure from the
 * calibration area and a figure from a harness run can be read on one axis. Two implementations of
 * one definition; `calibration-agreement.spec.ts` holds this one to the arithmetic.
 */
export const CalibrationAgreement = z
  .object({
    /** Criteria compared, not answers. */
    n: z.int().min(0),
    exact: z.number().min(0).max(1),
    within_one: z.number().min(0).max(1),
    mae: z.number().min(0),
    /** Model minus person: positive means the model marks more generously. */
    bias: z.number(),
    /** Null when either side does not vary — undefined, not zero. */
    correlation: z.number().min(-1).max(1).nullable(),
  })
  .meta({ id: "CalibrationAgreement" });
export type CalibrationAgreement = z.infer<typeof CalibrationAgreement>;

export const CalibrationAgreementRow = z
  .object({
    key: z.string().min(1).max(CONTENT_LIMITS.slugMaxLength),
    name: text(CONTENT_LIMITS.titleMaxLength),
    /** How many answers the figures rest on. A row over one answer is not a measurement. */
    answers: z.int().min(0),
    reviewers: z.int().min(0),
    agreement: CalibrationAgreement,
  })
  .meta({ id: "CalibrationAgreementRow" });
export type CalibrationAgreementRow = z.infer<typeof CalibrationAgreementRow>;

export const CalibrationAgreementResponse = z.object({
  overall: CalibrationAgreement,
  /** Per rubric and per question, because a rubric that disagrees everywhere is a different
   * problem from one question inside it that does. */
  by_rubric: z.array(CalibrationAgreementRow),
  by_question: z.array(CalibrationAgreementRow),
  scored_answers: z.int().min(0),
  reviewers: z.int().min(0),
});
export type CalibrationAgreementResponse = z.infer<typeof CalibrationAgreementResponse>;

/**
 * One answer whose stored evidence matched a phrase that reads like an instruction.
 *
 * The list M4 phase 3 promised this area would draw. It is a **queue for a person**, not a score and
 * not a refusal: the injection gate stops a model inventing a quote and cannot stop one quoting the
 * injection itself, because that quote is real (owner's decision, 2026-09-27).
 */
export const CalibrationFlagItem = z
  .object({
    id: z.uuid(),
    question_slug: z.string().min(1).max(CONTENT_LIMITS.slugMaxLength),
    flags: z.array(text(EVALUATION_LIMITS.evidenceFlagMaxLength)).min(1),
    answered_at: z.iso.datetime(),
  })
  .meta({ id: "CalibrationFlagItem" });
export type CalibrationFlagItem = z.infer<typeof CalibrationFlagItem>;

export const CalibrationFlagsResponse = z.object({
  items: z.array(CalibrationFlagItem),
  next_cursor: cursor().nullable(),
  /** Every distinct phrase in the list, commonest first: the calibration list M4 phase 3 asked for. */
  phrases: z.array(
    z.object({ phrase: text(EVALUATION_LIMITS.evidenceFlagMaxLength), answers: z.int().min(1) }),
  ),
});
export type CalibrationFlagsResponse = z.infer<typeof CalibrationFlagsResponse>;
