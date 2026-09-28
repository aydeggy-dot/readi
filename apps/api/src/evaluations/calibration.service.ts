import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  CALIBRATION_LIMITS,
  type CalibrationAgreementResponse,
  type CalibrationAgreementRow,
  type CalibrationAnswer,
  type CalibrationCriterionScore,
  type CalibrationFlagsResponse,
  type CalibrationQueueQuery,
  type CalibrationQueueResponse,
  type CalibrationScoreInput,
  type CriterionScore,
  MAX_CRITERION_SCORE,
  SessionCatalogue,
  SessionQuestionSnapshot,
} from "@readi/shared-types";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { ConsentsService } from "../consents/consents.service";
import { cursorWhere, paginate } from "../content/content-cursor";
import { ApiError } from "../http/api-error";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { agreement, pairByCriterion, type ScorePair } from "./calibration-agreement";

/**
 * Calibration: a person scoring an answer the model has already scored (M4 phase 6, ADR-0017).
 *
 * Four rules live here, and each of them is the kind that fails silently if it is restated anywhere
 * else:
 *
 * 1. **Nothing is sampled except through a current `transcript_review` grant.** The set comes from
 *    `ConsentsService.usersGranting`, which is `isCurrentGrant` written once (CLAUDE.md "Data &
 *    privacy"): a caller that rebuilt the predicate would show one candidate's words to someone who
 *    was told no, and would look correct doing it.
 * 2. **While `CALIBRATION_ALLOW_CANDIDATE_TRANSCRIPTS` is off, only staff answers are offered.** That
 *    is the owner's gate on going live before the reviewer agreement is signed, in code rather than in
 *    a convention. Consent is still required of staff, so what is demonstrated is the real path.
 * 3. **A reviewer is never shown the model's marks.** Not in the queue, not on the answer. Agreement
 *    between a person and a model measures nothing if the person saw the model's answer first, and the
 *    shape they get (`CalibrationAnswer`) is separate from `AnswerEvaluation` rather than derived from
 *    it, so a field cannot come back the next time the parent grows.
 * 4. **Reading an answer is an audited event.** Not scoring it — *reading* it. Consent was asked for a
 *    person reading a candidate's words, so the row is written when that happens, whether or not a
 *    score follows.
 */
