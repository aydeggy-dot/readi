import {
  type BundleQuestion,
  type CandidateSessionQuestion,
  type InterviewCandidateContext,
  type InterviewSessionBundle,
  PlannedFollowUp,
  SessionQuestionSnapshot,
} from "@readi/shared-types";
import { z } from "zod";

/**
 * The three widths of a question, and the two doors between them.
 *
 * `snapshotOf` freezes what the session was run against. `bundleQuestion` and `candidateQuestion`
 * are the **only** ways anything gets out of that snapshot, which is what makes "the worker never
 * sees the rubric" and "the candidate never sees the answer key" two functions with two tests
 * rather than a rule anybody has to remember at each call site.
 *
 * - **Snapshot** (stored): prompt, context, ideal points, the rubric's criteria, planned
 *   follow-ups. Never sent anywhere.
 * - **Bundle** (to the worker): prompt, context, planned follow-ups, and how many criteria there
 *   are. No criteria, no weights, no level descriptors, no ideal points — the interviewer model
 *   phrases a probe and judges whether an answer already covered it, and neither needs the answer
 *   key (owner's decision, 2026-09-23).
 * - **Candidate** (to the browser): prompt, context, type, topic. And only once asked.
 */

/** Levels 0–4 as `rubric_criteria.levels` stores them. */
const RubricLevels = z.record(z.string(), z.string());

/** The shape `snapshotOf` needs; structural so the function stays pure and Prisma-free. */
export interface QuestionForSnapshot {
  slug: string;
  type: CandidateSessionQuestion["type"];
  difficulty: number;
  prompt: string;
  context: string | null;
  idealPoints: string[];
  /** `questions.planned_follow_ups`, validated here rather than trusted. */
  plannedFollowUps: unknown;
  topic: { id: string; slug: string; name: string; description: string | null };
  rubric: {
    slug: string;
    name: string;
    criteria: {
      position: number;
      dimension: string;
      description: string;
      weight: number;
      levels: unknown;
    }[];
  };
}

/**
 * Freezes one published question and its rubric as the session will be run against them.
 *
 * Throws rather than repairing: a published question whose stored rubric does not parse is a bug
 * in the content or the schema, and interviewing somebody against it would bury that bug in a
 * transcript. The message names the slug — content, not personal data.
 */
export function snapshotOf(question: QuestionForSnapshot): SessionQuestionSnapshot {
  const parsed = SessionQuestionSnapshot.safeParse({
    slug: question.slug,
    type: question.type,
    topic: {
      id: question.topic.id,
      slug: question.topic.slug,
      name: question.topic.name,
      description: question.topic.description,
    },
    prompt: question.prompt,
    context: question.context,
    difficulty: question.difficulty,
    ideal_points: question.idealPoints,
    rubric: {
      slug: question.rubric.slug,
      name: question.rubric.name,
      criteria: [...question.rubric.criteria]
        .sort((a, b) => a.position - b.position)
        .map((criterion) => ({
          position: criterion.position,
          dimension: criterion.dimension,
          description: criterion.description,
          weight: criterion.weight,
          levels: RubricLevels.parse(criterion.levels),
        })),
    },
    planned_follow_ups: z.array(PlannedFollowUp).parse(question.plannedFollowUps),
  });
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(".") ?? "unknown field";
    throw new Error(`question ${question.slug} cannot be pinned: ${where}`);
  }
  return parsed.data;
}

/**
 * The worker's view. Every field here is one the interviewer model needs to speak; everything the
 * snapshot holds beyond them is answer key and stays behind.
 *
 * `criterion_count` is the one fact about the rubric that crosses, because the coverage log has
 * one entry per criterion and the worker has to be able to record "criterion 2 has no probe, so
 * nothing judged it" without being told what criterion 2 is.
 */
export function bundleQuestion(
  snapshot: SessionQuestionSnapshot,
  position: number,
): BundleQuestion {
  return {
    position,
    type: snapshot.type,
    topic_label: snapshot.topic.name,
    prompt: snapshot.prompt,
    context: snapshot.context,
    criterion_count: snapshot.rubric.criteria.length,
    planned_follow_ups: snapshot.planned_follow_ups,
  };
}

/**
 * A question this session cannot follow up on, if there is one.
 *
 * A pinned question with no planned follow-ups and more than one criterion is a question the engine
 * will ask once and move on from, because `probes_to_judge` finds an empty menu, skips the coverage
 * call and logs `not_judged` against every criterion. That is the correct behaviour for an empty
 * menu, and it is also exactly what the first paid interview run looked like from the outside
 * (2026-09-25): four questions, no follow-ups, and every criterion but the one the opening asked
 * charged for something the candidate was never asked.
 *
 * The cause there was a dev database holding pre-retrofit published rows, but the cause does not
 * matter to the candidate, and `check-bank.mjs` already makes a probe-less multi-criterion question
 * an error in the files — so if one reaches a session, something has gone wrong between the files
 * and here. This is a pure predicate so it can be asserted on; `InterviewsService` logs it at
 * session creation, which is the last moment before the content is pinned and the first moment
 * anybody could have noticed.
 */
export function questionsWithNoProbes(
  snapshots: readonly SessionQuestionSnapshot[],
): readonly string[] {
  return snapshots
    .filter(
      (snapshot) => snapshot.planned_follow_ups.length === 0 && snapshot.rubric.criteria.length > 1,
    )
    .map((snapshot) => snapshot.slug);
}

/** The browser's view of a question the session has reached. */
export function candidateQuestion(
  snapshot: SessionQuestionSnapshot,
  position: number,
  askedAt: Date,
): CandidateSessionQuestion {
  return {
    position,
    type: snapshot.type,
    topic: snapshot.topic,
    prompt: snapshot.prompt,
    context: snapshot.context,
    asked_at: askedAt.toISOString(),
  };
}

export interface BundleSession {
  id: string;
  userId: string;
  mode: InterviewSessionBundle["mode"];
  persona: InterviewSessionBundle["persona"];
  isDiagnostic: boolean;
  plannedMinutes: number;
  endsAt: Date;
  questionBudget: number;
  maxFollowUps: number;
}

/**
 * What the API sends the worker at session start, and again after a Redis miss (ADR-0004).
 *
 * The worker has no database, so everything it needs is here — and nothing it does not need is.
 * The candidate is described in **labels, not keys** and without a name, an email, a phone number
 * or a line of their CV. The one identifier that does cross is `user_id`, an opaque uuid that
 * reaches no prompt: it is what puts a user on the Langfuse trace of each exchange, so that
 * account erasure can find those traces again (ADR-0008, ADR-0011).
 */
export function sessionBundle(
  session: BundleSession,
  snapshots: readonly SessionQuestionSnapshot[],
  candidate: InterviewCandidateContext,
): InterviewSessionBundle {
  return {
    session_id: session.id,
    user_id: session.userId,
    mode: session.mode,
    persona: session.persona,
    is_diagnostic: session.isDiagnostic,
    planned_minutes: session.plannedMinutes as InterviewSessionBundle["planned_minutes"],
    ends_at: session.endsAt.toISOString(),
    question_budget: session.questionBudget,
    max_follow_ups: session.maxFollowUps,
    candidate,
    questions: snapshots.map((snapshot, position) => bundleQuestion(snapshot, position)),
  };
}
