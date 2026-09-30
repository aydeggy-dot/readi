import { Module } from "@nestjs/common";
import { AiCallsModule } from "../ai-calls/ai-calls.module";
import { AiWorkerModule } from "../ai-worker/ai-worker.module";
import { ConsentsModule } from "../consents/consents.module";
import { EvaluationsModule } from "../evaluations/evaluations.module";
import { VoiceAccessModule } from "../voice/voice-access.module";
import { InterviewAdvanceService } from "./interview-advance.service";
import { InterviewBundleService } from "./interview-bundle.service";
import { InterviewSessionsRepository } from "./interview-sessions.repository";
import { InterviewsController } from "./interviews.controller";
import { InterviewsService } from "./interviews.service";
import { StaleSessionsQueue } from "./stale-sessions.queue";

@Module({
  // `EvaluationsModule` and not the other way round: scoring is triggered by a session ending, and a
  // cycle would be the engine and the scorer knowing about each other (see that module's note).
  // `VoiceAccessModule` and not `VoiceModule`: creating a session asks whether voice is allowed, and
  // `VoiceModule` imports this one back (see its note). The access module has no interview dependency.
  imports: [AiWorkerModule, AiCallsModule, ConsentsModule, EvaluationsModule, VoiceAccessModule],
  controllers: [InterviewsController],
  providers: [
    InterviewsService,
    InterviewAdvanceService,
    InterviewBundleService,
    InterviewSessionsRepository,
    StaleSessionsQueue,
  ],
  // M5's voice module drives the same engine over a different transport, so it needs the same three:
  // who may be asked what (`InterviewsService`), the bundle the worker gets, and the write path.
  exports: [InterviewsService, InterviewBundleService, InterviewSessionsRepository],
})
export class InterviewsModule {}
