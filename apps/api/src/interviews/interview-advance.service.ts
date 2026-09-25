import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  type AdvanceInterviewRequest,
  type AiCallRecord,
  type CandidateTurn,
  type InterviewAdvanceRequest,
  type InterviewAdvanceResponse,
  type InterviewCandidateContext,
  InterviewEngineSnapshot,
  type InterviewFrame,
  INTERVIEW_LIMITS,
  SessionCatalogue,
  SessionQuestionSnapshot,
} from "@readi/shared-types";
import type { Redis } from "ioredis";
import { AiCallLogService } from "../ai-calls/ai-call-log.service";
import { AiWorkerClient, AiWorkerUnavailableError } from "../ai-worker/ai-worker.client";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { ApiError } from "../http/api-error";
import { REDIS } from "../redis/redis.module";
import {
  type AppliedExchange,
  InterviewSessionsRepository,
  type SessionWithContent,
} from "./interview-sessions.repository";
import { type InterviewStream, whileThinking } from "./interview-sse";
import { candidateQuestion, sessionBundle } from "./session-bundle";

/** How long one exchange may hold a session, past which a stuck lock cannot block it for ever. */
const LOCK_SLACK_MS = 30_000;

/**
 * Advancing a session: the API's half of one exchange (ADR-0016).
 *
 * The engine is in the worker (ADR-0004), so this owns everything the worker may not: who the
 * candidate is, whether this session is theirs and still live, the pinned content, the transcript,
 * and what the model calls cost. It asks the worker what happens and writes down the answer.
 *
 * ## An exchange is all-or-nothing
 *
 * Nothing is persisted until the worker has answered in full, and the worker stores nothing until it
 * has answered either. So a stream that breaks, an API that times out, or a `worker_unavailable`
 * leaves the session exactly where it was, and the same action may simply be sent again — replayed
 * idempotently, because the engine allocates the turn seqs.
 *
 * ## Where a refusal appears
 *
 * Everything knowable before the stream opens is an ordinary HTTP error with an `ApiError` code:
 * `interview_not_found`, `interview_ended`, `interview_expired`, `interview_busy`. Once the headers
 * are out the status is already 200, so a failure after that is an `error` frame. That split is why
 * `stream.open()` is called where it is, and why nothing below it throws.
 */
@Injectable()
export class InterviewAdvanceService {
  private readonly logger = new Logger(InterviewAdvanceService.name);

