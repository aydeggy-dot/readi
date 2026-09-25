import { Module } from "@nestjs/common";
import { InterviewSessionsRepository } from "./interview-sessions.repository";
import { InterviewsController } from "./interviews.controller";
import { InterviewsService } from "./interviews.service";
import { StaleSessionsQueue } from "./stale-sessions.queue";

@Module({
  controllers: [InterviewsController],
  providers: [InterviewsService, InterviewSessionsRepository, StaleSessionsQueue],
  exports: [InterviewsService],
})
export class InterviewsModule {}
