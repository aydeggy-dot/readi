import { Module } from "@nestjs/common";
import { ConsentsModule } from "../consents/consents.module";
import { VoiceAllowanceService } from "./voice-allowance.service";
import { VoiceEligibilityService } from "./voice-eligibility.service";

/**
 * "May this candidate use voice, and how much of it have they left?" — and nothing else.
 *
 * Split out of `VoiceModule` so that **both** sides can import it. `VoiceModule` depends on
 * `InterviewsModule`, because voice is a transport over the interview engine; session creation
 * nevertheless has to ask the voice question before it pins anything. A module with no interview
 * dependency is how those two facts live together without a cycle.
 */
@Module({
  imports: [ConsentsModule],
  providers: [VoiceAllowanceService, VoiceEligibilityService],
  exports: [VoiceAllowanceService, VoiceEligibilityService],
})
export class VoiceAccessModule {}
