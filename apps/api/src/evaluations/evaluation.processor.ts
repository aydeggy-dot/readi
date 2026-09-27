import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type AiCallRecord,
  EVALUATION_LIMITS,
  type EvaluateAnswerResponse,
  SCORING_VERSION,
  SessionCatalogue,
  SessionQuestionSnapshot,
} from "@readi/shared-types";
import { AiCallLogService } from "../ai-calls/ai-call-log.service";
import { AiWorkerClient, AiWorkerUnavailableError } from "../ai-worker/ai-worker.client";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { evaluationRequest, type TurnForEvaluation } from "../interviews/session-bundle";
import { type AnswerForReport, assembleReport } from "./report-assembly";
import { EvaluationsRepository, type SessionToEvaluate } from "./evaluations.repository";
import { followUpsAsked, promptedCriteria, unaskedCriteria } from "./prompting";
import { notAssessedCriteria, scoreAnswer } from "./scoring";

/** One session to score. Ids only, like every other job (ADR-0004). */
export interface EvaluationJob {
  sessionId: string;
}

/**
 * Scores one ended session and stores its report.
 *
 * ## Why the fan-out is in the design rather than an optimisation
 *
 * Spec §8 asks for a report within 60 s of the session ending. `INTERVIEW_PLANS` is 4 questions at 15
 * minutes and **8 at 30**, and one evaluator call is seconds rather than milliseconds, so eight of
 * them in sequence cannot meet that budget on any model we would want to use. They are independent —
 * one answer, one rubric, one call — so they run concurrently, bounded by `EVALUATION_CONCURRENCY`
 * because the point of a bound is that a 30-minute session does not open eight simultaneous paid
 * requests and eight simultaneous worker slots.
 *
 * ## What is retried, and what is not
 *
 * Two different failures live here and they are not treated alike.
 *
 * - **The model would not produce usable output.** The worker has already retried twice and applied
 *   its three gates; it answers with `error` set. That answer is **stored as `failed`** and the report
 *   says so for that question. It is not retried again here: paying a third, fourth and fifth time for
 *   the same refusal is not diligence.
 * - **The worker could not be reached.** Nothing was decided, so the job is thrown out of and BullMQ
 *   retries it with backoff. Answers already stored are skipped on the way back through, so a retry
 *   costs only what it has not already paid for. On the **final** attempt the unreachable answers are
 *   stored as `failed` too, because a report that never arrives is worse than a report with a gap in
 *   it — the same shape `cv-parse.processor.ts` uses.
 *
 * **An answer with a row is never re-scored.** The unique constraint on `session_question_id` makes
 * that safe rather than merely likely, and re-running the job on a session that is already scored
 * makes no model call at all. A `failed` answer is therefore final until somebody decides otherwise,
 * which is deliberate: re-scoring costs money and is an operator's call, not a silent one.
 */
@Injectable()
export class EvaluationProcessor {
  private readonly logger = new Logger(EvaluationProcessor.name);

