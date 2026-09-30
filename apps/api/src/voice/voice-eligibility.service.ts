import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { ConsentsService } from "../consents/consents.service";
import { ApiError } from "../http/api-error";
import { VoiceAllowanceService } from "./voice-allowance.service";

/**
 * May this candidate use voice at all? Asked twice, from two places, with one implementation.
 *
 * **Session creation** asks it before a single question is pinned, because a session pinned as `voice`
 * that can never be joined has spent four questions of this candidate's bank on nothing — and those
 * questions then count as "seen" for the next twenty sessions (`withHistory`). **The join token** asks
 * it again, because a session created an hour ago may have spent its allowance since.
 *
 * It is its own provider in its own module for a structural reason rather than a tidy one: `VoiceModule`
 * imports `InterviewsModule` (voice is a transport over the interview engine, so it knows about
 * interviews and an interview knows nothing about rooms), so session creation cannot inject
 * `VoiceService` without a cycle. This has no interview dependency at all, so both sides may import it.
 */
@Injectable()
export class VoiceEligibilityService {
  constructor(
    private readonly consents: ConsentsService,
    private readonly allowance: VoiceAllowanceService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * `notConfigured` is the difference between the two callers, and it is the difference between a
   * refusal a candidate can act on and one they cannot. Asking to *start* a voice interview on a
   * text-only deployment is `voice_not_enabled` — a 409, and the setup screen offers text. Asking for a
   * *token* on a session that is already `voice` when the deployment cannot serve one is
   * `voice_unavailable` — a 503, because something is wrong here rather than with their request.
   */
  async assert(
    userId: string,
    notConfigured: "voice_not_enabled" | "voice_unavailable",
  ): Promise<void> {
    if (!this.env.VOICE_ENABLED) {
      throw new ApiError(
        notConfigured === "voice_not_enabled"
          ? HttpStatus.CONFLICT
          : HttpStatus.SERVICE_UNAVAILABLE,
        notConfigured,
        "voice interviews are not available on this deployment",
      );
    }
    /*
     * The one consent that is a precondition rather than a preference. Read through
     * `ConsentsService.hasGranted`, whose rule is `isCurrentGrant` and is written once — a caller that
     * restated it would eventually accept a decision made against wording the candidate never saw, and
     * `audio_processing` went to v2 in this very phase (CLAUDE.md "Data & privacy").
     */
    if (!(await this.consents.hasGranted(userId, "audio_processing"))) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "voice_consent_required",
        "voice interviews need consent to process speech",
      );
    }
    const allowance = await this.allowance.forUser(userId);
    if (allowance.remainingSeconds <= 0) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "voice_allowance_exhausted",
        "no voice minutes left in this period",
      );
    }
  }
}
