import { Module } from "@nestjs/common";
import { AiCallsModule } from "../ai-calls/ai-calls.module";
import { AiWorkerModule } from "../ai-worker/ai-worker.module";
import { InterviewAdvanceService } from "./interview-advance.service";
import { InterviewSessionsRepository } from "./interview-sessions.repository";
import { InterviewsController } from "./interviews.controller";
import { InterviewsService } from "./interviews.service";
import { StaleSessionsQueue } from "./stale-sessions.queue";

@Module({
  imports: [AiWorkerModule, AiCallsModule],
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