  constructor(
    private readonly repository: EvaluationsRepository,
    private readonly worker: AiWorkerClient,
    private readonly aiCalls: AiCallLogService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async process(job: EvaluationJob, { finalAttempt }: { finalAttempt: boolean }): Promise<void> {
    const session = await this.repository.session(job.sessionId);
    if (!session) return;
    if (session.state !== "ended") {
      // Resumed between the enqueue and here, which is possible: the sweep abandons a session on a
      // deadline and a candidate can be back inside the resume grace. Scoring a live interview would
      // pin half a report to it.
      this.logger.log(`evaluation skipped for session ${session.id}: not ended`);
      return;
    }

    const answers = answersOf(session);
    if (answers.length === 0) return;

    let unreachable = false;
    await concurrently(
      answers.filter((answer) => !answer.alreadyStored),
      this.env.EVALUATION_CONCURRENCY,
      async (answer) => {
        try {
          await this.evaluate(session, answer);
        } catch (error) {
          if (!(error instanceof AiWorkerUnavailableError)) throw error;
          unreachable = true;
          if (finalAttempt) await this.giveUp(answer);
        }
      },
    );

    // Assembled from what is **stored**, so a partial run produces a partial report rather than none,
    // and a retry that fills the gap rewrites it.
    await this.assemble(session, answers);
    if (unreachable && !finalAttempt) {
      throw new AiWorkerUnavailableError(`evaluation incomplete for session ${session.id}`);
    }
  }

  /** One answer: ask the worker, record what it cost, weight it in code, store it. */
  private async evaluate(session: SessionToEvaluate, answer: Answer): Promise<void> {
    const request = evaluationRequest(
      { id: session.id, userId: session.userId },
      answer.position,
      answer.snapshot,
      answer.turns,
    );
    // An unreachable worker throws before there is anything to record: it never answered, so there
    // is no call to bill and nothing was decided.
    const response: EvaluateAnswerResponse = await this.worker.evaluateAnswer(request);
    await this.recordCalls(session, response.ai_calls);

    const prompted = promptedCriteria(answer.snapshot.planned_follow_ups, answer.turns);
    // The other half of the engine fact: probes this question carried that the interview never asked.
    // On its own it changes nothing — `notAssessedCriteria` is where it meets the model's reading.
    const unasked = unaskedCriteria(answer.snapshot.planned_follow_ups, answer.turns);
    const evaluation = response.evaluation;
    const notAssessed = evaluation
      ? notAssessedCriteria(answer.snapshot.rubric.criteria, evaluation.criteria, unasked)
      : [];
    await this.repository.save({
      sessionQuestionId: answer.sessionQuestionId,
      status: evaluation ? "ok" : "failed",
      evaluation,
      // The model's scores, the **pinned** weights, and the engine's record of what it had to ask.
      score: evaluation
        ? scoreAnswer(answer.snapshot.rubric.criteria, evaluation.criteria, {
            prompted,
            notAssessed,
          })
        : null,
      promptedCriteria: prompted,
      notAssessedCriteria: notAssessed,
      evidenceFlags: response.evidence_flags,
      ...modelOf(response.ai_calls),
      promptVersions: response.prompt_versions,
      attempts: Math.max(1, response.ai_calls.length),
      failureReason: response.error,
    });
    if (response.evidence_flags.length > 0) {
      // Ids and our own phrases: nothing the candidate wrote reaches a log (CLAUDE.md §5).
      this.logger.log(
        `session ${session.id} answer ${answer.position}: evidence reads like an instruction ` +
          `(${response.evidence_flags.join(", ")})`,
      );
    }
  }

  /**
   * The worker was unreachable on the last attempt. The answer is unscored and says why, rather than
   * the session having no report at all.
   */
  private async giveUp(answer: Answer): Promise<void> {
    this.logger.warn(
      `evaluation gave up on answer ${answer.sessionQuestionId}: worker unavailable`,
    );
    await this.repository.save({
      sessionQuestionId: answer.sessionQuestionId,
      status: "failed",
      evaluation: null,
      score: null,
      promptedCriteria: promptedCriteria(answer.snapshot.planned_follow_ups, answer.turns),
      // Nothing was read, so nothing is known about which criteria the answer reached: the engine's
      // "nobody asked" is only half the rule, and half of it is not a reason to drop a criterion.
      notAssessedCriteria: [],
      evidenceFlags: [],
      provider: "unknown",
      model: "unknown",
      promptVersions: {},
      attempts: 0,
      failureReason: "provider_error",
    });
  }

  /** The report, from the stored rows and the pinned snapshots. */
  private async assemble(session: SessionToEvaluate, answers: readonly Answer[]): Promise<void> {
    const stored = new Map(
      (await this.repository.stored(session.id)).map((row) => [row.sessionQuestionId, row]),
    );
    const forReport: AnswerForReport[] = answers.map((answer) => {
      const row = stored.get(answer.sessionQuestionId);
      const prompted = row?.promptedCriteria ?? [];
      // Read back rather than recomputed, for the reason the column exists: `overall` was worked out
      // against this list under whichever `SCORING_VERSION` stored it, and a report that named a
      // different set than the number was computed from would be unreadable against the transcript.
      const notAssessed = row?.notAssessedCriteria ?? [];
      return {
        position: answer.position,
        type: answer.snapshot.type,
        topic: answer.snapshot.topic,
        prompt: answer.snapshot.prompt,
        idealPoints: answer.snapshot.ideal_points,
        criteria: answer.snapshot.rubric.criteria.map((criterion) => ({
          position: criterion.position,
          dimension: criterion.dimension,
        })),
        followUpsAsked: followUpsAsked(answer.turns),
        promptedCriteria: prompted,
        notAssessedCriteria: notAssessed,
        evaluation: row?.evaluation ?? null,
        score:
          row?.evaluation && row.overall !== null && row.overallRaw !== null
            ? {
                overall: row.overall,
                overallRaw: row.overallRaw,
                promptedCriteria: prompted,
                notAssessedCriteria: notAssessed,
                scoringVersion: SCORING_VERSION,
              }
            : null,
      };
    });

    // The topics that went worst, in the order the report puts them, are the topics to study.
    const weakest = forReport
      .filter((answer) => answer.score !== null)
      .sort((a, b) => (a.score?.overall ?? 0) - (b.score?.overall ?? 0))
      .filter((answer) => (answer.score?.overall ?? 0) < EVALUATION_LIMITS.weakTopicScore)
      .map((answer) => answer.topic.id);
    const lessons = await this.repository.lessonsForTopics(
      session.careerRoleId,
      session.careerLevelId,
      [...new Set(weakest)],
    );

    const report = assembleReport({
      sessionId: session.id,
      // The pinned names, so a renamed role cannot rewrite a report the candidate has already read.
      catalogue: SessionCatalogue.parse(session.catalogue),
      answers: forReport,
      lessons,
      endedAt: session.endedAt,
      generatedAt: new Date(),
    });
    await this.repository.saveReport(session.id, report, SCORING_VERSION);
  }

  private async recordCalls(
    session: SessionToEvaluate,
    calls: readonly AiCallRecord[],
  ): Promise<void> {
    if (calls.length === 0) return;
    await this.aiCalls.record([...calls], { userId: session.userId, sessionId: session.id });
  }
}

// -------------------------------------------------------------------------------------------------

/** One answered question of a session, with its pinned content and its own turns. */
interface Answer {
  sessionQuestionId: string;
  position: number;
  snapshot: SessionQuestionSnapshot;
  turns: TurnForEvaluation[];
  alreadyStored: boolean;
}

/**
 * The answers of a session: every question the engine reached that the candidate said something to.
 *
 * A question that was asked and skipped has an interviewer turn and no candidate one, and it is not an
 * answer — there is nothing to score and nothing honest to say about it, so it is absent from the
 * report rather than present at 0. A question the session never reached has no turns at all.
 */
function answersOf(session: SessionToEvaluate): Answer[] {
  return session.questions.flatMap((row) => {
    if (row.askedAt === null) return [];
    const turns = session.turns
      .filter((turn) => turn.sessionQuestionId === row.id)
      .map((turn) => ({
        seq: turn.seq,
        speaker: turn.speaker,
        followUpIndex: turn.followUpIndex,
        text: turn.text,
      }));
    if (!turns.some((turn) => turn.speaker === "candidate")) return [];
    return [
      {
        sessionQuestionId: row.id,
        position: row.position,
        snapshot: SessionQuestionSnapshot.parse(row.snapshot),
        turns,
        alreadyStored: row.evaluation !== null,
      },
    ];
  });
}

/**
 * Who scored it, taken from the calls that were actually made rather than from configuration — the
 * same rule `interview_sessions.model_config` follows. A session scored while `LLM_MODEL_EVALUATOR`
 * was being changed should say which model answered it, and the `ai_calls` records are the only place
 * that is a fact rather than a setting.
 */
function modelOf(calls: readonly AiCallRecord[]): { provider: string; model: string } {
  const evaluator = [...calls].reverse().find((call) => call.purpose === "evaluator");
  return {
    provider: evaluator?.provider ?? "unknown",
    model: evaluator?.model ?? "unknown",
  };
}

/** Runs `task` over `items`, at most `limit` at a time. Rejections propagate once all have settled. */
async function concurrently<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
  });
  // `all`, not `allSettled`: one answer failing to store is a bug worth surfacing, and BullMQ's retry
  // is what covers a transport failure — which the caller has already turned into a flag by here.
  await Promise.all(workers);
}
