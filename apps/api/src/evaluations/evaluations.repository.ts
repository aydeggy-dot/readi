import { Injectable } from "@nestjs/common";
import {
  AnswerEvaluation,
  EVALUATION_LIMITS,
  type RecommendedLesson,
  SCORING_VERSION,
  SessionReportResponse,
} from "@readi/shared-types";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AnswerScore } from "./scoring";

/** Everything one session's evaluation reads: the pinned questions, the transcript, and who it was. */
const toEvaluateInclude = {
  questions: { orderBy: { position: "asc" }, include: { evaluation: true } },
  turns: { orderBy: { seq: "asc" } },
} satisfies Prisma.InterviewSessionInclude;

export type SessionToEvaluate = Prisma.InterviewSessionGetPayload<{
  include: typeof toEvaluateInclude;
}>;

/** A topic this candidate's scored answers have gone badly on. */
export interface WeakTopic {
  topicId: string;
  /** The topic's current name — what a prompt is given, since a topic has no enum (ADR-0015). */
  name: string;
}

/** What one stored evaluation contributes to a report. */
export interface StoredEvaluation {
  sessionQuestionId: string;
  status: "ok" | "failed";
  evaluation: AnswerEvaluation | null;
  overall: number | null;
  overallRaw: number | null;
  promptedCriteria: number[];
}

export interface EvaluationToSave {
  sessionQuestionId: string;
  status: "ok" | "failed";
  evaluation: AnswerEvaluation | null;
  score: AnswerScore | null;
  /** The engine fact, stored whether or not there is a score to apply it to. */
  promptedCriteria: number[];
  evidenceFlags: string[];
  provider: string;
  model: string;
  promptVersions: Record<string, number>;
  attempts: number;
  failureReason: string | null;
}

