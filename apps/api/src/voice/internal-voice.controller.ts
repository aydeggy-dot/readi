import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiExcludeController, ApiTags } from "@nestjs/swagger";
import {
  InterviewTurnPush,
  InterviewTurnPushResponse,
  VoiceLegEndedRequest,
  VoiceLegEndedResponse,
  VoiceSessionStartResponse,
} from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { z } from "zod";
import { ServiceOnly } from "../auth/auth.decorators";
import { VoiceService } from "./voice.service";

class InterviewTurnPushDto extends createZodDto(InterviewTurnPush) {}
class VoiceLegEndedRequestDto extends createZodDto(VoiceLegEndedRequest) {}
class IdParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}

/*
 * The responses are validated on the way out as well as in, which is not belt-and-braces: the worker
 * parses each of them with the generated Pydantic model and a shape it cannot read ends a leg three
 * frames down, mid-interview, in a room with a candidate in it. Failing here instead is one 500 and a
 * log line. It is the same reason `InterviewStream` validates every frame (ADR-0016).
 */
class VoiceSessionStartResponseDto extends createZodDto(VoiceSessionStartResponse) {}
class InterviewTurnPushResponseDto extends createZodDto(InterviewTurnPushResponse) {}
class VoiceLegEndedResponseDto extends createZodDto(VoiceLegEndedResponse) {}

/**
 * The LiveKit agent's three routes (ADR-0019 §3). **The second direction of authentication.**
 *
 * Until M5 the worker was only ever called. In voice there is no API request to answer — the candidate
 * stops speaking and the interviewer has to reply — so the agent drives the engine in-process and
 * pushes what happened here, carrying the same shared service token in the other direction.
 *
 * `@ServiceOnly()` is on the **class**, so a route added here cannot be reached by a candidate through
 * forgetting a decorator: the global `AuthGuard` hands these off to `ServiceTokenGuard`, which requires
 * the token on exactly the routes carrying this marker.
 *
 * ## Not in the OpenAPI document, deliberately
 *
 * The generated api-client is for the browser (ADR-0012) and would gain three routes it may never call;
 * the worker's side is generated from the Zod contracts instead (`pnpm gen:contracts`), which is the
 * cross-language boundary that matters. `content-no-answer-key.int.spec.ts` therefore exercises these
 * by hand rather than from the document, and asserts the one thing that is true of them and of nothing
 * else: the bundle route **does** carry the planned follow-ups, because that is what it is for.
 *
 * ## Why none of these is scoped to a live session
 *
 * An exchange is pushed after its audio has settled, so the push that ends a session arrives *after*
 * it ended; a leg report arrives after that again. Refusing either would throw away the close, the end
 * reason and the last answer. What guards these routes is the token, and what makes them safe to call
 * twice is `voice_exchanges` and `leg_id`.
 */
@ApiTags("internal")
@ApiExcludeController()
@ServiceOnly()
@Controller("internal/interviews")
export class InternalVoiceController {
  constructor(private readonly voice: VoiceService) {}

  /**
   * Everything the agent needs to run this leg, **pulled** rather than pushed.
   *
   * The dispatch carries the session id alone, because room metadata is readable by participants and
   * the bundle carries `planned_follow_ups`, which are answer key (ADR-0019 §4). This is the one route
   * in the API that hands part of the key to another process, and it hands over `BundleQuestion`: the
   * prompt, the context and the probes, and no rubric, criteria, weights, descriptors or ideal points.
   */
  @Get(":id/voice-session")
  @ZodSerializerDto(VoiceSessionStartResponseDto)
  startLeg(@Param() params: IdParamsDto): Promise<VoiceSessionStartResponse> {
    return this.voice.startLeg(params.id);
  }

  /** One completed exchange, persisted through the same `applyExchange` text mode uses. */
  @Post(":id/turns")
  @ZodSerializerDto(InterviewTurnPushResponseDto)
  applyTurns(
    @Param() params: IdParamsDto,
    @Body() body: InterviewTurnPushDto,
  ): Promise<InterviewTurnPushResponse> {
    return this.voice.applyTurns(params.id, body);
  }

  /** The leg is over: the bookkeeping row, and the minutes on the ledger. */
  @Post(":id/voice-ended")
  @ZodSerializerDto(VoiceLegEndedResponseDto)
  legEnded(
    @Param() params: IdParamsDto,
    @Body() body: VoiceLegEndedRequestDto,
  ): Promise<VoiceLegEndedResponse> {
    return this.voice.legEnded(params.id, body);
  }
}