@Injectable()
export class CalibrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentsService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * The answers this reviewer may look at, newest edit first.
   *
   * `empty_because` exists because the four reasons a queue is empty are indistinguishable from an
   * empty list and lead to four different actions — wait, ask for consent, flip a flag, or use
   * another account. A screen that just says "nothing here" sends somebody to read this code.
   */
  async queue(
    reviewer: AuthenticatedUser,
    query: CalibrationQueueQuery,
  ): Promise<CalibrationQueueResponse> {
    const eligible = await this.eligibleAuthors();
    if (eligible.ids.length === 0) {
      return { items: [], next_cursor: null, empty_because: await this.whyEmpty(reviewer) };
    }
    const rows = await this.prisma.answerEvaluation.findMany({
      where: {
        AND: [
          cursorWhere(query.cursor) ?? {},
          { status: "ok" },
          // Nothing to compare a person with. A failed answer has no reading, and a reviewer scoring
          // one would produce a score with no counterpart in the dashboard. `DbNull` is the SQL NULL
          // in that column, which is what a failed evaluation leaves — not a JSON `null`.
          { NOT: { criteria: { equals: Prisma.DbNull } } },
          query.flagged === undefined
            ? {}
            : query.flagged
              ? { NOT: { evidenceFlags: { isEmpty: true } } }
              : { evidenceFlags: { isEmpty: true } },
          query.scope === "mine"
            ? { calibrationScores: { some: { expertUserId: reviewer.id } } }
            : {},
          query.scope === "unreviewed"
            ? { calibrationScores: { none: { expertUserId: reviewer.id } } }
            : {},
          {
            sessionQuestion: {
              session: {
                // Their own answer is not theirs to mark: they would agree with themselves, and the
                // dashboard would read that as the evaluator being right.
                userId: { in: eligible.ids, not: reviewer.id },
                ...(query.role ? { careerRole: { slug: query.role } } : {}),
              },
            },
          },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: {
        _count: { select: { calibrationScores: true } },
        calibrationScores: { where: { expertUserId: reviewer.id }, select: { id: true } },
        sessionQuestion: {
          select: { snapshot: true, session: { select: { catalogue: true } } },
        },
      },
    });
    const page = paginate(rows, query.limit);
    const items = page.items.flatMap((row) => {
      const snapshot = SessionQuestionSnapshot.safeParse(row.sessionQuestion.snapshot);
      if (!snapshot.success) return [];
      const catalogue = SessionCatalogue.safeParse(row.sessionQuestion.session.catalogue);
      return [
        {
          id: row.id,
          question_slug: snapshot.data.slug,
          rubric_name: snapshot.data.rubric.name,
          role: catalogue.success ? catalogue.data.role.name : null,
          level: catalogue.success ? catalogue.data.level.name : null,
          criterion_count: snapshot.data.rubric.criteria.length,
          review_count: row._count.calibrationScores,
          reviewed_by_me: row.calibrationScores.length > 0,
          flagged: row.evidenceFlags.length > 0,
          answered_at: row.createdAt.toISOString(),
        },
      ];
    });
    return {
      items,
      next_cursor: page.next_cursor,
      empty_because:
        items.length === 0 && !page.next_cursor && !query.cursor
          ? await this.whyEmpty(reviewer)
          : null,
    };
  }

  /**
   * Why this reviewer's queue is empty, asked of the answers themselves rather than of the database.
   *
   * The first version of this read "has anybody consented?", which is true of the whole database and
   * therefore stops being useful the moment one person anywhere has — it answered
   * `nothing_to_review` in a database with a consenting candidate and a closed gate, which is the one
   * case the screen most needs to explain. So the question is asked in the order the filters apply,
   * and only when the page came back empty: three counts, none of them on the hot path.
   */
  private async whyEmpty(
    reviewer: AuthenticatedUser,
  ): Promise<CalibrationQueueResponse["empty_because"]> {
    const scored = {
      status: "ok" as const,
      NOT: { criteria: { equals: Prisma.DbNull } },
      sessionQuestion: { session: { userId: { not: reviewer.id } } },
    };
    if ((await this.prisma.answerEvaluation.count({ where: scored })) === 0) {
      return "nothing_to_review";
    }
    const consented = await this.consents.usersGranting("transcript_review");
    const fromConsenting = await this.prisma.answerEvaluation.count({
      where: {
        ...scored,
        sessionQuestion: { session: { userId: { in: consented, not: reviewer.id } } },
      },
    });
    if (fromConsenting === 0) return "no_consent";
    // Somebody consented and there is an answer, so what is left is the owner's gate.
    return this.env.CALIBRATION_ALLOW_CANDIDATE_TRANSCRIPTS
      ? "nothing_to_review"
      : "staff_answers_only";
  }

  /**
   * One answer, as a reviewer sees it — and the audit row that says they saw it.
   *
   * The eligibility check is repeated here rather than trusted from the queue: a reviewer may hold a
   * link, and consent can be withdrawn between listing and opening. The audit row is written **after**
   * the checks, so a refused read is not recorded as a read.
   */
  async answer(reviewer: AuthenticatedUser, id: string): Promise<CalibrationAnswer> {
    const eligible = await this.eligibleAuthors();
    const row = await this.prisma.answerEvaluation.findFirst({
      where: {
        id,
        status: "ok",
        sessionQuestion: { session: { userId: { in: eligible.ids, not: reviewer.id } } },
      },
      include: {
        calibrationScores: { where: { expertUserId: reviewer.id } },
        sessionQuestion: {
          select: {
            id: true,
            snapshot: true,
            session: {
              select: {
                catalogue: true,
                turns: {
                  where: { text: { not: "" } },
                  orderBy: { seq: "asc" },
                  select: {
                    seq: true,
                    speaker: true,
                    followUpIndex: true,
                    text: true,
                    sessionQuestionId: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    // The same answer for "no such row", "that candidate has withdrawn consent" and "that one is
    // yours": which it is would tell a reviewer something about a person they may not look at.
    if (!row) {
      throw new ApiError(HttpStatus.NOT_FOUND, "calibration_answer_not_found", "no such answer");
    }
    const snapshot = SessionQuestionSnapshot.parse(row.sessionQuestion.snapshot);
    const catalogue = SessionCatalogue.safeParse(row.sessionQuestion.session.catalogue);
    const exchange = row.sessionQuestion.session.turns
      .filter((turn) => turn.sessionQuestionId === row.sessionQuestion.id)
      .map((turn) => ({
        seq: turn.seq,
        speaker: turn.speaker,
        follow_up_index: turn.followUpIndex,
        text: turn.text,
      }));

    await this.audit.record({
      actorType: "admin",
      actorId: reviewer.id,
      action: "calibration.answer.read",
      targetType: "answer_evaluation",
      targetId: row.id,
      // Ids and enum values only: audit rows outlive account deletion (ADR-0011), so not one word of
      // what was read goes in here.
      after: { question_slug: snapshot.slug, criteria: snapshot.rubric.criteria.length },
    });

    return {
      id: row.id,
      question_slug: snapshot.slug,
      question_prompt: snapshot.prompt,
      question_context: snapshot.context ?? null,
      role: catalogue.success ? catalogue.data.role.name : null,
      level: catalogue.success ? catalogue.data.level.name : null,
      rubric_slug: snapshot.rubric.slug,
      rubric_name: snapshot.rubric.name,
      criteria: snapshot.rubric.criteria.map((criterion) => ({
        position: criterion.position,
        dimension: criterion.dimension,
        description: criterion.description,
        weight: criterion.weight,
        levels: criterion.levels,
      })),
      exchange,
      evidence_flags: row.evidenceFlags,
      my_score: row.calibrationScores[0]
        ? {
            criteria: row.calibrationScores[0].criteria as CalibrationCriterionScore[],
            note: row.calibrationScores[0].note,
            created_at: row.calibrationScores[0].createdAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Store this reviewer's reading of one answer.
   *
   * The criteria are checked against the **pinned** rubric, the same rule the evaluator's own readings
   * are held to and for the same reason: a score over a different set of criteria cannot be compared
   * with anything. One score per reviewer per answer, so submitting again is a correction rather than
   * a second opinion — which is what the unique constraint already said.
   */
  async score(
    reviewer: AuthenticatedUser,
    id: string,
    input: CalibrationScoreInput,
  ): Promise<{ id: string }> {
    const eligible = await this.eligibleAuthors();
    const row = await this.prisma.answerEvaluation.findFirst({
      where: {
        id,
        status: "ok",
        sessionQuestion: { session: { userId: { in: eligible.ids, not: reviewer.id } } },
      },
      select: { id: true, sessionQuestion: { select: { snapshot: true } } },
    });
    if (!row) {
      throw new ApiError(HttpStatus.NOT_FOUND, "calibration_answer_not_found", "no such answer");
    }
    const snapshot = SessionQuestionSnapshot.parse(row.sessionQuestion.snapshot);
    const expected = snapshot.rubric.criteria.map((criterion) => criterion.position);
    const given = input.criteria.map((entry) => entry.criterion);
    const missing = expected.filter((position) => !given.includes(position));
    const invented = given.filter((position) => !expected.includes(position));
    if (missing.length > 0 || invented.length > 0 || given.length !== new Set(given).size) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "calibration_criteria_mismatch",
        "one score per criterion of the pinned rubric",
        { expected: expected.length, given: given.length },
      );
    }
    const criteria: CalibrationCriterionScore[] = input.criteria
      .slice()
      .sort((left, right) => left.criterion - right.criterion)
      .map((entry) => ({
        criterion: entry.criterion,
        score: entry.score,
        max_score: MAX_CRITERION_SCORE,
        evidence: entry.evidence,
        // Null, never "": a reviewer who wrote no reason wrote no reason, and `CriterionScore` would
        // have made us invent a sentence for them to satisfy its own non-empty rule.
        reasoning: entry.reasoning,
      }));

    const saved = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.calibrationScore.upsert({
        where: {
          answerEvaluationId_expertUserId: {
            answerEvaluationId: row.id,
            expertUserId: reviewer.id,
          },
        },
        create: {
          answerEvaluationId: row.id,
          expertUserId: reviewer.id,
          criteria,
          note: input.note,
        },
        update: { criteria, note: input.note },
      });
      await this.audit.record(
        {
          actorType: "admin",
          actorId: reviewer.id,
          action: "calibration.answer.scored",
          targetType: "answer_evaluation",
          targetId: row.id,
          after: { criteria: criteria.length, has_note: input.note !== null },
        },
        tx,
      );
      return stored;
    });
    return { id: saved.id };
  }

  /**
   * How closely the people and the model agree, per rubric and per question.
   *
   * **Aggregate only, and never per answer.** A row that named one answer's model score would undo
   * the blindness for every reviewer who has not scored it yet, so this returns rubrics and questions
   * and nothing narrower. That is also why it is an admin's screen rather than a reviewer's.
   */
  async agreement(): Promise<CalibrationAgreementResponse> {
    const rows = await this.prisma.calibrationScore.findMany({
      include: {
        answerEvaluation: {
          select: {
            id: true,
            criteria: true,
            sessionQuestion: { select: { snapshot: true } },
          },
        },
      },
    });
    const all: ScorePair[] = [];
    const byRubric = new Map<string, Bucket>();
    const byQuestion = new Map<string, Bucket>();
    const answers = new Set<string>();
    const reviewers = new Set<string>();

    for (const row of rows) {
      const model = row.answerEvaluation.criteria as CriterionScore[] | null;
      if (!model) continue;
      const snapshot = SessionQuestionSnapshot.safeParse(
        row.answerEvaluation.sessionQuestion.snapshot,
      );
      if (!snapshot.success) continue;
      const pairs = pairByCriterion(model, row.criteria as CalibrationCriterionScore[]);
      if (pairs.length === 0) continue;
      all.push(...pairs);
      answers.add(row.answerEvaluationId);
      reviewers.add(row.expertUserId);
      bucket(byRubric, snapshot.data.rubric.slug, snapshot.data.rubric.name).add(
        pairs,
        row.answerEvaluationId,
        row.expertUserId,
      );
      bucket(byQuestion, snapshot.data.slug, snapshot.data.prompt.slice(0, 120)).add(
        pairs,
        row.answerEvaluationId,
        row.expertUserId,
      );
    }
    return {
      overall: agreement(all),
      by_rubric: toRows(byRubric),
      by_question: toRows(byQuestion),
      scored_answers: answers.size,
      reviewers: reviewers.size,
    };
  }

  /**
   * Answers whose stored evidence matched a phrase that reads like an instruction — the list M4 phase
   * 3 said this area would draw.
   *
   * It changes no score and reaches no candidate: a flag is a reason for a person to look. The phrases
   * are **ours**, not the candidate's words, which is what makes them safe to list here.
   */
  async flags(query: CalibrationQueueQuery): Promise<CalibrationFlagsResponse> {
    const eligible = await this.eligibleAuthors();
    const rows = await this.prisma.answerEvaluation.findMany({
      where: {
        AND: [
          cursorWhere(query.cursor) ?? {},
          { status: "ok" },
          { NOT: { evidenceFlags: { isEmpty: true } } },
          { sessionQuestion: { session: { userId: { in: eligible.ids } } } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: { sessionQuestion: { select: { snapshot: true } } },
    });
    const page = paginate(rows, query.limit);
    const counts = new Map<string, number>();
    const items = page.items.flatMap((row) => {
      const snapshot = SessionQuestionSnapshot.safeParse(row.sessionQuestion.snapshot);
      if (!snapshot.success) return [];
      for (const flag of new Set(row.evidenceFlags)) {
        counts.set(flag, (counts.get(flag) ?? 0) + 1);
      }
      return [
        {
          id: row.id,
          question_slug: snapshot.data.slug,
          flags: row.evidenceFlags,
          answered_at: row.createdAt.toISOString(),
        },
      ];
    });
    return {
      items,
      next_cursor: page.next_cursor,
      phrases: [...counts.entries()]
        .map(([phrase, answers]) => ({ phrase, answers }))
        .sort(
          (left, right) => right.answers - left.answers || left.phrase.localeCompare(right.phrase),
        ),
    };
  }

  /**
   * Whose answers may be shown at all: the current `transcript_review` grants, narrowed to staff while
   * the owner's gate is closed.
   *
   * Both halves are here, in one place, because they are one question. The order matters for the
   * reason the screen gives: "nobody has consented" and "the gate is closed" are different problems.
   */
  private async eligibleAuthors(): Promise<{ ids: string[] }> {
    const consented = await this.consents.usersGranting("transcript_review");
    if (consented.length === 0 || this.env.CALIBRATION_ALLOW_CANDIDATE_TRANSCRIPTS) {
      return { ids: consented };
    }
    const staff = await this.prisma.user.findMany({
      where: { id: { in: consented }, role: { in: ["admin", "content_expert"] } },
      select: { id: true },
    });
    return { ids: staff.map((row) => row.id) };
  }
}

/** One row of the dashboard, accumulating. */
class Bucket {
  readonly pairs: ScorePair[] = [];
  readonly answers = new Set<string>();
  readonly reviewers = new Set<string>();
  constructor(readonly name: string) {}

  add(pairs: readonly ScorePair[], answerId: string, reviewerId: string): void {
    this.pairs.push(...pairs);
    this.answers.add(answerId);
    this.reviewers.add(reviewerId);
  }
}

function bucket(map: Map<string, Bucket>, key: string, name: string): Bucket {
  const found = map.get(key);
  if (found) return found;
  const created = new Bucket(name);
  map.set(key, created);
  return created;
}

/** Thinnest evidence last: a row over four answers is an anecdote and should not head the table. */
function toRows(map: Map<string, Bucket>): CalibrationAgreementRow[] {
  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      name: value.name,
      answers: value.answers.size,
      reviewers: value.reviewers.size,
      agreement: agreement(value.pairs),
    }))
    .sort(
      (left, right) =>
        Number(right.answers >= CALIBRATION_LIMITS.thinEvidenceAnswers) -
          Number(left.answers >= CALIBRATION_LIMITS.thinEvidenceAnswers) ||
        left.agreement.exact - right.agreement.exact,
    );
}
