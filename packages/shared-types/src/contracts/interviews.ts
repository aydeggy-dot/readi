import { z } from "zod";
import {
  CONTENT_LIMITS,
  INTERVIEW_LENGTHS,
  INTERVIEW_LIMITS,
  INTERVIEW_MODES,
  INTERVIEW_PERSONAS,
  INTERVIEW_STATES,
  INTERVIEW_STATUSES,
  MAX_FOLLOW_UPS,
  QUESTION_TYPES,
  TURN_SPEAKERS,
} from "../constants.js";
import { PlannedFollowUp, QuestionType, Topic } from "./content.js";
import { Slug, distinctSlugs } from "./slug.js";

/**
 * The interview engine (spec §4.3, §6.1; CLAUDE.md §5 "Interview engine").
 *
 * ## Three shapes for one question, and why they are three
 *
 * A question exists in this file at three widths, each smaller than the last, and the gaps between
 * them are the product rules rather than an accident of convenience:
 *
 * 1. **The pinned snapshot** — `SessionQuestionSnapshot`. Everything the session was run against,
 *    including the rubric and the ideal points, frozen at session start so that editing the
 *    published question afterwards cannot move a past report (ADR-0014 decision 2, `tasks/todo.md`
 *    "Carried forward"). It is stored in `interview_session_questions.snapshot` and **never leaves
 *    the API**: not to the worker, not to the browser. M4 evaluates against it.
 * 2. **The bundle question** — `BundleQuestion`, what the worker is given. The prompt, the planned
 *    follow-ups and the number of criteria; **no rubric, no criteria, no weights, no level
 *    descriptors and no ideal points**. The interviewer model phrases a probe the engine chose and
 *    judges whether an answer has already covered it; none of that needs the answer key, and
 *    leaving it out takes the answer key out of every live call (owner's decision, 2026-09-23).
 * 3. **The candidate question** — `CandidateSessionQuestion`, what the browser is sent: the prompt
 *    and its setup, and only for questions the session has actually reached.
 *
 * The widths narrow in one direction only, and `interview-bundle.ts` derives 2 from 1 and 3 from 1
 * in one place each, so "what the worker may see" and "what a candidate may see" are two functions
 * with two tests rather than a rule people remember.
 *
 * ## Which schemas carry `.meta({ id })`
 *
 * The rule the rest of the contracts follow (ADR-0003): a schema a controller uses as a DTO root
 * carries **no** root id, because nestjs-zod would emit two OpenAPI components with the same name.
 * Schemas that only ever appear nested carry one.
 */

const text = (max: number) => z.string().trim().min(1).max(max);
const label = () => text(CONTENT_LIMITS.titleMaxLength);

// -----------------------------------------------------------------------------------------------
// The vocabulary.

export const InterviewState = z.enum(INTERVIEW_STATES).meta({ id: "InterviewState" });
export type InterviewState = z.infer<typeof InterviewState>;

export const InterviewStatus = z.enum(INTERVIEW_STATUSES).meta({ id: "InterviewStatus" });
export type InterviewStatus = z.infer<typeof InterviewStatus>;

export const InterviewMode = z.enum(INTERVIEW_MODES).meta({ id: "InterviewMode" });
export type InterviewMode = z.infer<typeof InterviewMode>;

export const InterviewPersona = z.enum(INTERVIEW_PERSONAS).meta({ id: "InterviewPersona" });
export type InterviewPersona = z.infer<typeof InterviewPersona>;

export const TurnSpeaker = z.enum(TURN_SPEAKERS).meta({ id: "TurnSpeaker" });
export type TurnSpeaker = z.infer<typeof TurnSpeaker>;

/** One of the session lengths on offer (spec §4.3; 45 waits — see `INTERVIEW_LENGTHS`). */
export const InterviewLength = z.literal([...INTERVIEW_LENGTHS]);
export type InterviewLength = z.infer<typeof InterviewLength>;

/** A catalogue row as a session names it: the slug the wire carries, and the label to draw. */
export const InterviewCatalogueRef = z
  .object({ slug: Slug, name: label() })
  .meta({ id: "InterviewCatalogueRef" });
export type InterviewCatalogueRef = z.infer<typeof InterviewCatalogueRef>;

/**
 * The catalogue as it read **at session time**, stored on the session.
 *
 * Roles, levels and stacks are versioned content (ADR-0015), which means their names and slugs
 * change: a role renamed "Backend engineer" → "Backend developer" would otherwise silently rewrite
 * every past session's report to say something the candidate never saw. The FK and the version
 * stay on the row for joins and analytics; this is what the session *says it was*.
 */
