import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  VoiceLatencyQuery,
  type VoiceLatencyResponse,
  VoiceLatencyResponse as VoiceLatencyResponseSchema,
  type VoiceSessionLatencyResponse,
  VoiceSessionLatencyResponse as VoiceSessionLatencyResponseSchema,
} from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { z } from "zod";
import { Roles } from "../auth/auth.decorators";
import { VoiceService } from "./voice.service";

class VoiceLatencyQueryDto extends createZodDto(VoiceLatencyQuery) {}
class VoiceLatencyResponseDto extends createZodDto(VoiceLatencyResponseSchema) {}
class VoiceSessionLatencyResponseDto extends createZodDto(VoiceSessionLatencyResponseSchema) {}
class IdParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}

/**
 * Whether voice is meeting its latency budget (M5 phase 4, ADR-0019 §5).
 *
 * **An admin's screen, and aggregate about candidates rather than about one.** Nothing here names a
 * candidate — not an id, not an email — because the question this view answers is "is the interviewer
 * answering quickly enough?", and who was interviewed is not part of it. It is the calibration
 * dashboard's rule (ADR-0017) on a different screen, and it is cheap to hold to from the start.
 *
 * Its figures come from `voice_turn_latency`, one row per interviewer reply, written by the agent's
 * push. Phase 8 is the run that decides whether levers 3 and 4 are justified; this is the view that
 * run is read through, which is why the two targets are served beside the numbers rather than being
 * a constant the page repeats.
 */
@ApiTags("admin")
@Roles("admin")
@Controller("admin/voice")
export class VoiceAdminController {
  constructor(private readonly voice: VoiceService) {}

  /** Every voice session, newest first, keyset-paged, with the spread over this page's turns. */
  @Get("latency")
  @ZodSerializerDto(VoiceLatencyResponseDto)
  @ApiOkResponse({ type: VoiceLatencyResponseDto.Output })
  @ApiForbiddenResponse({ description: "Not an admin" })
  latency(@Query() query: VoiceLatencyQueryDto): Promise<VoiceLatencyResponse> {
    return this.voice.latency(query);
  }

  /**
   * One session, turn by turn — because a p50 that misses the target cannot say *why*.
   *
   * The stage columns are what answer that: a response time with no `phrasing_ms` and a large
   * `coverage_ms` is a different problem from one with both, and a different lever fixes it.
   */
  @Get("latency/:id")
  @ZodSerializerDto(VoiceSessionLatencyResponseDto)
  @ApiOkResponse({ type: VoiceSessionLatencyResponseDto.Output })
  @ApiNotFoundResponse({ description: "No such interview (code `interview_not_found`)" })
  @ApiForbiddenResponse({ description: "Not an admin" })
  session(@Param() params: IdParamsDto): Promise<VoiceSessionLatencyResponse> {
    return this.voice.sessionLatency(params.id);
  }
}
