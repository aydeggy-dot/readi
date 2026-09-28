import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  type CalibrationAgreementResponse,
  CalibrationAgreementResponse as AgreementSchema,
  type CalibrationAnswer,
  CalibrationAnswer as AnswerSchema,
  type CalibrationFlagsResponse,
  CalibrationFlagsResponse as FlagsSchema,
  CalibrationQueueQuery,
  type CalibrationQueueResponse,
  CalibrationQueueResponse as QueueSchema,
  CalibrationScoreInput,
} from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { z } from "zod";
import { CurrentUser, Roles } from "../auth/auth.decorators";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CalibrationService } from "./calibration.service";

class CalibrationQueueQueryDto extends createZodDto(CalibrationQueueQuery) {}
class CalibrationQueueResponseDto extends createZodDto(QueueSchema) {}
class CalibrationAnswerDto extends createZodDto(AnswerSchema) {}
class CalibrationScoreInputDto extends createZodDto(CalibrationScoreInput) {}
class CalibrationScoreSavedDto extends createZodDto(z.object({ id: z.uuid() })) {}
class CalibrationAgreementResponseDto extends createZodDto(AgreementSchema) {}
class CalibrationFlagsResponseDto extends createZodDto(FlagsSchema) {}

/**
 * The calibration area (M4 phase 6, ADR-0017): a person marking an answer the model has marked.
 *
 * Mounted under `/api/admin`, which is what keeps it clear of
 * `content-no-answer-key.int.spec.ts` — that test sweeps `/api/content` and `/api/interviews`, and a
 * reviewer cannot mark an answer against a rubric they are not shown. The answer key belongs here.
 *
 * `content_expert` reviews; the agreement dashboard is an **admin's** screen, because an aggregate a
 * reviewer reads before scoring is still the model's opinion reaching them first.
 */
@ApiTags("admin-calibration")
@Roles("content_expert", "admin")
@Controller("admin/calibration")
export class CalibrationAdminController {
  constructor(private readonly calibration: CalibrationService) {}

  /** Answers this reviewer may mark, newest first. Understands `scope`, `flagged`, `role`, `cursor`. */
  @Get("queue")
  @ZodSerializerDto(CalibrationQueueResponseDto)
  @ApiOkResponse({ type: CalibrationQueueResponseDto.Output })
  queue(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CalibrationQueueQueryDto,
  ): Promise<CalibrationQueueResponse> {
    return this.calibration.queue(user, query);
  }

  /** Answers whose stored evidence reads like an instruction — a queue for a person, not a score. */
  @Get("flags")
  @ZodSerializerDto(CalibrationFlagsResponseDto)
  @ApiOkResponse({ type: CalibrationFlagsResponseDto.Output })
  flags(@Query() query: CalibrationQueueQueryDto): Promise<CalibrationFlagsResponse> {
    return this.calibration.flags(query);
  }

  /** Agreement between the people and the model, per rubric and per question. Aggregate only. */
  @Get("agreement")
  @Roles("admin")
  @ZodSerializerDto(CalibrationAgreementResponseDto)
  @ApiOkResponse({ type: CalibrationAgreementResponseDto.Output })
  agreement(): Promise<CalibrationAgreementResponse> {
    return this.calibration.agreement();
  }

  /**
   * One answer, with the pinned rubric and without the model's marks.
   *
   * **Reading this writes an audit row** (`calibration.answer.read`): consent was asked for a person
   * reading a candidate's words, so it is the read that is recorded, not the score that may follow.
   */
  @Get("answers/:id")
  @ZodSerializerDto(CalibrationAnswerDto)
  @ApiOkResponse({ type: CalibrationAnswerDto.Output })
  @ApiNotFoundResponse({ description: "No such answer, or not one this reviewer may see" })
  @ApiForbiddenResponse({ description: "Not a reviewer" })
  answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<CalibrationAnswer> {
    return this.calibration.answer(user, id);
  }

  /** This reviewer's marks. Sending again corrects them; there is one score per reviewer per answer. */
  @Post("answers/:id/score")
  @ZodSerializerDto(CalibrationScoreSavedDto)
  @ApiOkResponse({ type: CalibrationScoreSavedDto.Output })
  @ApiNotFoundResponse({ description: "No such answer, or not one this reviewer may see" })
  score(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CalibrationScoreInputDto,
  ): Promise<{ id: string }> {
    return this.calibration.score(user, id, body);
  }
}
