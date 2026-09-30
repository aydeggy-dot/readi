import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  type AdvanceInterviewRequest,
  type AiCallRecord,
  type CandidateTurn,
  type InterviewAdvanceRequest,
  type InterviewAdvanceResponse,
  InterviewEngineSnapshot,
  type InterviewFrame,
  INTERVIEW_LIMITS,
  SessionQuestionSnapshot,
} from "@readi/shared-types";
import type { Redis } from "ioredis";
import { AiCallLogService } from "../ai-calls/ai-call-log.service";
import { AiWorkerClient, AiWorkerUnavailableError } from "../ai-worker/ai-worker.client";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { Env } from "../config/env";
import { EvaluationsService } from "../evaluations/evaluations.service";
import { ENV } from "../config/env.module";
import { ApiError } from "../http/api-error";
import { REDIS } from "../redis/redis.module";
import { InterviewBundleService } from "./interview-bundle.service";
import {
  type AppliedExchange,
  InterviewSessionsRepository,
  type SessionWithContent,
} from "./interview-sessions.repository";
import { type InterviewStream, whileThinking } from "./interview-sse";
import { candidateQuestion } from "./session-bundle";

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
    private readonly bundles: InterviewBundleService,
    private readonly evaluations: EvaluationsService,
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
    let ended = false;
    try {
      stream.open();
      ended = await this.exchange(session, request, stream);
    } finally {
      /*
       * **The lock goes before the response ends, not after.** Closing the stream is what tells
       * the client the exchange is over, and a client that sends its next answer the moment it
       * sees that — a script, a test, M5's agent — used to meet a lock this exchange had already
       * finished with and get `interview_busy` for a perfectly sequential request. It was read as
       * a flaky test for a while; it is the order of these two lines.
       */
      await release();
      stream.close();
    }
    /*
     * Two of the three doors to `ended` are this one: the engine wrapping up because a budget ran out,
     * and the candidate ending early — which is the same exchange with a different reason, so it is the
     * same line of code (M4).
     *
     * **Outside the stream, deliberately.** ADR-0016's rule is that nothing between `open()` and
     * `close()` may throw, because by then the status is already 200; an enqueue that failed in there
     * would turn a finished exchange into a broken response. Out here the candidate already has every
     * frame, so the worst a failure costs is the report — logged, not raised, and recoverable, because
     * a completed session with no report can be queued again when it is asked for.
     */
    if (ended) {
      try {
        await this.evaluations.onSessionsEnded([session.id]);
      } catch (error) {
        this.logger.error(
          `interview ${session.id} ended but could not be queued for scoring: ` +
            `${error instanceof Error ? error.name : "error"}`,
        );
      }
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
      try {
        // Only if it is still ours: a lock that expired and was retaken belongs to that exchange.
        const held = await this.redis.get(key);
        if (held === token) await this.redis.del(key);
      } catch {
        // Best effort, and deliberately silent: the key carries a TTL, so an unreachable Redis
        // costs the candidate one wait rather than their interview — and this runs in a `finally`
        // that still has to close the stream.
      }
    };
  }

  /**
   * Ask the worker, record what it cost, write what happened, and stream it. Never throws.
   *
   * Returns whether the session ended, which the caller acts on **after** the stream is closed.
   */
  private async exchange(
    session: SessionWithContent,
    request: AdvanceInterviewRequest,
    stream: InterviewStream,
  ): Promise<boolean> {
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
        return false;
      }
      throw error;
    }

    // Recorded before the outcome is read: a refused exchange still spent whatever it spent.
    await this.recordCalls(session, calls);

    if (response.error !== null || response.engine_snapshot === null) {
      this.logger.warn(`interview ${session.id}: engine refused (${response.error})`);
      stream.send({ type: "error", code: "interview_error" });
      return false;
    }

    const applied = await this.repository.applyExchange(session, response, {
      requestedAt,
      respondedAt: new Date(),
    });
    for (const frame of framesFor(applied, response)) stream.send(frame);
    return applied.session.state === "ended";
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
    const bundle = await this.bundles.bundleFor(session);
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
