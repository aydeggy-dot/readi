import { Controller, Param, Post } from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { VoiceTokenResponse } from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { z } from "zod";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthenticatedUser } from "../auth/auth.service";
import { VoiceService } from "./voice.service";

class VoiceTokenResponseDto extends createZodDto(VoiceTokenResponse) {}
class IdParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}

/**
 * The candidate's own door into voice mode (M5, ADR-0019). One route, and it issues one thing.
 *
 * It shares the `interviews` prefix with `InterviewsController` rather than living under `/voice`,
 * because it is a thing you do to *an interview* — and it is its own controller because everything
 * behind it (LiveKit, the allowance, the ledger) belongs to the voice module and nothing in the
 * interview module needs to know about any of it.
 */
@ApiTags("interviews")
@Controller("interviews")
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /**
   * A short-lived LiveKit join token, and the interviewer dispatched into the room.
   *
   * **The token authorises joining, not the interview.** It is good for
   * `VOICE_LIMITS.tokenTtlSeconds` — long enough to run the microphone check and connect, short
   * enough that one captured from a log is worthless — while the session's own `ends_at` is what ends
   * the interview, enforced by the engine.
   */
  @Post(":id/voice-token")
  @ZodSerializerDto(VoiceTokenResponseDto)
  @ApiOkResponse({ type: VoiceTokenResponseDto.Output })
  @ApiNotFoundResponse({ description: "Not this candidate's (code `interview_not_found`)" })
  @ApiForbiddenResponse({
    description:
      "`audio_processing` has not been granted at its current version " +
      "(code `voice_consent_required`)",
  })
  @ApiConflictResponse({
    description:
      "Already finished (`interview_ended`), too old to resume (`interview_expired`), started in " +
      "text mode (`voice_not_enabled`), or no voice minutes left (`voice_allowance_exhausted`)",
  })
  @ApiServiceUnavailableResponse({
    description:
      "No LiveKit here, or the interviewer could not be dispatched (`voice_unavailable`)",
  })
  token(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
  ): Promise<VoiceTokenResponse> {
    return this.voice.token(user, params.id);
  }
}
