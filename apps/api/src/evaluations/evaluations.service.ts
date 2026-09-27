import { Injectable, Logger } from "@nestjs/common";
import type { EvaluationJob } from "./evaluation.processor";
import { EvaluationsRepository, type WeakTopic } from "./evaluations.repository";

/** The enqueue side of the evaluation queue. Abstract so tests can substitute a fake (ADR-0004). */
export abstract class EvaluationJobs {
  abstract enqueue(job: EvaluationJob, jobId: string): Promise<void>;
}

/**
 * Scoring is triggered by a session **ending**, and there is more than one way to end one.
 *
 * There are three doors out of an interview and a candidate cannot tell them apart:
 *
 * 1. the engine wraps up, because the question budget or the time budget ran out;
 * 2. the candidate ends early, which is the same exchange with a different reason;
 * 3. nobody comes back, and a sweep abandons it — or the candidate starts a **new** interview, which
 *    abandons the one they left (`InterviewSessionsRepository.create`).
 *
 * All four of those set `state = ended`, and all four go through here. Two rules that made themselves
 * felt while writing it:
 *
 * - **An abandoned session with answers in it is still scored.** It was tempting to score only the
 *   sessions that finished properly, and it would have been wrong: which door a session left through
 *   is invisible to the candidate, and "sometimes there is a report" is a worse product than "there is
 *   always a report for what you answered". It does mean a paid evaluation for a session somebody
 *   walked away from, which is a real cost and is recorded as one.
 * - **No answered question, no job.** A session that ended on the intro has nothing to score, and a
 *   report reading "0 of 0" would be worse than the completion screen's own empty state. The rule is
 *   `EvaluationsRepository.endedWithAnswers`, in one place, so all three doors answer alike.
 *
 * The job id is the session id, so two doors closing at once — a sweep and a final exchange racing —
 * enqueue one job rather than two. Bare, with no prefix: BullMQ refuses a custom id containing a
 * colon, which it reports as `Custom Id cannot contain :` from inside `Queue.add`.
 */
@Injectable()
export class EvaluationsService {
  private readonly logger = new Logger(EvaluationsService.name);

  constructor(
    private readonly repository: EvaluationsRepository,
    private readonly jobs: EvaluationJobs,
  ) {}

  /** Enqueues scoring for whichever of these sessions has ended with something to score. */
  async onSessionsEnded(sessionIds: readonly string[]): Promise<void> {
    const toScore = await this.repository.endedWithAnswers(sessionIds);
    for (const sessionId of toScore) {
      await this.jobs.enqueue({ sessionId }, sessionId);
    }
    if (toScore.length > 0) this.logger.log(`queued evaluation for ${toScore.length} session(s)`);
  }

  /**
   * The topics this candidate's scored answers have gone worst on, worst first.
   *
   * Two callers with two keys, which is why this hands back rows: the interviewer's context takes the
   * **names** (`InterviewCandidateContext.weak_topics` — the worker has no catalogue), and question
   * selection takes the **ids** (`SelectionInput.weakTopicIds` — it is weighting a pool it holds).
   * Both were written in M3 with a comment saying "empty until M4"; this is M4.
   */
  weakTopics(userId: string): Promise<WeakTopic[]> {
    return this.repository.weakTopics(userId);
  }
}