export const SessionCatalogue = z
  .object({
    role: InterviewCatalogueRef,
    level: InterviewCatalogueRef,
    stack: InterviewCatalogueRef.nullable(),
  })
  .meta({ id: "SessionCatalogue" });
export type SessionCatalogue = z.infer<typeof SessionCatalogue>;

// -----------------------------------------------------------------------------------------------
// Web ↔ API.

/**
 * `POST /api/interviews`. Everything is optional except the length: the setup screen sends what
 * the candidate chose, and anything it leaves out falls back to their profile, exactly as the
 * content routes do (`audience()` in `content.service.ts`).
 *
 * `types` omitted is the **preset mixed session** — every type the chosen role supports, which is
 * per-role rather than a fixed list (`CareerRole.supported_question_types`). The diagnostic sends
 * no types at all for that reason.
 */
export const CreateInterviewRequest = z
  .object({
    role: Slug.optional(),
    level: Slug.optional(),
    /**
     * The variant to be interviewed for. Omitted falls back to the profile; **explicit `null` is a
     * real choice** — "not one of these" — and means the general questions for the role, which is
     * what `question-eligibility.ts` does with a candidate who has no stack.
     */
    stack: Slug.nullish(),
    types: z.array(QuestionType).min(1).max(QUESTION_TYPES.length).optional(),
    minutes: InterviewLength,
    /** The 15-minute preset from `/home`; the report and the readiness score read it in M4/M6. */
    is_diagnostic: z.boolean().default(false),
  })
  .refine((request) => !request.types || distinctSlugs(request.types), {
    message: "a question type may be listed only once",
    path: ["types"],
  });
export type CreateInterviewRequest = z.infer<typeof CreateInterviewRequest>;

/**
 * One question as the candidate may see it — and **only for a question the session has reached**.
 * Reading ahead is not a leak of the answer key, but it is a leak of the interview: a candidate
 * who can see question four while answering question one is preparing, not being interviewed.
 * `interviews.service.ts` filters by `asked_at`, and the integration test asserts the unasked ones
 * are absent rather than merely unmentioned.
 */
export const CandidateSessionQuestion = z
  .object({
    position: z.int().min(0),
    type: QuestionType,
    topic: Topic,
    prompt: text(CONTENT_LIMITS.questionPromptMaxLength),
    context: text(CONTENT_LIMITS.questionContextMaxLength).nullable(),
    asked_at: z.iso.datetime(),
  })
  .meta({ id: "CandidateSessionQuestion" });
export type CandidateSessionQuestion = z.infer<typeof CandidateSessionQuestion>;

/**
 * One line of the transcript. Deliberately narrower than the row behind it: `follow_up_index`
 * names which planned probe was asked and `criteria_covered` is a judgement about the answer, and
 * both describe the answer key from the side. They stay server-side, for M4 and for us.
 */
export const CandidateTurn = z
  .object({
    seq: z.int().min(0),
    speaker: TurnSpeaker,
    state: InterviewState,
    /** Which question this turn belongs to, or null in `intro`, `candidate_questions`, `wrap_up`. */
    question_position: z.int().min(0).nullable(),
    text: text(INTERVIEW_LIMITS.answerMaxLength),
    at: z.iso.datetime(),
  })
  .meta({ id: "CandidateTurn" });
export type CandidateTurn = z.infer<typeof CandidateTurn>;

/** What a session looks like in the Practice list. */
export const InterviewSummary = z
  .object({
    id: z.uuid(),
    state: InterviewState,
    status: InterviewStatus,
    mode: InterviewMode,
    is_diagnostic: z.boolean(),
    planned_minutes: InterviewLength,
    role: InterviewCatalogueRef,
    level: InterviewCatalogueRef,
    stack: InterviewCatalogueRef.nullable(),
    started_at: z.iso.datetime(),
    ends_at: z.iso.datetime(),
    ended_at: z.iso.datetime().nullable(),
    questions_asked: z.int().min(0),
    question_budget: z.int().min(1),
  })
  .meta({ id: "InterviewSummary" });
export type InterviewSummary = z.infer<typeof InterviewSummary>;

/** `GET /api/interviews` — the Practice list, keyset-paged like the rest of the API. */
export const InterviewListResponse = z.object({
  items: z.array(InterviewSummary),
  next_cursor: z.string().min(1).max(INTERVIEW_LIMITS.cursorMaxLength).nullable(),
});
export type InterviewListResponse = z.infer<typeof InterviewListResponse>;