@Injectable()
export class EvaluationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  session(sessionId: string): Promise<SessionToEvaluate | null> {
    return this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: toEvaluateInclude,
    });
  }

  /**
   * Of these sessions, the ones that have ended **and have something to score**.
   *
   * The one place the "no answered question, no job" rule lives, so all three doors out of a session
   * — the engine wrapping up, the candidate ending early, and the sweep abandoning one nobody came
   * back to — get the same answer. A session with no candidate turn gets no job and no report: there
   * is nothing to evaluate, and a report saying 0 out of 0 would be worse than the empty state the
   * completion screen already has.
   */
  async endedWithAnswers(sessionIds: readonly string[]): Promise<string[]> {
    if (sessionIds.length === 0) return [];
    const rows = await this.prisma.interviewSession.findMany({
      where: {
        id: { in: [...sessionIds] },
        state: "ended",
        turns: { some: { speaker: "candidate" } },
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * Writes one answer's evaluation. **The unique constraint on `session_question_id` is the
   * idempotency**: the job is retried on transport failure like any other, and a retry must not write
   * a second score for the same answer.
   */
  async save(row: EvaluationToSave): Promise<void> {
    const data = {
      status: row.status,
      criteria: row.evaluation
        ? (row.evaluation.criteria as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      coveredPoints: row.evaluation?.covered_points ?? [],
      missingPoints: row.evaluation?.missing_points ?? [],
      strengths: row.evaluation?.strengths ?? [],
      improvementTip: row.evaluation?.improvement_tip ?? null,
      redFlags: row.evaluation?.red_flags ?? [],
      confidence: row.evaluation?.confidence ?? null,
      overall: row.score?.overall ?? null,
      overallRaw: row.score?.overallRaw ?? null,
      promptedCriteria: row.promptedCriteria,
      // A `failed` row has no score, but it was still written by this version of the arithmetic, and
      // that is the useful fact about a failure too.
      scoringVersion: row.score?.scoringVersion ?? SCORING_VERSION,
      evaluatorProvider: row.provider,
      evaluatorModel: row.model,
      promptVersions: row.promptVersions,
      attempts: row.attempts,
      failureReason: row.failureReason,
      evidenceFlags: row.evidenceFlags,
    };
    await this.prisma.answerEvaluation.upsert({
      where: { sessionQuestionId: row.sessionQuestionId },
      create: { sessionQuestionId: row.sessionQuestionId, ...data },
      update: data,
    });
  }

  /** What is stored for this session, however many runs it took. */
  async stored(sessionId: string): Promise<StoredEvaluation[]> {
    const rows = await this.prisma.answerEvaluation.findMany({
      where: { sessionQuestion: { sessionId } },
      orderBy: { sessionQuestion: { position: "asc" } },
    });
    return rows.map((row) => ({
      sessionQuestionId: row.sessionQuestionId,
      status: row.status,
      // Rebuilt through the contract rather than cast: this JSON was written by an earlier release as
      // easily as by this one, and a report is not the place to discover that it has changed shape.
      evaluation:
        row.status === "ok"
          ? AnswerEvaluation.parse({
              criteria: row.criteria,
              covered_points: row.coveredPoints,
              missing_points: row.missingPoints,
              strengths: row.strengths,
              improvement_tip: row.improvementTip,
              red_flags: row.redFlags,
              confidence: row.confidence,
            })
          : null,
      overall: row.overall,
      overallRaw: row.overallRaw,
      promptedCriteria: row.promptedCriteria,
    }));
  }

  /**
   * Stores the assembled report.
   *
   * `summary` duplicates the per-answer rows deliberately, for the reason a session pins its
   * questions: this is the artefact a person actually read, and changing how reports are assembled
   * must not rewrite one somebody has already been given. Re-running the job before the candidate
   * opens it does overwrite, which is the point of the upsert — what is protected is the shape of a
   * past report against a future release, not a partial report against its own completion.
   */
  async saveReport(
    sessionId: string,
    report: SessionReportResponse,
    scoringVersion: number,
  ): Promise<void> {
    const data = {
      status: report.status,
      overall: report.overall,
      scoredAnswers: report.scored_answers,
      totalAnswers: report.total_answers,
      summary: report as unknown as Prisma.InputJsonValue,
      scoringVersion,
    };
    await this.prisma.sessionReport.upsert({
      where: { sessionId },
      create: { sessionId, ...data },
      update: data,
    });
  }

  /**
   * The stored report, if there is one this release can still read.
   *
   * `safeParse`, not `parse`: `session_reports.summary` is the artefact a candidate was given, written
   * by whichever release assembled it, and a shape that has moved since must not turn a candidate's
   * report page into a 500. `null` here means "no readable report", which the route treats exactly as
   * it treats a missing one — it re-queues, and re-assembly costs nothing because every answer already
   * has a row and is never re-scored.
   */
  async report(sessionId: string): Promise<SessionReportResponse | null> {
    const row = await this.prisma.sessionReport.findUnique({ where: { sessionId } });
    if (!row) return null;
    const parsed = SessionReportResponse.safeParse(row.summary);
    return parsed.success ? parsed.data : null;
  }

  /** Whether a report row exists at all — what `feedback_ready` on the status route reports. */
  async hasReport(sessionId: string): Promise<boolean> {
    const row = await this.prisma.sessionReport.findUnique({
      where: { sessionId },
      select: { sessionId: true },
    });
    return row !== null;
  }

  /**
   * Ended sessions that answered something and have **no report row** — oldest first, bounded.
   *
   * This is the query behind the sweep, and the reason it can be this simple is worth stating,
   * because the obvious worry about a sweep that queues evaluations is that it pays for the same
   * refusal for ever.
   *
   * It cannot. `assemble()` runs on every pass of the processor and upserts a report even when every
   * answer came back `failed`, so a session whose answers all refused has a `failed` report row and is
   * out of this query from then on. And an answer that already has an `answer_evaluations` row is
   * never re-scored, so re-queueing a session that got as far as storing answers but not its report
   * makes **no model call at all** — it re-assembles from rows that are already paid for. The only
   * session this can spend money on is one that was never evaluated, which is exactly the lost
   * enqueue it exists to recover.
   *
   * `before` keeps it off the normal path's heels: a session that ended a minute ago has a job in
   * flight, and two enqueues for one session are harmless (the job id is the session id) but a sweep
   * racing the exchange that queued it is noise in the logs nobody needs.
   */
  async endedWithoutReport(before: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.interviewSession.findMany({
      where: {
        state: "ended",
        endedAt: { lt: before },
        turns: { some: { speaker: "candidate" } },
        report: { is: null },
      },
      orderBy: { endedAt: "asc" },
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * Lessons for the topics this session went worst on (spec §4.4, "links to relevant lessons").
   *
   * `TrackTopic` has been written by `content.service.ts` since M2 and **read by nothing** until now;
   * this is the query it was for. A lesson qualifies only if it is published, its **track** is
   * published (ADR-0014: a lesson is only as published as what it hangs from), the track is the one
   * for this session's role and level, and the topic is one the track actually covers. Core topics
   * come first, because `TrackTopic.isCore` is the content expert's judgement about what matters.
   *
   * It will usually return nothing — five of eight role × level pairs have no published track — so the
   * empty state is the part of this that ships. That is not a reason to skip the query: a report that
   * cannot recommend anything should say so, not pretend the seam does not exist.
   */
  async lessonsForTopics(
    roleId: string,
    levelId: string,
    topicIds: readonly string[],
  ): Promise<RecommendedLesson[]> {
    if (topicIds.length === 0) return [];
    const track = await this.prisma.track.findFirst({
      where: { roleId, levelId, status: "published" },
      select: { id: true, topics: { where: { topicId: { in: [...topicIds] } } } },
    });
    if (!track) return [];
    const core = new Set(
      track.topics.filter((topic) => topic.isCore).map((topic) => topic.topicId),
    );
    const covered = track.topics.map((topic) => topic.topicId);
    if (covered.length === 0) return [];

    const lessons = await this.prisma.lesson.findMany({
      where: {
        status: "published",
        topicId: { in: covered },
        module: { trackId: track.id },
      },
      select: {
        slug: true,
        title: true,
        topicId: true,
        position: true,
        topic: { select: { id: true, slug: true, name: true, description: true } },
      },
      orderBy: [{ module: { position: "asc" } }, { position: "asc" }],
      take: EVALUATION_LIMITS.lessonsPerReport * 2,
    });

    return lessons
      .flatMap((lesson) => (lesson.topic ? [{ lesson, topic: lesson.topic }] : []))
      .sort((a, b) => Number(core.has(b.topic.id)) - Number(core.has(a.topic.id)))
      .slice(0, EVALUATION_LIMITS.lessonsPerReport)
      .map(({ lesson, topic }) => ({ slug: lesson.slug, title: lesson.title, topic }));
  }

  /**
   * Topics this candidate is weak on, worst first.
   *
   * **Two seams have been waiting on this since M3, and they want different keys.**
   * `InterviewCandidateContext.weak_topics` takes **labels**, because the worker has no catalogue and
   * a topic has no enum to recognise (ADR-0015); `SelectionInput.weakTopicIds` takes **ids**, because
   * question selection weights a pool it already holds by topic id. Both said "empty until M4 has
   * evaluations to derive it from", and one query answers both — which is the reason this returns rows
   * rather than strings.
   *
   * Read over the candidate's most recent scored answers rather than all of them: a topic somebody
   * was weak on a year and forty answers ago is not what this session should be steered by.
   * `weakTopicScore` is 60, which is spec §7's own line for "practised" in the readiness coverage
   * bucket — a topic that does not count as practised is exactly a topic worth naming.
   *
   * The **live** topic name, not the pinned one. A pinned name is what a past report must keep saying;
   * this is a label for a prompt about to be rendered now, and the current name is the true one.
   */
  async weakTopics(userId: string): Promise<WeakTopic[]> {
    const rows = await this.prisma.answerEvaluation.findMany({
      where: { status: "ok", sessionQuestion: { session: { userId } } },
      orderBy: { createdAt: "desc" },
      take: EVALUATION_LIMITS.weakTopicAnswers,
      select: {
        overall: true,
        sessionQuestion: {
          select: { question: { select: { topic: { select: { id: true, name: true } } } } },
        },
      },
    });

    const groups = new Map<string, { name: string; overalls: number[] }>();
    for (const row of rows) {
      if (row.overall === null) continue;
      const topic = row.sessionQuestion.question.topic;
      const group = groups.get(topic.id) ?? { name: topic.name, overalls: [] };
      group.overalls.push(row.overall);
      groups.set(topic.id, group);
    }

    return [...groups.entries()]
      .map(([topicId, group]) => ({
        topicId,
        name: group.name,
        mean: group.overalls.reduce((sum, value) => sum + value, 0) / group.overalls.length,
      }))
      .filter((topic) => topic.mean < EVALUATION_LIMITS.weakTopicScore)
      .sort((a, b) => a.mean - b.mean)
      .slice(0, EVALUATION_LIMITS.weakTopics)
      .map(({ topicId, name }) => ({ topicId, name }));
  }
}
