import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  type CandidateSessionQuestion,
  type CandidateTurn,
  type CreateInterviewRequest,
  INTERVIEW_PLANS,
  INTERVIEW_RATE_LIMITS,
  type InterviewListQuery,
  type InterviewListResponse,
  type InterviewSessionResponse,
  type InterviewStatusResponse,
  type InterviewSummary,
  MAX_FOLLOW_UPS,
  type QuestionType,
  SessionCatalogue,
  SessionQuestionSnapshot,
  type SessionReportResponse,
} from "@readi/shared-types";
import type { Redis } from "ioredis";
import type { AuthenticatedUser } from "../auth/auth.service";
import { cursorWhere, paginate } from "../content/content-cursor";
import type { CareerLevel, CareerRole, Stack } from "../generated/prisma/client";
import { ApiError, fieldError } from "../http/api-error";
import { EvaluationsService } from "../evaluations/evaluations.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisRateLimiter } from "../rate-limit/redis-rate-limiter";
import { REDIS } from "../redis/redis.module";
import {
  InterviewSessionsRepository,
  type SessionSummaryRow,
  type SessionWithContent,
} from "./interview-sessions.repository";
import { selectQuestions } from "./question-selection";
import { candidateQuestion, questionsWithNoProbes, snapshotOf } from "./session-bundle";

/**
 * Sessions: starting one, listing them, and reading one back (spec §4.3).
 *
 * The engine itself is not here — it lives in the worker (ADR-0004), and `InterviewAdvanceService`
 * is the API's half of one exchange with it. What this owns is everything the worker may not: who
 * the candidate is, what they are allowed to start, which questions they get, and the pinned copy of
 * the content they were asked.
 *
 * ## The catalogue a candidate may be interviewed against is the **published** one
 *
 * A retired role or a level no role offers is not an error a candidate should have to understand,
 * so an unpublished row reads as a missing one (`role_not_found`, not `role_not_published`): to a
 * candidate, a role that is not on offer does not exist. `senior` is the live example — it is a
 * draft level that no role offers, and the failure if this were not enforced would be silent.
 *
 * ## Error codes
 *
 * `profile_required` · `role_not_found` · `level_not_found` · `stack_not_found` ·
 * `level_not_offered` · `stack_not_offered` · `no_questions_available` · `interview_not_found` ·
 * `rate_limited` · `interview_not_ended` · `report_not_ready` · `report_not_found`. Validation
 * failures on the request itself come back as field errors (ADR-0012).
 */