export const InterviewListQuery = z.object({
  cursor: z.string().min(1).max(INTERVIEW_LIMITS.cursorMaxLength).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(INTERVIEW_LIMITS.pageSize.max)
    .default(INTERVIEW_LIMITS.pageSize.default),
});
export type InterviewListQuery = z.infer<typeof InterviewListQuery>;

/** `POST /api/interviews` and `GET /api/interviews/{id}` — the session and what has been said. */
export const InterviewSessionResponse = z.object({
  id: z.uuid(),
  state: InterviewState,
  status: InterviewStatus,
  mode: InterviewMode,
  persona: InterviewPersona,
  is_diagnostic: z.boolean(),
  planned_minutes: InterviewLength,
  role: InterviewCatalogueRef,
  level: InterviewCatalogueRef,
  stack: InterviewCatalogueRef.nullable(),
  types: z.array(QuestionType),
  started_at: z.iso.datetime(),
  /** The wall-clock deadline. The screen counts to this rather than ticking, so a backgrounded
   * phone cannot drift and a resumed session does not silently gain the time it was away. */
  ends_at: z.iso.datetime(),
  ended_at: z.iso.datetime().nullable(),
  question_budget: z.int().min(1),
  max_follow_ups: z.int().min(0).max(MAX_FOLLOW_UPS),
  questions: z.array(CandidateSessionQuestion),
  turns: z.array(CandidateTurn),
});
export type InterviewSessionResponse = z.infer<typeof InterviewSessionResponse>;

// -----------------------------------------------------------------------------------------------
// The pinned snapshot. Stored, never sent: not to the worker, not to the browser.

/**
 * Exactly what the engine was given for one question, frozen at session start.
 *
 * `content_versions` snapshots a row *before* a change (ADR-0014 decision 2), so a version number
 * alone cannot reconstruct what was current at session time — the third edit leaves no record of
 * the second. This can, which is why it is a copy rather than a reference, and why the pinning
 * test edits the published question afterwards and asserts nothing here moves.
 *
 * It is the **only** place in M3 that holds a rubric next to a question, and it is a column, not a
 * payload: `bundleQuestion()` and `candidateQuestion()` are the two ways out of it.
 */
export const SessionQuestionSnapshot = z
  .object({
    slug: Slug,
    type: QuestionType,
    topic: Topic,
    prompt: text(CONTENT_LIMITS.questionPromptMaxLength),
    context: text(CONTENT_LIMITS.questionContextMaxLength).nullable(),
    difficulty: z.int().min(1).max(5),
    /** ANSWER KEY. For M4's evaluator; no M3 call receives it. */
    ideal_points: z.array(text(CONTENT_LIMITS.idealPointMaxLength)),
    /** ANSWER KEY. The rubric as it stood, criteria in `position` order. */
    rubric: z.object({
      slug: Slug,
      name: label(),
      criteria: z.array(
        z.object({
          position: z.int().min(0),
          dimension: text(CONTENT_LIMITS.dimensionMaxLength),
          description: text(CONTENT_LIMITS.criterionDescriptionMaxLength),
          weight: z.int().min(1),
          levels: z.record(z.string(), text(CONTENT_LIMITS.levelDescriptorMaxLength)),
        }),
      ),
    }),
    /** ANSWER KEY. They say what the candidate is about to be asked next. */
    planned_follow_ups: z.array(PlannedFollowUp),
  })
  .meta({ id: "SessionQuestionSnapshot" });
export type SessionQuestionSnapshot = z.infer<typeof SessionQuestionSnapshot>;

// -----------------------------------------------------------------------------------------------
// API ↔ worker (cross-language, ADR-0003 / ADR-0004). The worker has no database: everything it
// needs arrives here, and nothing it does not need does.

/**
 * One question, as the interviewer model's side of the wall sees it.
 *
 * **There is no rubric here, and that is the point.** The worker phrases a probe the engine chose
 * and judges whether an answer has already covered one; neither needs the criteria, the weights or
 * the level descriptors, so the answer key is absent from every interviewer-model call — a privacy
 * improvement, a smaller prompt-injection surface and a cheaper prompt (owner's decision,
 * 2026-09-23). The rubric reaches the **evaluator** in M4, which is a different call.
 *
 * `criterion_count` is here instead, because the coverage log carries one entry per criterion and
 * the worker must be able to say "criterion 2 has no probe, so nothing judged it" without being
 * told what criterion 2 is.
 */
