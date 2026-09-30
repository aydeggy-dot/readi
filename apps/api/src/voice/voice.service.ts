import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  INTERVIEW_LIMITS,
  InterviewEngineSnapshot,
  type InterviewTurnPush,
  type InterviewTurnPushResponse,
  type VoiceLatencyQuery,
  type VoiceLatencyResponse,
  type VoiceLatencySession,
  type VoiceLegEndedRequest,
  type VoiceLegEndedResponse,
  type VoiceLegRecord,
  type VoiceSessionLatencyResponse,
  type VoiceSessionStartResponse,
  type VoiceTokenResponse,
  type VoiceTurnLatency,
  VOICE_LIMITS,
} from "@readi/shared-types";
import { AiCallLogService } from "../ai-calls/ai-call-log.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { cursorWhere, paginate } from "../content/content-cursor";
import { EvaluationsService } from "../evaluations/evaluations.service";
import { Prisma } from "../generated/prisma/client";
import { ApiError } from "../http/api-error";
import { InterviewBundleService } from "../interviews/interview-bundle.service";
import {
  InterviewSessionsRepository,
  type SessionWithContent,
  type TurnTiming,
} from "../interviews/interview-sessions.repository";
import { PrismaService } from "../prisma/prisma.service";
import { VoiceAllowanceService } from "./voice-allowance.service";
import { VoiceEligibilityService } from "./voice-eligibility.service";
import { NO_TURNS, summarise } from "./voice-latency";
import { VOICE_ROOM, type VoiceRoom } from "./voice-room";

