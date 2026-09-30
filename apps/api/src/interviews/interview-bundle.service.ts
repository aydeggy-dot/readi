import { Injectable } from "@nestjs/common";
import {
  type InterviewCandidateContext,
  type InterviewSessionBundle,
  SessionCatalogue,
  SessionQuestionSnapshot,
} from "@readi/shared-types";
import { ConsentsService } from "../consents/consents.service";
import { EvaluationsService } from "../evaluations/evaluations.service";
import type { SessionWithContent } from "./interview-sessions.repository";
import { sessionBundle } from "./session-bundle";

/**
 * What the worker is given for one session — and the reason it is its own provider.
 *
 * It was a private method on `InterviewAdvanceService` until M5. Voice needs the identical bundle,
 * pulled over the service-token channel rather than sent with an exchange (ADR-0019 §4), and a second
 * copy of this assembly is exactly the mistake `review-doc.ts` made in M3: two call sites that agree
 * today and drift on the next change to what the interviewer may know. One implementation, two doors.
 *
 * The rubric is not in it — `bundleQuestion` is the only way out of a snapshot and it does not carry
 * one (CLAUDE.md §5) — and the candidate is described in the catalogue's own **names**, as the session
 * recorded them, so a role renamed afterwards cannot change how the interviewer addressed them.
 */
@Injectable()
export class InterviewBundleService {
  constructor(
    private readonly consents: ConsentsService,
    private readonly evaluations: EvaluationsService,
  ) {}

  /**
   * The one consent decision the bundle carries is `transcript_review`, which the intro speaks aloud
   * when it has been granted (ADR-0017). It is read here rather than pinned on the session: the intro
   * is spoken once and `session_turns` already holds the words, so the transcript is the record of
   * what was claimed, and a bundle resent after a Redis miss cannot re-speak an intro either way.
   */
  async bundleFor(session: SessionWithContent): Promise<InterviewSessionBundle> {
    const catalogue = SessionCatalogue.parse(session.catalogue);
    const candidate: InterviewCandidateContext = {
      role_label: catalogue.role.name,
      level_label: catalogue.level.name,
      stack_label: catalogue.stack?.name ?? null,
      /*
       * Real from M4: the topics this candidate's scored answers have gone worst on, worst first, as
       * labels (ADR-0015 — a topic has no enum, so it is its name). A candidate's **first** interview
       * still sends an empty list, which is correct and is what the prompt is written for.
       */
      weak_topics: (await this.evaluations.weakTopics(session.userId)).map((topic) => topic.name),
    };
    return sessionBundle(
      {
        id: session.id,
        userId: session.userId,
        mode: session.mode,
        persona: session.persona,
        isDiagnostic: session.isDiagnostic,
        plannedMinutes: session.plannedMinutes,
        endsAt: session.endsAt,
        questionBudget: session.questionBudget,
        maxFollowUps: session.maxFollowUps,
        transcriptReviewGranted: await this.consents.hasGranted(
          session.userId,
          "transcript_review",
        ),
      },
      session.questions.map((row) => SessionQuestionSnapshot.parse(row.snapshot)),
      candidate,
    );
  }
}
