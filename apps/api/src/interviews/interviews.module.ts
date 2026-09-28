import { Module } from "@nestjs/common";
import { AiCallsModule } from "../ai-calls/ai-calls.module";
import { AiWorkerModule } from "../ai-worker/ai-worker.module";
import { ConsentsModule } from "../consents/consents.module";
import { EvaluationsModule } from "../evaluations/evaluations.module";
import { InterviewAdvanceService } from "./interview-advance.service";
import { InterviewSessionsRepository } from "./interview-sessions.repository";
import { InterviewsController } from "./interviews.controller";
import { InterviewsService } from "./interviews.service";
import { StaleSessionsQueue } from "./stale-sessions.queue";

@Module({
  // `EvaluationsModule` and not the other way round: scoring is triggered by a session ending, and a
  // cycle would be the engine and the scorer knowing about each other (see that module's note).
  imports: [AiWorkerModule, AiCallsModule, ConsentsModule, EvaluationsModule],
  controllers: [InterviewsController],
  providers: [
    InterviewsService,
    InterviewAdvanceService,
    InterviewSessionsRepository,
    StaleSessionsQueue,
  ],
  exports: [InterviewsService],
})
export class InterviewsModule {}
