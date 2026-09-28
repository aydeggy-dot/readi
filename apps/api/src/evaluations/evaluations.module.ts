import { Module } from "@nestjs/common";
import { AiCallsModule } from "../ai-calls/ai-calls.module";
import { AiWorkerModule } from "../ai-worker/ai-worker.module";
import { ConsentsModule } from "../consents/consents.module";
import { CalibrationAdminController } from "./calibration-admin.controller";
import { CalibrationService } from "./calibration.service";
import { EvaluationSweepQueue } from "./evaluation-sweep.queue";
import { EvaluationProcessor } from "./evaluation.processor";
import { EvaluationQueue } from "./evaluation.queue";
import { EvaluationsRepository } from "./evaluations.repository";
import { EvaluationJobs, EvaluationsService } from "./evaluations.service";

/**
 * Evaluation (spec §4.4, §6.2).
 *
 * It deliberately does **not** import `InterviewsModule`, although it reads interview rows: the
 * dependency runs the other way — `InterviewsModule` imports this one to enqueue on the paths out of a
 * session — and a cycle between the two would be the beginning of the interview engine and the scorer
 * knowing about each other. What crosses from the interviews side is one pure function,
 * `evaluationRequest()` in `session-bundle.ts`, which is the fourth width and the only door the rubric
 * goes through.
 */
@Module({
  // `ConsentsModule` for the calibration sampler: nothing may be offered to a reviewer except
  // through a current `transcript_review` grant, and `ConsentsService` is where that rule lives
  // (ADR-0017).
  imports: [AiWorkerModule, AiCallsModule, ConsentsModule],
  controllers: [CalibrationAdminController],
  providers: [
    CalibrationService,
    EvaluationsService,
    EvaluationsRepository,
    EvaluationProcessor,
    EvaluationQueue,
    EvaluationSweepQueue,
    { provide: EvaluationJobs, useExisting: EvaluationQueue },
  ],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