  constructor(
    private readonly repository: InterviewSessionsRepository,
    private readonly worker: AiWorkerClient,
    private readonly aiCalls: AiCallLogService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async advance(
    user: AuthenticatedUser,
    id: string,
    request: AdvanceInterviewRequest,
    stream: InterviewStream,
  ): Promise<void> {
    const session = await this.live(user, id);
    const release = await this.lock(id);
    try {
      stream.open();
      await this.exchange(session, request, stream);
    } finally {
      stream.close();
      await release();
    }
  }

  /** The session, if it is this candidate's and can still be advanced. */
  private async live(user: AuthenticatedUser, id: string): Promise<SessionWithContent> {
    const session = await this.repository.findForUser(id, user.id);
    if (!session) {
      throw new ApiError(HttpStatus.NOT_FOUND, "interview_not_found", "no such interview");
    }
    if (session.status !== "in_progress") {
      // Completed or abandoned. The screen reads the session and shows the transcript instead.
      throw new ApiError(
        HttpStatus.CONFLICT,
        "interview_ended",
        `this interview is ${session.status}`,
      );
    }
    /*
     * Past the deadline is fine and is the engine's business: it wraps the session up. Past the
     * **resume grace** is not — the candidate walked away long enough ago that picking the thread
     * back up would be worse than starting again, and the sweep is about to mark it abandoned. The
     * check is here as well as in the sweep because a sweep runs every ten minutes and this does not.
     */
    const cutoff = session.endsAt.getTime() + INTERVIEW_LIMITS.resumeGraceMinutes * 60 * 1_000;
    if (Date.now() > cutoff) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "interview_expired",
        "this interview is too old to resume",
      );
    }
    return session;
  }

  /**
   * One exchange at a time per session.
   *
   * Without this, a double-tapped send button runs two exchanges from the same snapshot, both
   * allocate the same seqs, and the loser collides on `(session_id, seq)` — a 500 for what is really
   * "you already sent that". Held for as long as the worker may take plus slack, so a process that
   * dies mid-exchange cannot lock a candidate out of their own interview for longer than that.
   */
  private async lock(id: string): Promise<() => Promise<void>> {
    const key = `interview-advance:${id}`;
    const token = `${process.pid}:${Date.now()}`;
    const taken = await this.redis.set(
      key,
      token,
      "PX",
      this.env.AI_WORKER_TIMEOUT_MS + LOCK_SLACK_MS,
      "NX",
    );
    if (taken !== "OK") {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "interview_busy",
        "this interview is already being advanced",
      );
    }
    return async () => {
      // Only if it is still ours: a lock that expired and was retaken belongs to that exchange now.
      const held = await this.redis.get(key);
      if (held === token) await this.redis.del(key);
    };
  }

  /** Ask the worker, record what it cost, write what happened, and stream it. Never throws. */
  private async exchange(
    session: SessionWithContent,
    request: AdvanceInterviewRequest,
    stream: InterviewStream,
  ): Promise<void> {
    const requestedAt = new Date();
    const calls: AiCallRecord[] = [];
    let response: InterviewAdvanceResponse;
    try {
      response = await whileThinking(stream, this.env.INTERVIEW_SSE_HEARTBEAT_MS, () =>
        this.ask(session, request, requestedAt, calls),
      );
    } catch (error) {
      await this.recordCalls(session, calls);
      if (error instanceof AiWorkerUnavailableError) {
        this.logger.warn(`interview ${session.id}: worker unavailable (${error.message})`);
        stream.send({ type: "error", code: "worker_unavailable" });
        return;
      }
      throw error;
    }

    // Recorded before the outcome is read: a refused exchange still spent whatever it spent.
    await this.recordCalls(session, calls);

    if (response.error !== null || response.engine_snapshot === null) {
      this.logger.warn(`interview ${session.id}: engine refused (${response.error})`);
      stream.send({ type: "error", code: "interview_error" });
      return;
    }

    const applied = await this.repository.applyExchange(session, response, {
      requestedAt,
      respondedAt: new Date(),
    });
    for (const frame of framesFor(applied, response)) stream.send(frame);
  }

  /**
   * The worker call, and the one round trip the bundle costs.
   *
   * The bundle goes out on the first exchange of a session and then not again: the worker caches it
   * in Redis so the API is not resending four to eight pinned questions — with their code snippets —
   * on every turn. When that cache has gone the worker answers `bundle_required`, which is the only
   * way the API can learn of a Redis miss it cannot see, and the exchange is retried with it. That
   * answer costs no model call, so the retry is the only one that spends anything.
   */
  private async ask(
    session: SessionWithContent,
    request: AdvanceInterviewRequest,
    requestedAt: Date,
    calls: AiCallRecord[],
  ): Promise<InterviewAdvanceResponse> {
    const bundle = this.bundleFor(session);
    const snapshot = session.engineSnapshot
      ? InterviewEngineSnapshot.parse(session.engineSnapshot)
      : null;
    const base: InterviewAdvanceRequest = {
      session_id: session.id,
      action: request.action,
      text: request.action === "answer" ? (request.text ?? null) : null,
      now: requestedAt.toISOString(),
      bundle: snapshot === null ? bundle : null,
      engine_snapshot: snapshot,
    };

    let response = await this.worker.advanceInterview(base);
    calls.push(...response.ai_calls);
    if (response.error === "bundle_required") {
      this.logger.log(`interview ${session.id}: worker asked for the bundle again`);
      response = await this.worker.advanceInterview({ ...base, bundle });
      calls.push(...response.ai_calls);
    }
    return response;
  }

  /**
   * What the worker is given. The rubric is not in it — `bundleQuestion` is the only door out of a
   * snapshot and it does not carry one (CLAUDE.md §5) — and the candidate is described in the
   * catalogue's own **names**, as the session recorded them, so a role renamed afterwards cannot
   * change how the interviewer addressed them.
   */
  private bundleFor(session: SessionWithContent): InterviewAdvanceRequest["bundle"] {
    const catalogue = SessionCatalogue.parse(session.catalogue);
    const candidate: InterviewCandidateContext = {
      role_label: catalogue.role.name,
      level_label: catalogue.level.name,
      stack_label: catalogue.stack?.name ?? null,
      // Real from M4, when there are evaluations to derive a weak topic from.
      weak_topics: [],
    };
    return sessionBundle(
      {
        id: session.id,
        mode: session.mode,
        persona: session.persona,
        isDiagnostic: session.isDiagnostic,
        plannedMinutes: session.plannedMinutes,
        endsAt: session.endsAt,
        questionBudget: session.questionBudget,
        maxFollowUps: session.maxFollowUps,
      },
      session.questions.map((row) => SessionQuestionSnapshot.parse(row.snapshot)),
      candidate,
    );
  }

  private async recordCalls(session: SessionWithContent, calls: AiCallRecord[]): Promise<void> {
    if (calls.length === 0) return;
    // `sessionId` has been a column on `ai_call_log` since M1 waiting for exactly this (ADR-0007).
    await this.aiCalls.record(calls, { userId: session.userId, sessionId: session.id });
    calls.length = 0;
  }
}

/**
 * The frames for one exchange, in the order the screen needs them.
 *
 * A question's own setup material — a snippet, a scenario, a table — goes **before** the turn that
 * asks about it, so the screen has the code by the time it has the sentence pointing at it. The
 * `state` frame is always last before `done`, because it is what the progress bar and the timer read
 * and they should not move until everything said in this exchange is on screen.
 */
export function framesFor(
  applied: AppliedExchange,
  response: InterviewAdvanceResponse,
): InterviewFrame[] {
  const { session, newlyAsked } = applied;
  const positionOf = new Map(session.questions.map((row) => [row.id, row.position]));
  const rowAt = new Map(session.questions.map((row) => [row.position, row]));
  const seqs = new Set(response.turns.map((turn) => turn.seq));
  const frames: InterviewFrame[] = [];

  for (const turn of session.turns.filter((row) => seqs.has(row.seq))) {
    const position = turn.sessionQuestionId
      ? (positionOf.get(turn.sessionQuestionId) ?? null)
      : null;
    if (position !== null && newlyAsked.includes(position)) {
      const row = rowAt.get(position);
      if (row?.askedAt) {
        frames.push({
          type: "question",
          question: candidateQuestion(
            SessionQuestionSnapshot.parse(row.snapshot),
            position,
            row.askedAt,
          ),
        });
      }
    }
    const candidate: CandidateTurn = {
      seq: turn.seq,
      speaker: turn.speaker,
      state: turn.state,
      question_position: position,
      text: turn.text,
      at: new Date(session.startedAt.getTime() + turn.startedMs).toISOString(),
    };
    frames.push({ type: "turn", turn: candidate });
  }

  frames.push({
    type: "state",
    state: session.state,
    status: session.status,
    ends_at: session.endsAt.toISOString(),
    ended_at: session.endedAt?.toISOString() ?? null,
    questions_asked: session.questions.filter((row) => row.askedAt !== null).length,
    question_budget: session.questionBudget,
  });
  frames.push({ type: "done" });
  return frames;
}
