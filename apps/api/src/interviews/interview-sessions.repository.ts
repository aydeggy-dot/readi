import { Injectable } from "@nestjs/common";
import { INTERVIEW_LIMITS, type QuestionType } from "@readi/shared-types";
import type { Prisma } from "../generated/prisma/client";
import { stackFilter } from "../content/question-eligibility";
import { PrismaService } from "../prisma/prisma.service";
import type { SelectableQuestion } from "./question-selection";

/**
 * What a session response needs. The catalogue is **not** joined: a session names its role, level
 * and variant from its own pinned `catalogue`, so renaming a role afterwards cannot rewrite it.
 */
export const sessionInclude = {
  questions: { orderBy: { position: "asc" } },
  turns: { orderBy: { seq: "asc" } },
} satisfies Prisma.InterviewSessionInclude;

export type SessionWithContent = Prisma.InterviewSessionGetPayload<{
  include: typeof sessionInclude;
}>;

/** The list needs how far the session got, but not the transcript. */
const summaryInclude = {
  questions: { select: { askedAt: true } },
} satisfies Prisma.InterviewSessionInclude;

export type SessionSummaryRow = Prisma.InterviewSessionGetPayload<{
  include: typeof summaryInclude;
}>;

/** The full question row a snapshot is built from. */
const snapshotInclude = {
  topic: true,
  rubric: { include: { criteria: { orderBy: { position: "asc" } } } },
} satisfies Prisma.QuestionInclude;

export type QuestionRow = Prisma.QuestionGetPayload<{ include: typeof snapshotInclude }>;

export interface EligibilityFilter {
  roleId: string;
  levelId: string;
  stackId: string | null;
  types: readonly QuestionType[];
}

export interface NewSession {
  userId: string;
  careerRoleId: string;
  roleVersion: number;
  careerLevelId: string;
  levelVersion: number;
  stackId: string | null;
  stackVersion: number | null;
  types: QuestionType[];
  catalogue: Prisma.InputJsonValue;
  isDiagnostic: boolean;
  plannedMinutes: number;
  questionBudget: number;
  maxFollowUps: number;
  endsAt: Date;
  selectionSeed: string;
  questions: {
    position: number;
    questionId: string;
    questionVersion: number;
    rubricId: string;
    rubricVersion: number;
    snapshot: Prisma.InputJsonValue;
  }[];
}

@Injectable()
export class InterviewSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The questions this session may draw on: **published, with a published rubric**, offered to the
   * role and the level, and general or tagged for the candidate's variant.
   *
   * The stack half is `stackFilter` from `question-eligibility.ts`, not a second copy of the rule
   * (ADR-0015) — and it is spread rather than merged as a bare `OR`, which is exactly what the
   * comment on that function warns about.
   */
  async eligibleQuestions(filter: EligibilityFilter): Promise<SelectableQuestion[]> {
    const rows = await this.prisma.question.findMany({
      where: {
        status: "published",
        // A question is only as published as its rubric: without one, M4 cannot score the answer.
        rubric: { status: "published" },
        roles: { some: { roleId: filter.roleId } },
        levels: { some: { levelId: filter.levelId } },
        type: { in: [...filter.types] },
        ...stackFilter(filter.stackId),
      },
      select: { id: true, topicId: true, type: true, difficulty: true },
      orderBy: { slug: "asc" },
    });
    return rows.map((row) => ({
      questionId: row.id,
      topicId: row.topicId,
      type: row.type,
      difficulty: row.difficulty,
      lastSeenAt: null,
      seenRecently: false,
    }));
  }

  /**
   * What this candidate has already been asked, folded into the pool.
   *
   * "Seen" means **asked**, not merely selected: a session abandoned after one question pinned
   * four, and the three nobody read are not spent. Bounded to the last
   * `INTERVIEW_LIMITS.historySessions` sessions — beyond that a question sorts as never-seen,
   * which is where the least-recently-seen fallback would put it anyway.
   */
  async withHistory(userId: string, pool: SelectableQuestion[]): Promise<SelectableQuestion[]> {
    const sessions = await this.prisma.interviewSession.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: INTERVIEW_LIMITS.historySessions,
      select: { id: true },
    });
    if (sessions.length === 0) return pool;
    const recentIds = new Set(
      sessions.slice(0, INTERVIEW_LIMITS.recentSessionsExcluded).map((session) => session.id),
    );
    const asked = await this.prisma.interviewSessionQuestion.findMany({
      where: { sessionId: { in: sessions.map((session) => session.id) }, askedAt: { not: null } },
      select: { sessionId: true, questionId: true, askedAt: true },
    });

    const lastSeen = new Map<string, Date>();
    const recent = new Set<string>();
    for (const row of asked) {
      if (!row.askedAt) continue;
      const previous = lastSeen.get(row.questionId);
      if (!previous || previous < row.askedAt) lastSeen.set(row.questionId, row.askedAt);
      if (recentIds.has(row.sessionId)) recent.add(row.questionId);
    }
    return pool.map((question) => ({
      ...question,
      lastSeenAt: lastSeen.get(question.questionId) ?? null,
      seenRecently: recent.has(question.questionId),
    }));
  }

  /** The chosen questions in full, for pinning. Returned in the order asked for. */
  async questionsToPin(ids: readonly string[]): Promise<QuestionRow[]> {
    const rows = await this.prisma.question.findMany({
      where: { id: { in: [...ids] } },
      include: snapshotInclude,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }

  /**
   * Creates the session and its pinned questions in one transaction, and ends any other session
   * this candidate had running.
   *
   * One live interview per candidate: the setup screen is a deliberate act, and the Practice list
   * offers "resume" for a session still in progress, so arriving here means they chose a new one.
   * Abandoning the old one rather than refusing the new one keeps a stuck session from becoming a
   * dead end — the alternative is a candidate who cannot start an interview until a sweep runs.
   */
  async create(session: NewSession): Promise<SessionWithContent> {
    const { questions, ...fields } = session;
    return this.prisma.$transaction(async (tx) => {
      await tx.interviewSession.updateMany({
        where: { userId: session.userId, status: "in_progress" },
        data: { status: "abandoned", state: "ended", endedAt: new Date() },
      });
      return tx.interviewSession.create({
        data: {
          ...fields,
          promptVersions: {},
          modelConfig: {},
          questions: { create: questions },
        },
        include: sessionInclude,
      });
    });
  }

  findForUser(id: string, userId: string): Promise<SessionWithContent | null> {
    return this.prisma.interviewSession.findFirst({
      where: { id, userId },
      include: sessionInclude,
    });
  }

  list(userId: string, where: Prisma.InterviewSessionWhereInput | undefined, take: number) {
    return this.prisma.interviewSession.findMany({
      where: { userId, ...where },
      include: summaryInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take,
    });
  }

  /**
   * Ends sessions nobody came back to. A sweep over the database rather than a job per session, for
   * the reason `AccountErasureQueue` gives: the database stays the only record of what is due, a
   * failed sweep is retried by the next one, and a session that finished needs no job removed.
   */
  async abandonStale(now: Date): Promise<number> {
    const deadline = new Date(now.getTime() - INTERVIEW_LIMITS.resumeGraceMinutes * 60 * 1_000);
    const result = await this.prisma.interviewSession.updateMany({
      where: { status: "in_progress", endsAt: { lt: deadline } },
      data: { status: "abandoned", state: "ended", endedAt: now },
    });
    return result.count;
  }
}