/**
 * The API's half of a voice interview (M5 phase 4, ADR-0019).
 *
 * Three things live here, and they are three different trust levels.
 *
 * 1. **The join token**, asked for by the candidate's own browser. Everything refusable is refused
 *    before a token exists: not their session, already ended, too old to resume, not a voice session,
 *    no `audio_processing` consent at its current version, no allowance left, no LiveKit configured.
 * 2. **The three internal routes**, reached by the LiveKit agent with the service token. They are not
 *    candidate-scoped — the agent has no user — so every one of them takes the session id from the
 *    path and nothing from a body, and the bundle route is the one place the answer key legitimately
 *    leaves the API (the worker gets `BundleQuestion`: no rubric, no criteria, no weights).
 * 3. **The admin latency view**, aggregate-only and with no candidate in it at all.
 *
 * ## What never enters the room
 *
 * `planned_follow_ups` are answer key and room metadata is readable by participants, so the dispatch
 * carries the session id alone and the agent pulls the rest over the service-token channel
 * (ADR-0019 §4). The join token carries no `name`, no `metadata` and no `attributes`, and the
 * identity is derived from the **session** rather than from the user.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: InterviewSessionsRepository,
    private readonly bundles: InterviewBundleService,
    private readonly eligibility: VoiceEligibilityService,
    private readonly allowance: VoiceAllowanceService,
    private readonly aiCalls: AiCallLogService,
    private readonly evaluations: EvaluationsService,
    @Inject(VOICE_ROOM) private readonly room: VoiceRoom,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---- Browser → API.

  /**
   * `POST /api/interviews/:id/voice-token`.
   *
   * The order of the refusals is the order of the questions: is this session yours and still live,
   * is it a voice session, may we process your voice, have you the minutes. The deployment's own
   * capability is checked before the interviewer is dispatched and not before the session is read —
   * a candidate whose session does not exist should get `interview_not_found` on a deployment with no
   * LiveKit as readily as on one with it.
   */
  async token(user: AuthenticatedUser, id: string): Promise<VoiceTokenResponse> {
    const session = await this.live(user, id);
    if (session.mode !== "voice") {
      // A text session stays a text session: its intro told the candidate it was typed, and its
      // turns have no word timings for M6 to read. Starting a new one is the way into voice.
      throw new ApiError(
        HttpStatus.CONFLICT,
        "voice_not_enabled",
        "this interview was started in text mode",
      );
    }
    await this.eligibility.assert(session.userId, "voice_unavailable");

    const room = roomFor(session.id);
    // Dispatched **before** the token is returned, so the interviewer is on its way by the time the
    // browser has negotiated its microphone. An agent that cannot be dispatched is `voice_unavailable`
    // and the candidate has lost nothing: the session is untouched and text mode resumes it.
    await this.room.dispatch({ room, sessionId: session.id });
    const join = await this.room.join({
      room,
      identity: identityFor(session.id),
      ttlSeconds: VOICE_LIMITS.tokenTtlSeconds,
    });
    this.logger.log(`interview ${session.id}: voice token issued`);
    return {
      url: join.url,
      token: join.token,
      room: join.room,
      identity: join.identity,
      expires_at: join.expiresAt.toISOString(),
      fallback_after_poor_ms: VOICE_LIMITS.fallbackAfterPoorMs,
    };
  }

  // ---- Worker (the LiveKit agent) → API. Internal, service token.

  /**
   * `GET /api/internal/interviews/:id/voice-session` — everything the agent needs to run this leg.
   *
   * **This is the one route that hands the answer key out**, and narrowly: `BundleQuestion` carries
   * the prompt, the context and the planned follow-ups, and no rubric, criteria, weights, descriptors
   * or ideal points (`session-bundle.ts` is the only door). It is pulled rather than pushed because
   * the alternative is putting it in the room.
   *
   * `resume` is true whenever the session has already been advanced — a reconnection, or a second leg
   * after a fallback — and the agent then speaks nothing new and waits for the candidate.
   */
  async startLeg(id: string): Promise<VoiceSessionStartResponse> {
    const session = await this.forWorker(id);
    const now = new Date();
    const allowance = await this.allowance.forUser(session.userId, now);
    return {
      bundle: await this.bundles.bundleFor(session),
      engine_snapshot: snapshotOf(session),
      resume: session.engineSnapshot !== null,
      room: roomFor(session.id),
      ends_at: session.endsAt.toISOString(),
      // The API's clock, once. In text mode `now` travels on every request, which makes an exchange a
      // pure function of it; the agent has to supply its own per turn, so it is given ours and logs
      // the skew. `ends_at` is absolute, so skew only matters at the very margin of a budget.
      now: now.toISOString(),
      voice_seconds_remaining: allowance.remainingSeconds,
    };
  }

  /**
   * `POST /api/internal/interviews/:id/turns` — one completed exchange, arriving by the other door.
   *
   * It is persisted through the **same** `applyExchange` text mode uses: one write path, one
   * definition of what a turn is, and no second place where `follow_ups_asked` is recounted.
   *
   * ## Idempotency, and why it needs a table
   *
   * The turns are already idempotent by `(session_id, seq)` because the engine allocates the seqs. The
   * ai-call rows and the latency rows are not: `ai_call_log` has no natural key, so a retried push
   * would bill the same model calls twice. `voice_exchanges` is the ledger — inserting the agent's
   * `exchange_id` is what claims the exchange, and a conflict is the `duplicate: true` the agent
   * expects and carries on from. Claimed **first**, inside the same transaction as the write, so two
   * pushes racing under one id cannot both proceed.
   */
  async applyTurns(id: string, push: InterviewTurnPush): Promise<InterviewTurnPushResponse> {
    const session = await this.forWorker(id);
    const claimed = await this.claim(session.id, push.exchange_id);
    if (!claimed) {
      this.logger.log(`interview ${session.id}: exchange ${push.exchange_id} already applied`);
      return {
        state: session.state,
        status: session.status,
        ended: session.state === "ended",
        duplicate: true,
      };
    }

    const respondedAt = new Date();
    const applied = await this.repository.applyExchange(session, push, {
      /*
       * The moment the candidate stopped speaking is when this exchange began — the agent measured it,
       * and it is what makes a candidate turn span the time they were really talking rather than the
       * time our push took to arrive. An exchange with no samples (one that only listened) falls back
       * to the text-mode derivation, which is the same answer it would have given anyway.
       */
      requestedAt: speechEndedAt(push) ?? respondedAt,
      respondedAt,
      timings: voiceTimings(push, session.startedAt),
    });

    // Recorded after the claim and before the outcome is read: what was spent was spent, and the
    // claim is what stops it being recorded twice. `ai_calls` here is the engine's calls **and** the
    // speech providers' — a voice session's bill is the model plus the minutes (ADR-0007).
    await this.aiCalls.record(push.ai_calls, {
      userId: session.userId,
      sessionId: session.id,
    });
    await this.storeLatency(session.id, push.latency);

    const ended = applied.session.state === "ended";
    if (ended) {
      /*
       * The third and fourth doors to `ended` are here (M4's `onSessionsEnded` owns all of them): the
       * engine wrapping up inside a voice leg, and a candidate ending early by voice. Logged rather
       * than raised, like the text path's: the agent has already spoken the close, so a failed enqueue
       * costs the report and not the interview — and `EvaluationSweepQueue` picks it up regardless.
       */
      try {
        await this.evaluations.onSessionsEnded([session.id]);
      } catch (error) {
        this.logger.error(
          `interview ${session.id} ended in voice but could not be queued for scoring: ` +
            `${error instanceof Error ? error.name : "error"}`,
        );
      }
    }
    return {
      state: applied.session.state,
      status: applied.session.status,
      ended,
      duplicate: false,
    };
  }

  /**
   * `POST /api/internal/interviews/:id/voice-ended` — the leg is over, and this is what meters it.
   *
   * **The leg row is the fallback bookkeeping** (ADR-0019 §7). `interview_sessions.mode` keeps meaning
   * how the session *started*, so a fallback to text is not a rewrite of history: it is a row saying
   * this leg ended `fallback_poor_connection`, and the interview carried on over SSE at the same turn.
   *
   * The minutes go to `usage_ledger` whether the leg ended well or badly, because minutes spent on a
   * call that then fell over are still minutes. Both writes are one transaction keyed on `leg_id`, so
   * a retried report meters nothing twice.
   */
  async legEnded(id: string, request: VoiceLegEndedRequest): Promise<VoiceLegEndedResponse> {
    const session = await this.forWorker(id);
    const endedAt = new Date();
    let duplicate = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.voiceLeg.create({
          data: {
            id: request.leg_id,
            sessionId: session.id,
            reason: request.reason,
            voiceSeconds: request.voice_seconds,
            turnsSpoken: request.turns_spoken,
            rttMsP50: request.quality.rtt_ms_p50,
            rttMsP95: request.quality.rtt_ms_p95,
            packetLossPercent: request.quality.packet_loss_percent,
            reconnects: request.quality.reconnects,
          },
        });
        /*
         * A leg that spent no seconds writes no ledger row. It is not the same as writing a zero: the
         * ledger is a record of what was used, and a room nobody joined used nothing — a zero row
         * would make "how many voice legs have been metered?" answer wrongly for ever.
         */
        if (request.voice_seconds > 0) {
          await tx.usageLedger.create({
            data: {
              userId: session.userId,
              sessionId: session.id,
              kind: "voice_seconds",
              quantity: request.voice_seconds,
              sourceId: request.leg_id,
              occurredAt: endedAt,
            },
          });
        }
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      duplicate = true;
    }
    if (!duplicate) {
      this.logger.log(
        `interview ${session.id}: voice leg ended ${request.reason} ` +
          `after ${request.voice_seconds}s over ${request.turns_spoken} turns` +
          `${request.quality.reconnects > 0 ? `, ${request.quality.reconnects} reconnects` : ""}`,
      );
      if (request.reason === "fallback_poor_connection") {
        /*
         * Spec §9's `voice_fallback_to_text`. There is **no analytics emit path in this codebase yet**
         * — PostHog is initialised in the browser and captures nothing, and M9 owns the typed event
         * helper and its no-PII test — so this is a log line beside a durable row rather than half an
         * analytics layer built early and then rebuilt. The row is what M9's event will be derived
         * from, and the admin view already counts it.
         */
        this.logger.warn(`interview ${session.id}: voice fell back to text (poor connection)`);
      }
    }
    return { duplicate, voice_seconds_total: await this.allowance.forSession(session.id) };
  }

  // ---- API → admin.

  /** `GET /api/admin/voice/latency` — every voice session, newest first, with its own spread. */
  async latency(query: VoiceLatencyQuery): Promise<VoiceLatencyResponse> {
    const rows = await this.prisma.interviewSession.findMany({
      where: { mode: "voice", ...cursorWhere(query.cursor) },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: latencyInclude,
    });
    const page = paginate(rows, query.limit);
    const sessions = page.items.map(toLatencySession);
    return {
      // Over the turns of the sessions **on this page**, which is what the page says. An aggregate
      // whose denominator moves with the pager would otherwise read as the figure for the deployment.
      overall: summarise(page.items.flatMap((row) => row.voiceLatency.map(toLatencyTurn))),
      targets: TARGETS,
      sessions,
      next_cursor: page.next_cursor,
    };
  }

  /** `GET /api/admin/voice/latency/:id` — one session, turn by turn. */
  async sessionLatency(id: string): Promise<VoiceSessionLatencyResponse> {
    const row = await this.prisma.interviewSession.findFirst({
      where: { id },
      include: latencyInclude,
    });
    if (!row) {
      throw new ApiError(HttpStatus.NOT_FOUND, "interview_not_found", "no such interview");
    }
    return {
      session: toLatencySession(row),
      targets: TARGETS,
      turns: row.voiceLatency.map(toLatencyTurn),
    };
  }

  // ---- Reading a session.

  /** The candidate's own session, if it is theirs and can still be advanced. */
  private async live(user: AuthenticatedUser, id: string): Promise<SessionWithContent> {
    const session = await this.repository.findForUser(id, user.id);
    if (!session) {
      throw new ApiError(HttpStatus.NOT_FOUND, "interview_not_found", "no such interview");
    }
    if (session.status !== "in_progress") {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "interview_ended",
        `this interview is ${session.status}`,
      );
    }
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
   * The session for an internal caller. **Not scoped to a user**, because the agent is not one.
   *
   * It is also not scoped to `in_progress`: a push may legitimately arrive for a session that has just
   * ended — the exchange that ended it is pushed after its audio has settled — and refusing that would
   * throw away the close, the end reason and the last answer. What guards these routes is the service
   * token; what makes them safe to call twice is `voice_exchanges` and `leg_id`.
   */
  private async forWorker(id: string): Promise<SessionWithContent> {
    const session = await this.prisma.interviewSession.findFirst({
      where: { id },
      include: { questions: { orderBy: { position: "asc" } }, turns: { orderBy: { seq: "asc" } } },
    });
    if (!session) {
      throw new ApiError(HttpStatus.NOT_FOUND, "interview_not_found", "no such interview");
    }
    return session;
  }

  /** Claims one exchange. False means this `exchange_id` had already been applied. */
  private async claim(sessionId: string, exchangeId: string): Promise<boolean> {
    try {
      await this.prisma.voiceExchange.create({ data: { id: exchangeId, sessionId } });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  /**
   * The latency samples. `skipDuplicates` on `(session_id, turn_seq)` rather than an upsert: a sample
   * is a measurement of something that happened once, so the first one written is the true one and a
   * second arrival is a replay to be ignored.
   */
  private async storeLatency(
    sessionId: string,
    samples: readonly VoiceTurnLatency[],
  ): Promise<void> {
    if (samples.length === 0) return;
    await this.prisma.voiceTurnLatency.createMany({
      data: samples.map((sample) => ({
        sessionId,
        turnSeq: sample.turn_seq,
        speechEndedAt: new Date(sample.speech_ended_at),
        endpointMs: sample.endpoint_ms,
        sttFinalMs: sample.stt_final_ms,
        acknowledgedMs: sample.acknowledged_ms,
        coverageMs: sample.coverage_ms,
        phrasingMs: sample.phrasing_ms,
        ttsFirstByteMs: sample.tts_first_byte_ms,
        responseMs: sample.response_ms,
        prefetched: sample.prefetched,
        interimCoverage: sample.interim_coverage,
        interrupted: sample.interrupted,
      })),
      skipDuplicates: true,
    });
  }
}

/** The two targets `VOICE_LIMITS` holds, served so the page and the tests read one number. */
const TARGETS = {
  first_audio_ms: VOICE_LIMITS.firstAudioTargetMs,
  response_ms: VOICE_LIMITS.responseTargetMs,
} as const;

const latencyInclude = {
  voiceLatency: { orderBy: { turnSeq: "asc" } },
  voiceLegs: { orderBy: { createdAt: "asc" } },
  usage: { where: { kind: "voice_seconds" }, select: { quantity: true } },
} satisfies Prisma.InterviewSessionInclude;

type LatencyRow = Prisma.InterviewSessionGetPayload<{ include: typeof latencyInclude }>;

/**
 * One session for the admin list. **No candidate in it** — not their name, their email or their id:
 * this view exists to read a number against a target, and who was interviewed is not part of that
 * question. It is the calibration dashboard's rule (ADR-0017) applied to a different screen.
 */
function toLatencySession(row: LatencyRow): VoiceLatencySession {
  return {
    session_id: row.id,
    started_at: row.startedAt.toISOString(),
    ended_at: row.endedAt?.toISOString() ?? null,
    status: row.status,
    state: row.state,
    voice_seconds: row.usage.reduce((total, entry) => total + entry.quantity, 0),
    fell_back_to_text: row.voiceLegs.some((leg) => leg.reason === "fallback_poor_connection"),
    legs: row.voiceLegs.map(toLegRecord),
    latency:
      row.voiceLatency.length === 0 ? NO_TURNS : summarise(row.voiceLatency.map(toLatencyTurn)),
  };
}

function toLegRecord(leg: LatencyRow["voiceLegs"][number]): VoiceLegRecord {
  return {
    leg_id: leg.id,
    reason: leg.reason,
    voice_seconds: leg.voiceSeconds,
    turns_spoken: leg.turnsSpoken,
    quality: {
      rtt_ms_p50: leg.rttMsP50,
      rtt_ms_p95: leg.rttMsP95,
      packet_loss_percent: leg.packetLossPercent,
      reconnects: leg.reconnects,
    },
    ended_at: leg.createdAt.toISOString(),
  };
}

function toLatencyTurn(row: LatencyRow["voiceLatency"][number]): VoiceTurnLatency {
  return {
    turn_seq: row.turnSeq,
    speech_ended_at: row.speechEndedAt.toISOString(),
    endpoint_ms: row.endpointMs,
    stt_final_ms: row.sttFinalMs,
    acknowledged_ms: row.acknowledgedMs,
    coverage_ms: row.coverageMs,
    phrasing_ms: row.phrasingMs,
    tts_first_byte_ms: row.ttsFirstByteMs,
    response_ms: row.responseMs,
    prefetched: row.prefetched,
    interim_coverage: row.interimCoverage,
    interrupted: row.interrupted,
  };
}

/**
 * The room a session is held in, and who the candidate is inside it.
 *
 * Both are derived from the **session** id, and deliberately not from the user's. A room name is
 * visible to everyone in it and appears in LiveKit's own logs and dashboards; a session id leads
 * nowhere without our database, while a user id would link every room that candidate has ever been in.
 * Deriving them also makes a reconnection free: the browser asks for another token and rejoins the
 * room the interviewer is already in.
 */
export const roomFor = (sessionId: string): string => `interview-${sessionId}`;
export const identityFor = (sessionId: string): string => `candidate-${sessionId}`;

/** The stored snapshot, or null on a session that has never been advanced. */
function snapshotOf(session: SessionWithContent): VoiceSessionStartResponse["engine_snapshot"] {
  if (session.engineSnapshot === null) return null;
  // Parsed rather than cast: it is our own column, but it crossed a language boundary to get here and
  // the engine that wrote it may be a different deployment of the worker (`ENGINE_SNAPSHOT_VERSION`).
  return InterviewEngineSnapshot.parse(session.engineSnapshot);
}

/** When the candidate stopped speaking, from the earliest sample this exchange carries. */
function speechEndedAt(push: InterviewTurnPush): Date | null {
  const times = push.latency.map((sample) => new Date(sample.speech_ended_at).getTime());
  return times.length === 0 ? null : new Date(Math.min(...times));
}

/**
 * Each turn's own clock, for the turns that have one.
 *
 * Voice knows more than text mode's single round trip can express. An **interviewer** turn began when
 * its first audio byte went out (`speech_ended_at + response_ms`) and lasted as long as it was spoken
 * for (`spoken_ms`), which is exactly what the candidate experienced — including a turn they cut off
 * half way. A **candidate** turn is left to the default derivation, which spans from the previous
 * turn's end to the moment this exchange began: the time they spent speaking, which is what M6 reads.
 *
 * `spoken_ms` may be missing on a turn whose audio never started, in which case the turn is recorded
 * as instantaneous rather than guessed at — a zero-length turn is visibly a turn nobody heard.
 */
function voiceTimings(push: InterviewTurnPush, startedAt: Date): Map<number, TurnTiming> {
  const spokenFor = new Map(
    push.turns
      .filter((turn) => turn.speaker === "interviewer")
      .map((turn) => [turn.seq, turn.voice?.spoken_ms ?? null] as const),
  );
  const timings = new Map<number, TurnTiming>();
  for (const sample of push.latency) {
    if (!spokenFor.has(sample.turn_seq)) continue;
    const startedMs = Math.max(
      0,
      new Date(sample.speech_ended_at).getTime() + sample.response_ms - startedAt.getTime(),
    );
    timings.set(sample.turn_seq, {
      startedMs,
      endedMs: startedMs + (spokenFor.get(sample.turn_seq) ?? 0),
    });
  }
  return timings;
}

/** A unique-constraint collision — the shape both idempotency claims here are built on. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
