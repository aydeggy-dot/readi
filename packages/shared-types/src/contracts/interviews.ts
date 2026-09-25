import { z } from "zod";
import {
  CONTENT_LIMITS,
  ENGINE_SNAPSHOT_VERSION,
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
import { AiCallRecord } from "./cv.js";
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
export const InterviewSessionBundle = z
  .object({
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
  })
  .meta({ id: "InterviewSessionBundle" });
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

// -----------------------------------------------------------------------------------------------
// API ↔ worker: one exchange. `POST /interview/advance`.
//
// In text mode every worker call is initiated by the API, so a whole exchange — what the candidate
// said, what the interviewer said back, where the engine now stands and what the model calls cost —
// rides one request and one response (the plan's "events ride the response"). M5 adds a push
// channel for the LiveKit agent, which drives turns itself.

/**
 * A candidate's words on the wire.
 *
 * Named rather than inline because a *nullable* constrained string generates as a Pydantic
 * RootModel, and an unnamed one is called `Text` — which is what `EmbedRequest.texts` is already
 * called. Two unrelated domains would then share one generated class for as long as their limits
 * happened to match, and diverge into `Text` and `Text1` the day one of them changed.
 */
export const CandidateText = text(INTERVIEW_LIMITS.answerMaxLength).meta({ id: "CandidateText" });
export type CandidateText = z.infer<typeof CandidateText>;

/** What the candidate just did. `skip` passes on the current question, or on asking one of theirs. */
export const InterviewAction = z
  .enum(["start", "answer", "skip", "end"])
  .meta({ id: "InterviewAction" });
export type InterviewAction = z.infer<typeof InterviewAction>;

/**
 * Why the session stopped. `abandoned` is not here: that is a lifecycle the sweep decides about a
 * session nobody came back to, not something the engine ever saw happen.
 */
export const InterviewEndReason = z
  .enum(["questions_done", "out_of_time", "candidate_ended"])
  .meta({ id: "InterviewEndReason" });
export type InterviewEndReason = z.infer<typeof InterviewEndReason>;

/**
 * Where one question stands. Both lists index `planned_follow_ups`; **neither indexes criteria**.
 *
 * A criterion may carry two probes, and the two are separable things ("how would you test it" and
 * "what would you do when it fails"). Tracking coverage per criterion loses which half an answer
 * reached, so the engine would either re-ask something already answered or drop the half that was
 * not — and keying anything by criterion drops the second probe outright, which `review-doc.ts`
 * really did (M3 planning item 9). Per criterion is how the **log** reads, because that is what a
 * rubric is; per probe is how the engine decides, because that is what it asks.
 */
export const EngineQuestionProgress = z
  .object({
    position: z.int().min(0),
    asked: z.boolean(),
    /** Probes already put to the candidate. Its length is the follow-up count for this question. */
    probes_asked: z.array(z.int().min(0)).max(CONTENT_LIMITS.plannedFollowUps),
    /** Probes an answer has already covered unprompted, so nothing asks them again. */
    probes_covered: z.array(z.int().min(0)).max(CONTENT_LIMITS.plannedFollowUps),
  })
  .meta({ id: "EngineQuestionProgress" });
export type EngineQuestionProgress = z.infer<typeof EngineQuestionProgress>;

/**
 * The engine's own state, small enough to store on the session row.
 *
 * Redis holds the live copy with a TTL; this comes back on every response so that a Redis flush
 * costs a round trip rather than a session (the plan's Architecture section). The API stores it and
 * never reads inside it — which is why it carries `version`: it is the one contract here whose two
 * ends can be different deployments of the worker, and a snapshot the running engine does not
 * recognise is discarded in favour of starting from the bundle.
 */
export const InterviewEngineSnapshot = z
  .object({
    version: z.literal(ENGINE_SNAPSHOT_VERSION),
    state: InterviewState,
    /** Index into the bundle's questions, or null before the first and after the last. */
    current_question: z.int().min(0).nullable(),
    /** The seq the next turn will take. Turn numbering is the engine's, so retries are idempotent. */
    next_seq: z.int().min(0),
    questions_asked: z.int().min(0),
    progress: z.array(EngineQuestionProgress),
    end_reason: InterviewEndReason.nullable(),
  })
  .meta({ id: "InterviewEngineSnapshot" });
export type InterviewEngineSnapshot = z.infer<typeof InterviewEngineSnapshot>;

/**
 * One line of the transcript as the worker emits it — the API persists it by `(session_id, seq)`
 * and narrows it to `CandidateTurn` on the way to the browser.
 *
 * The candidate's own words come back here too, rather than being written by the API from the
 * request: the engine owns turn numbering, so a transcript is whatever the engine said happened and
 * a retried response cannot interleave.
 */
export const InterviewTurn = z
  .object({
    seq: z.int().min(0),
    speaker: TurnSpeaker,
    state: InterviewState,
    question_position: z.int().min(0).nullable(),
    /** Which planned probe was asked, on the interviewer turn that asked it. */
    follow_up_index: z.int().min(0).nullable(),
    text: text(INTERVIEW_LIMITS.answerMaxLength),
    /** One entry per rubric criterion, on candidate turns during a question. Never a score. */
    criteria_covered: z.array(CriterionCoverage).max(CONTENT_LIMITS.rubricCriteria.max).nullable(),
  })
  .meta({ id: "InterviewTurn" });
export type InterviewTurn = z.infer<typeof InterviewTurn>;

/**
 * `POST /interview/advance` (API → worker).
 *
 * **The snapshot in the request is the authority.** The worker keeps the live engine state in Redis
 * with a TTL, but what the API has stored is what has actually been persisted — so if a response
 * reached the worker's Redis and then failed to reach the database, replaying the exchange is
 * exactly right and skipping ahead would leave a hole in the transcript. Redis is what saves the
 * API from resending the `bundle` every call; when it has lost it, the worker answers
 * `bundle_required` and the API sends it again. That error is the Redis-miss signal the API cannot
 * otherwise see.
 *
 * `now` comes from the API rather than the worker's clock, which makes an exchange a pure function
 * of its request: the same request replays to the same turns, and a session's deadline is judged
 * against one clock instead of two.
 */
export const InterviewAdvanceRequest = z.object({
  session_id: z.uuid(),
  action: InterviewAction,
  /** The candidate's words, for `answer`; null for every other action. */
  text: CandidateText.nullable(),
  now: z.iso.datetime(),
  bundle: InterviewSessionBundle.nullable(),
  engine_snapshot: InterviewEngineSnapshot.nullable(),
});
export type InterviewAdvanceRequest = z.infer<typeof InterviewAdvanceRequest>;

/**
 * What one exchange produced. `turns` is what to persist and stream, `engine_snapshot` is what to
 * store, `ai_calls` is what to bill and trace (ADR-0007), and `prompt_versions` is what to merge
 * into `interview_sessions.prompt_versions` so that a session records which released prompt spoke.
 */
export const InterviewAdvanceResponse = z.object({
  session_id: z.uuid(),
  state: InterviewState,
  ended: z.boolean(),
  end_reason: InterviewEndReason.nullable(),
  turns: z.array(InterviewTurn),
  /** Null on an error, and only then: nothing moved, so the API keeps the snapshot it has. */
  engine_snapshot: InterviewEngineSnapshot.nullable(),
  prompt_versions: z.record(z.string(), z.int().meta({ id: "PromptVersion" })),
  ai_calls: z.array(AiCallRecord),
  /**
   * Set when the exchange produced nothing, in which case `turns` is empty and the snapshot is
   * unchanged: an exchange is all-or-nothing, so a retry replays it rather than resuming half of
   * it. A model that will not answer is **not** one of these — the engine falls back to the pinned
   * wording and the interview carries on plainer, with the failure in `ai_calls`.
   *
   * - `bundle_required` — nothing cached and no bundle sent; the API resends with one.
   * - `bad_request` — the action does not fit the state, or the bundle is for another session.
   * - `engine_error` — the snapshot does not describe this bundle.
   * - `llm_error` — the one call with no honest fallback: answering a question the candidate asked.
   */
  error: z.enum(["bundle_required", "bad_request", "engine_error", "llm_error"]).nullable(),
});
export type InterviewAdvanceResponse = z.infer<typeof InterviewAdvanceResponse>;

// -----------------------------------------------------------------------------------------------
// Web ↔ API: advancing a session, over SSE (ADR-0016).
//
// One exchange usually produces two or three things to show — intro and the first question, or a
// follow-up, or the close and the end — so the channel is a stream rather than a JSON body. What it
// buys in M3 is honest to state: **not** token streaming (that waits for M5, where voice latency
// needs it), but the screen showing "composing" the instant the answer is sent, a heartbeat while a
// model call is in flight so nothing between here and the browser drops an idle connection, and the
// channel M5's LiveKit agent reuses.
//
// **Where an error appears depends on when it happens.** Anything knowable before the stream opens —
// not this candidate's session, a session already ended, a session past its resume grace, another
// advance already in flight, a malformed body — is an ordinary HTTP error with an `ApiError` code.
// Once the headers are out the status is already 200, so a failure after that is an `error` frame.
// The client has to handle both, and `interview-stream.ts` is the one place that does.

/** What the browser asks for. `text` belongs to `answer` and is ignored by the rest. */
export const AdvanceInterviewRequest = z
  .object({
    action: InterviewAction,
    text: CandidateText.optional(),
  })
  .refine((request) => request.action !== "answer" || (request.text ?? "").length > 0, {
    message: "an answer needs words",
    path: ["text"],
  });
export type AdvanceInterviewRequest = z.infer<typeof AdvanceInterviewRequest>;

/**
 * The interviewer is composing. Sent immediately, before the worker is called, and then repeated as
 * a heartbeat while waiting (`INTERVIEW_SSE_HEARTBEAT_MS`).
 *
 * Repeating a frame rather than sending an SSE comment is deliberate: a comment keeps a connection
 * open but tells the screen nothing, and a candidate on a slow Nigerian connection watching a
 * spinner deserves to know the difference between "still working" and "we have lost you". The
 * client renders the first one and counts the rest.
 */
export const InterviewThinkingFrame = z.object({ type: z.literal("thinking") });

/** One line of the transcript, exactly as `GET /api/interviews/{id}` would have served it. */
export const InterviewTurnFrame = z.object({ type: z.literal("turn"), turn: CandidateTurn });

/**
 * A question the session has just reached, sent **before** the turn that asks it.
 *
 * The turn carries the interviewer's words; this carries the question's setup material — a snippet, a
 * scenario, a table — which the screen renders beneath them and which never passes through a model.
 * Before the turn, so the screen has the code by the time it has the sentence pointing at it.
 */
export const InterviewQuestionFrame = z.object({
  type: z.literal("question"),
  question: CandidateSessionQuestion,
});

/** Where the session now stands. Always sent, always last before `done`. */
export const InterviewStateFrame = z.object({
  type: z.literal("state"),
  state: InterviewState,
  status: InterviewStatus,
  /** Re-sent because a resumed session must not silently gain the time it was away. */
  ends_at: z.iso.datetime(),
  ended_at: z.iso.datetime().nullable(),
  questions_asked: z.int().min(0),
  question_budget: z.int().min(1),
});

/**
 * The exchange failed after the stream had opened. Nothing was persisted — an exchange is
 * all-or-nothing — so the same action may simply be sent again.
 */
export const InterviewErrorFrame = z.object({
  type: z.literal("error"),
  code: z.enum(["worker_unavailable", "interview_error"]),
});

/**
 * The exchange finished. An explicit terminal frame rather than relying on the connection closing,
 * because "the interviewer has finished speaking" and "the pipe broke" need different answers on
 * screen and a closed stream cannot tell them apart.
 */
export const InterviewDoneFrame = z.object({ type: z.literal("done") });

export const InterviewFrame = z.discriminatedUnion("type", [
  InterviewThinkingFrame,
  InterviewTurnFrame,
  InterviewQuestionFrame,
  InterviewStateFrame,
  InterviewErrorFrame,
  InterviewDoneFrame,
]);
export type InterviewFrame = z.infer<typeof InterviewFrame>;

/**
 * `GET /api/interviews/{id}/status` — polled by the completion screen (the `cv-panel.tsx` pattern).
 *
 * `feedback_ready` is always `false` in M3, which scores nothing, and the screen says so plainly
 * rather than spinning for something that is not coming (the owner's decision on the completion
 * screen, 2026-09-22). M4 makes it true and adds the report beside it; the shape is here now so the
 * screen it is written for does not have to change when that happens.
 */
export const InterviewStatusResponse = z.object({
  id: z.uuid(),
  state: InterviewState,
  status: InterviewStatus,
  ended_at: z.iso.datetime().nullable(),
  feedback_ready: z.boolean(),
});
export type InterviewStatusResponse = z.infer<typeof InterviewStatusResponse>;