export const BundleQuestion = z
  .object({
    position: z.int().min(0),
    type: QuestionType,
    /** The topic's name, not its slug: this goes into prose the model speaks. */
    topic_label: label(),
    prompt: text(CONTENT_LIMITS.questionPromptMaxLength),
    context: text(CONTENT_LIMITS.questionContextMaxLength).nullable(),
    criterion_count: z
      .int()
      .min(CONTENT_LIMITS.rubricCriteria.min)
      .max(CONTENT_LIMITS.rubricCriteria.max),
    /** The menu the engine picks from — never a script (CLAUDE.md §5). */
    planned_follow_ups: z.array(PlannedFollowUp).max(CONTENT_LIMITS.plannedFollowUps),
  })
  .meta({ id: "BundleQuestion" });
export type BundleQuestion = z.infer<typeof BundleQuestion>;

/**
 * Who the worker is interviewing, in **labels, not keys** (ADR-0015, and the same shape
 * `CvParseRequest` already uses): "Backend engineer", "Mid-level", "Java / Spring". There is no
 * enum for the worker to recognise any more, and every one of these is staff-written content, so
 * the prompts wrap them with `as_data(...)`.
 *
 * No name, no email, no phone, no CV text (ADR-0008, CLAUDE.md "Data & privacy"). `weak_topics`
 * exists now and is empty until M4 has evaluations to derive it from.
 */
export const InterviewCandidateContext = z
  .object({
    role_label: label(),
    level_label: label(),
    stack_label: label().nullable(),
    weak_topics: z.array(label()).max(10),
  })
  .meta({ id: "InterviewCandidateContext" });
export type InterviewCandidateContext = z.infer<typeof InterviewCandidateContext>;

/**
 * The session bundle: what the API sends the worker at session start, and again after a Redis miss
 * (ADR-0004). Registered, so the worker's Pydantic models are generated from it.
 */
export const InterviewSessionBundle = z.object({
  session_id: z.uuid(),
  mode: InterviewMode,
  persona: InterviewPersona,
  is_diagnostic: z.boolean(),
  planned_minutes: InterviewLength,
  /** The wall-clock deadline; the engine's time budget is checked against it, not against a tick. */
  ends_at: z.iso.datetime(),
  question_budget: z.int().min(1),
  max_follow_ups: z.int().min(0).max(MAX_FOLLOW_UPS),
  candidate: InterviewCandidateContext,
  questions: z.array(BundleQuestion),
});
export type InterviewSessionBundle = z.infer<typeof InterviewSessionBundle>;

/**
 * The per-criterion coverage log, written on every candidate turn
 * (`session_turns.criteria_covered`, owner's decision 2026-09-23). One entry per rubric criterion:
 * whether this answer touched it, and which planned follow-up the engine then chose.
 *
 * Without it, a session where the engine asked a redundant follow-up and one where it correctly
 * skipped both are indistinguishable afterwards — which is what makes "a menu, not a script"
 * auditable rather than merely intended. Three things read it: the engine, to pick the next probe;
 * M4's evaluator, as a prior and **never** as a score; and us, when a reviewer says a follow-up was
 * asked about something the candidate had already answered.
 *
 * `not_judged` is the ordinary state of the one criterion the opening prompt asks for: it has no
 * probe, so nothing was ever going to be asked about it and nothing judged it. Recording that as
 * `false` would be a claim we did not make.
 */
export const CoverageVerdict = z
  .enum(["covered", "not_covered", "not_judged"])
  .meta({ id: "CoverageVerdict" });
export type CoverageVerdict = z.infer<typeof CoverageVerdict>;

export const CriterionCoverage = z
  .object({
    criterion: z
      .int()
      .min(0)
      .max(CONTENT_LIMITS.rubricCriteria.max - 1),
    has_probe: z.boolean(),
    /*
     * Three named values rather than a nullable boolean, for two reasons. The reading one: "we did
     * not judge this" is a third state, and a reader of a stored log should not have to know that
     * `null` meant that. The mechanical one: Zod writes a nullable boolean as
     * `type: ["boolean", "null"]`, which @nestjs/swagger turns into an array — the same trap a bare
     * nullable string falls into, and `openapi-compat.test.ts` fails on exactly this.
     */
    covered: CoverageVerdict,
    /** Index into the question's `planned_follow_ups`, when this turn earned one. */
    follow_up_index: z.int().min(0).nullable(),
  })
  .meta({ id: "CriterionCoverage" });
export type CriterionCoverage = z.infer<typeof CriterionCoverage>;