@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);
  private readonly limiter: RedisRateLimiter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: InterviewSessionsRepository,
    private readonly evaluations: EvaluationsService,
    @Inject(REDIS) redis: Redis,
  ) {
    this.limiter = new RedisRateLimiter(redis);
  }

  /**
   * Starts a session: resolves who is being interviewed, picks the questions, and pins the content
   * so a later edit cannot move what this session was run against.
   *
   * **M8's seam is the rate limit below.** An entitlement check ("has this candidate a plan with
   * sessions left, and voice minutes if this were voice?") belongs exactly here, before anything is
   * written and before a single model call is possible, and it refuses with its own code rather
   * than by widening one of these.
   */
  async create(
    user: AuthenticatedUser,
    request: CreateInterviewRequest,
  ): Promise<InterviewSessionResponse> {
    const audience = await this.audience(user.id, request);
    const types = this.typesFor(request, audience.role.supportedQuestionTypes);
    const plan = INTERVIEW_PLANS[request.minutes];

    await this.consume(`interview-hour:${user.id}`, INTERVIEW_RATE_LIMITS.perHour);
    await this.consume(`interview-day:${user.id}`, INTERVIEW_RATE_LIMITS.perDay);

    const pool = await this.repository.withHistory(
      user.id,
      await this.repository.eligibleQuestions({
        roleId: audience.role.id,
        levelId: audience.level.id,
        stackId: audience.stack?.id ?? null,
        types,
      }),
    );
    const seed = randomUUID();
    /*
     * The other seam M3 left for M4: a topic this candidate scores badly on is three times as likely
     * to come up (`SelectionInput.weakTopicIds`). Ids here and names in the bundle, from one query —
     * selection is weighting a pool it already holds, and the worker has no catalogue to look an id up
     * in (ADR-0015).
     */
    const weakTopicIds = (await this.evaluations.weakTopics(user.id)).map((topic) => topic.topicId);
    const chosen = selectQuestions({ pool, count: plan.questions, seed, types, weakTopicIds });
    if (chosen.length === 0) {
      /*
       * Nothing published for this role, level, stack and set of types. A 409 rather than a 404:
       * the request is well formed and the catalogue is real, there is simply no interview to give
       * yet — which is a content gap (five of eight role × level combinations are thin today) and
       * the web app says so rather than showing an error.
       */
      throw new ApiError(
        HttpStatus.CONFLICT,
        "no_questions_available",
        "no published questions for this role, level, stack and question types",
      );
    }

    const rows = await this.repository.questionsToPin(chosen.map((q) => q.questionId));
    const pinned = rows.map((row, position) => ({
      position,
      questionId: row.id,
      questionVersion: row.version,
      rubricId: row.rubricId,
      rubricVersion: row.rubric.version,
      snapshot: snapshotOf(row),
    }));
    /*
     * A question the engine cannot follow up on is worth a line in the log before it is pinned,
     * because after that it is pinned for good. Slugs, not prose: content is not personal data, and
     * a slug is what the person reading this has to go and look at.
     */
    const unprobed = questionsWithNoProbes(pinned.map((question) => question.snapshot));
    if (unprobed.length > 0)
      this.logger.warn(
        `pinning ${unprobed.length} question(s) with no planned follow-ups: ${unprobed.join(", ")}` +
          " — the engine will ask each once and move on; is the seeded content current?",
      );
    const now = new Date();
    const created = await this.repository.create({
      userId: user.id,
      careerRoleId: audience.role.id,
      roleVersion: audience.role.version,
      careerLevelId: audience.level.id,
      levelVersion: audience.level.version,
      stackId: audience.stack?.id ?? null,
      stackVersion: audience.stack?.version ?? null,
      types,
      catalogue: {
        role: { slug: audience.role.slug, name: audience.role.name },
        level: { slug: audience.level.slug, name: audience.level.name },
        stack: audience.stack ? { slug: audience.stack.slug, name: audience.stack.name } : null,
      },
      isDiagnostic: request.is_diagnostic,
      plannedMinutes: request.minutes,
      questionBudget: chosen.length,
      maxFollowUps: Math.min(plan.maxFollowUps, MAX_FOLLOW_UPS),
      endsAt: new Date(now.getTime() + request.minutes * 60 * 1_000),
      selectionSeed: seed,
      questions: pinned,
    });
    /*
     * Starting an interview abandons the one this candidate had running, and an abandoned session
     * with answers in it is still scored for what they answered (M4). Awaited rather than fired and
     * forgotten: it is one enqueue, and a lost job would be a report that silently never arrives.
     */
    await this.evaluations.onSessionsEnded(created.abandoned);
    return toSessionResponse(created.session);
  }

  async list(user: AuthenticatedUser, query: InterviewListQuery): Promise<InterviewListResponse> {
    const rows = await this.repository.list(user.id, cursorWhere(query.cursor), query.limit + 1);
    const page = paginate(rows, query.limit);
    return { items: page.items.map(toSummary), next_cursor: page.next_cursor };
  }

  async get(user: AuthenticatedUser, id: string): Promise<InterviewSessionResponse> {
    return toSessionResponse(await this.owned(user, id));
  }

  /**
   * What the completion screen polls for.
   *
   * `feedback_ready` is true as soon as there is a report to read — including a report that says
   * nothing could be scored. A screen that keeps spinning because the evaluator refused would be
   * worse than one that tells the candidate so, and the report itself carries `status` and
   * `scored_answers` to say exactly how much of it landed.
   */
  async status(user: AuthenticatedUser, id: string): Promise<InterviewStatusResponse> {
    const session = await this.owned(user, id);
    return {
      id: session.id,
      state: session.state,
      status: session.status,
      ended_at: session.endedAt?.toISOString() ?? null,
      feedback_ready: await this.evaluations.hasReport(session.id),
    };
  }

  /**
   * The session report, with the two refusals a candidate's screen has to tell apart.
   *
   * `report_not_ready` is "come back in a moment" and the completion screen polls through it;
   * `report_not_found` is "there will never be one", which is a session that answered nothing. They
   * are different codes rather than one, because the honest screen for each is a different screen
   * (ADR-0012: the web app maps codes to its own copy and never shows the server's English).
   *
   * Reading it is also a recovery: `EvaluationsService.report` queues scoring when a session that
   * ended with answers has no report, because the ordinary enqueue can be lost (ADR-0016 forbids the
   * throw that would have surfaced it). That is why the 409 comes *after* the read rather than
   * instead of it.
   */
  async report(user: AuthenticatedUser, id: string): Promise<SessionReportResponse> {
    const session = await this.owned(user, id);
    if (session.state !== "ended") {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "interview_not_ended",
        "that interview has not finished yet",
      );
    }
    const report = await this.evaluations.report(session.id);
    if (report) return report;
    if (await this.evaluations.willBeScored(session.id)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "report_not_ready",
        "that interview is still being scored",
      );
    }
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      "report_not_found",
      "nothing was answered in that interview, so there is nothing to score",
    );
  }

  private async owned(user: AuthenticatedUser, id: string): Promise<SessionWithContent> {
    const session = await this.repository.findForUser(id, user.id);
    if (!session) {
      throw new ApiError(HttpStatus.NOT_FOUND, "interview_not_found", "no such interview");
    }
    return session;
  }

  // ---------------------------------------------------------------------------------------------

  /**
   * Who is being interviewed: what the setup screen sent, else the candidate's profile — the same
   * fallback the content routes use, against the **published** catalogue (ADR-0015).
   *
   * `stack` distinguishes "not sent" from "sent as null". Omitted means "whatever my profile
   * says"; an explicit `null` is a candidate saying *none of these*, which the stack rule reads as
   * the general questions for the role. The setup screen's "not listed" path sends the null.
   */
  private async audience(userId: string, request: CreateInterviewRequest) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { targetRoleId: true, targetLevelId: true, targetStackId: true },
    });

    const role = await this.publishedRole(request.role ?? null, profile?.targetRoleId ?? null);
    const level = await this.publishedLevel(request.level ?? null, profile?.targetLevelId ?? null);

    const offersLevel = await this.prisma.careerRoleLevel.findUnique({
      where: { roleId_levelId: { roleId: role.id, levelId: level.id } },
      select: { roleId: true },
    });
    if (!offersLevel) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "level_not_offered",
        "that role is not interviewed at that level",
      );
    }

    /*
     * **An asked-for variant is refused; an inherited one is dropped.**
     *
     * The candidate did nothing wrong when the variant on their profile is retired, or belongs to
     * the role they usually practise rather than the one they just chose. Refusing there would
     * lock them out of starting any interview at all until they edited their profile, over a field
     * that is optional by design — so it degrades to "no variant", which the stack rule already
     * has a meaning for: the general questions for the role. Naming one in the request is a
     * different act, and a variant that does not exist or is not on offer is an error.
     */
    const stack =
      request.stack === undefined
        ? await this.inheritedStack(profile?.targetStackId ?? null, role.id)
        : request.stack === null
          ? null
          : await this.requestedStack(request.stack, role.id);
    return { role, level, stack };
  }

  /** A variant the request named: it must exist, be published, and be one this role offers. */
  private async requestedStack(slug: string, roleId: string): Promise<Stack> {
    const stack = await this.prisma.stack.findFirst({ where: { slug, status: "published" } });
    if (!stack) throw this.notFound("stack_not_found", "no such variant");
    const offered = await this.prisma.careerRoleStack.findUnique({
      where: { roleId_stackId: { roleId, stackId: stack.id } },
      select: { roleId: true },
    });
    if (!offered) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "stack_not_offered",
        "that role does not offer that variant",
      );
    }
    return stack;
  }

  /** The variant on the profile, if this role still offers it and it is still published. */
  private async inheritedStack(stackId: string | null, roleId: string): Promise<Stack | null> {
    if (!stackId) return null;
    const stack = await this.prisma.stack.findFirst({
      where: { id: stackId, status: "published", roles: { some: { roleId } } },
    });
    return stack;
  }

  private async publishedRole(slug: string | null, fallbackId: string | null): Promise<CareerRole> {
    const role = await this.prisma.careerRole.findFirst({
      where: slug
        ? { slug, status: "published" }
        : { id: this.required(fallbackId), status: "published" },
    });
    if (!role) throw this.notFound("role_not_found", "no such role");
    return role;
  }

  private async publishedLevel(
    slug: string | null,
    fallbackId: string | null,
  ): Promise<CareerLevel> {
    const level = await this.prisma.careerLevel.findFirst({
      where: slug
        ? { slug, status: "published" }
        : { id: this.required(fallbackId), status: "published" },
    });
    if (!level) throw this.notFound("level_not_found", "no such level");
    return level;
  }

  /** Nothing asked for and nothing on the profile: finish onboarding, or say what you want. */
  private required(id: string | null): string {
    if (!id) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "profile_required",
        "finish onboarding, or ask for a role and level",
      );
    }
    return id;
  }

  /**
   * Which kinds of question this session may use. Omitted is the **preset mixed session** — every
   * type the role supports, which is per role rather than a fixed list: QA is asked to design
   * tests and a backend role is not (`CareerRole.supported_question_types`).
   *
   * The diagnostic is that preset by definition, so it refuses both a length that is not 15 and a
   * list of types, rather than quietly ignoring them. A request whose fields are discarded is a
   * request the candidate cannot reason about.
   */
  private typesFor(
    request: CreateInterviewRequest,
    supported: readonly QuestionType[],
  ): QuestionType[] {
    if (request.is_diagnostic) {
      if (request.minutes !== 15) {
        throw fieldError("minutes", "the diagnostic is a 15-minute session");
      }
      if (request.types) {
        throw fieldError("types", "the diagnostic is a preset mixed session");
      }
      return [...supported];
    }
    if (!request.types) return [...supported];
    const unsupported = request.types.filter((type) => !supported.includes(type));
    if (unsupported.length > 0) {
      throw fieldError("types", "that role is not interviewed with those question types");
    }
    return [...request.types];
  }

  private async consume(key: string, rule: { window: number; max: number }): Promise<void> {
    const result = await this.limiter.consume(key, rule);
    if (!result.allowed) {
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        "rate_limited",
        "too many interviews started; try again later",
      );
    }
  }

  private notFound(code: string, message: string): ApiError {
    return new ApiError(HttpStatus.NOT_FOUND, code, message);
  }
}

