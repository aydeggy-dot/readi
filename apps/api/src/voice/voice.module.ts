import { HttpStatus, Module } from "@nestjs/common";
import { AiCallsModule } from "../ai-calls/ai-calls.module";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { EvaluationsModule } from "../evaluations/evaluations.module";
import { ApiError } from "../http/api-error";
import { InterviewsModule } from "../interviews/interviews.module";
import { InternalVoiceController } from "./internal-voice.controller";
import { LiveKitRoom } from "./livekit-room";
import { VoiceAccessModule } from "./voice-access.module";
import { VoiceAdminController } from "./voice-admin.controller";
import { VoiceController } from "./voice.controller";
import { VoiceService } from "./voice.service";
import { VOICE_ROOM, type VoiceRoom } from "./voice-room";

/**
 * Voice mode's API half (M5 phase 4, ADR-0019): the candidate's join token, the agent's three internal
 * routes, the allowance and its ledger, and the admin latency view.
 *
 * It depends on `InterviewsModule` and not the other way round, for the reason `EvaluationsModule`
 * gives: voice is a transport over the interview engine, so it knows about interviews and an interview
 * knows nothing about rooms. The one line that crosses back — session creation asking "may this
 * candidate start a voice session?" — goes through `VoiceAccessModule`, which has no interview
 * dependency and is therefore importable from both sides without a cycle.
 */
@Module({
  imports: [InterviewsModule, VoiceAccessModule, EvaluationsModule, AiCallsModule],
  controllers: [VoiceController, InternalVoiceController, VoiceAdminController],
  providers: [
    VoiceService,
    {
      provide: VOICE_ROOM,
      inject: [ENV],
      useFactory: (env: Env): VoiceRoom =>
        env.VOICE_ENABLED && env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET
          ? new LiveKitRoom({
              url: env.LIVEKIT_URL,
              apiKey: env.LIVEKIT_API_KEY,
              apiSecret: env.LIVEKIT_API_SECRET,
              agentName: env.VOICE_AGENT_NAME,
            })
          : voiceIsOff(),
    },
  ],
  exports: [VoiceService],
})
export class VoiceModule {}

/**
 * The provider a text-only deployment gets.
 *
 * A refusal rather than a missing provider, because a missing provider is a boot failure and voice
 * being off is not a broken deployment — it is every deployment before this milestone. Nothing should
 * reach it: `VOICE_ENABLED=false` refuses a voice session at creation, so there is no voice session to
 * ask for a token for. It exists for the case where that is wrong, and it answers with the code the web
 * app already has copy for rather than with a 500.
 */
function voiceIsOff(): VoiceRoom {
  // A rejected promise rather than a synchronous throw, because the interface returns promises and a
  // caller that only ever `await`s should not have to care which kind of failure it got.
  const refuse = (): Promise<never> =>
    Promise.reject(
      new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "voice_unavailable",
        "voice is not configured on this deployment",
      ),
    );
  return { join: refuse, dispatch: refuse };
}