// -------------------------------------------------------------------------------------------
// Mapping out. Everything a candidate is sent passes through here.

function toSummary(row: SessionSummaryRow): InterviewSummary {
  const catalogue = SessionCatalogue.parse(row.catalogue);
  return {
    id: row.id,
    state: row.state,
    status: row.status,
    mode: row.mode,
    is_diagnostic: row.isDiagnostic,
    planned_minutes: row.plannedMinutes as InterviewSummary["planned_minutes"],
    ...catalogue,
    started_at: row.startedAt.toISOString(),
    ends_at: row.endsAt.toISOString(),
    ended_at: row.endedAt?.toISOString() ?? null,
    questions_asked: row.questions.filter((question) => question.askedAt !== null).length,
    question_budget: row.questionBudget,
  };
}

/**
 * The session as its candidate may see it.
 *
 * **Only questions the session has reached.** Reading ahead is not a leak of the answer key, but
 * it is a leak of the interview: a candidate who can see question four while answering question
 * one is preparing rather than being interviewed. `asked_at` is the gate, and the integration test
 * asserts the unasked ones are absent rather than merely unmentioned.
 */
function toSessionResponse(session: SessionWithContent): InterviewSessionResponse {
  const catalogue = SessionCatalogue.parse(session.catalogue);
  const questions: CandidateSessionQuestion[] = session.questions.flatMap((row) =>
    row.askedAt
      ? [candidateQuestion(SessionQuestionSnapshot.parse(row.snapshot), row.position, row.askedAt)]
      : [],
  );
  const positionOf = new Map(session.questions.map((row) => [row.id, row.position]));
  const turns: CandidateTurn[] = session.turns.map((turn) => ({
    seq: turn.seq,
    speaker: turn.speaker,
    state: turn.state,
    question_position: turn.sessionQuestionId
      ? (positionOf.get(turn.sessionQuestionId) ?? null)
      : null,
    text: turn.text,
    at: new Date(session.startedAt.getTime() + turn.startedMs).toISOString(),
  }));
  return {
    id: session.id,
    state: session.state,
    status: session.status,
    mode: session.mode,
    persona: session.persona,
    is_diagnostic: session.isDiagnostic,
    planned_minutes: session.plannedMinutes as InterviewSessionResponse["planned_minutes"],
    ...catalogue,
    types: session.types,
    started_at: session.startedAt.toISOString(),
    ends_at: session.endsAt.toISOString(),
    ended_at: session.endedAt?.toISOString() ?? null,
    question_budget: session.questionBudget,
    max_follow_ups: session.maxFollowUps,
    questions,
    turns,
  };
}
