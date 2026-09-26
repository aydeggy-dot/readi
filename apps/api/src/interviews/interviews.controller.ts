import { Body, Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
} from "@nestjs/swagger";
import {
  AdvanceInterviewRequest,
  CreateInterviewRequest,
  InterviewListQuery,
  InterviewListResponse,
  InterviewSessionResponse,
  InterviewStatusResponse,
} from "@readi/shared-types";
import type { Response } from "express";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { z } from "zod";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthenticatedUser } from "../auth/auth.service";
import { InterviewAdvanceService } from "./interview-advance.service";
import { InterviewStream } from "./interview-sse";
import { InterviewsService } from "./interviews.service";

class CreateInterviewRequestDto extends createZodDto(CreateInterviewRequest) {}
class InterviewListQueryDto extends createZodDto(InterviewListQuery) {}
class InterviewListResponseDto extends createZodDto(InterviewListResponse) {}
class InterviewSessionResponseDto extends createZodDto(InterviewSessionResponse) {}
class AdvanceInterviewRequestDto extends createZodDto(AdvanceInterviewRequest) {}
class InterviewStatusResponseDto extends createZodDto(InterviewStatusResponse) {}
class IdParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}

/**
 * A candidate's own interviews. Every route is scoped to the signed-in user — `findForUser` takes
 * the id and the user id together, so another candidate's session is a 404 rather than a 403, and
 * there is no route here that can read a session the caller does not own.
 *
 * Everything served is a `Candidate*` shape: no rubric, no criteria, no ideal points, no planned
 * follow-ups, no coverage log. `content-no-answer-key.int.spec.ts` reads its endpoint list from
 * the OpenAPI document and covers `/api/interviews/` as well as `/api/content/`.
 */
@ApiTags("interviews")
@Controller("interviews")
export class InterviewsController {
  constructor(
    private readonly interviews: InterviewsService,
    private readonly advances: InterviewAdvanceService,
  ) {}

  /** Starts a session: picks the questions and pins the content they were asked at. */
  @Post()
  @ZodSerializerDto(InterviewSessionResponseDto)
  @ApiCreatedResponse({ type: InterviewSessionResponseDto.Output })
  @ApiBadRequestResponse({
    description:
      "No role or level to use (`profile_required`), or the role does not offer that level, " +
      "variant or question type (`level_not_offered`, `stack_not_offered`)",
  })
  @ApiNotFoundResponse({ description: "No such published role, level or variant" })
  @ApiConflictResponse({ description: "Nothing published to ask (code `no_questions_available`)" })
  @ApiTooManyRequestsResponse({ description: "Too many interviews started (code `rate_limited`)" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateInterviewRequestDto,
  ): Promise<InterviewSessionResponse> {
    return this.interviews.create(user, body);
  }

  /** The Practice list: this candidate's sessions, newest first, keyset-paged. */
  @Get()
  @ZodSerializerDto(InterviewListResponseDto)
  @ApiOkResponse({ type: InterviewListResponseDto.Output })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InterviewListQueryDto,
  ): Promise<InterviewListResponse> {
    return this.interviews.list(user, query);
  }

  /**
   * One exchange, streamed (ADR-0016).
   *
   * `@Res()` rather than Nest's `@Sse()`: this is a POST with a body, and the heartbeat has to
   * interleave with an `await` on the worker. It means Nest applies no response interceptor here, so
   * the frames are serialized and validated by `InterviewStream` instead.
   *
   * Everything refusable is refused **before** the stream opens, and reaches the client as an
   * ordinary `ApiError` body with a status. After that the status is already 200, so a failure is an
   * `error` frame — `interview-stream.ts` in the web app is the one place that handles both.
   */
  @Post(":id/advance")
  @ApiProduces("text/event-stream")
  @ApiOkResponse({
    description:
      "An event stream: one `data:` message per `InterviewFrame` (see @readi/shared-types). " +
      "The generated API client does not model streaming, so the web app reads it by hand.",
    content: { "text/event-stream": { schema: { type: "string", format: "event-stream" } } },
  })
  @ApiNotFoundResponse({ description: "Not this candidate's (code `interview_not_found`)" })
  @ApiConflictResponse({
    description:
      "Already finished (`interview_ended`), too old to resume (`interview_expired`), or another " +
      "exchange is in flight (`interview_busy`)",
  })
  async advance(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
    @Body() body: AdvanceInterviewRequestDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.advances.advance(user, params.id, body, new InterviewStream(response));
  }

  /**
   * Polled by the completion screen while it waits (the `cv-panel.tsx` pattern). In M3 there is
   * nothing to wait for — `feedback_ready` is always false, and the screen says so rather than
   * spinning for something that is not coming.
   */
  @Get(":id/status")
  @ZodSerializerDto(InterviewStatusResponseDto)
  @ApiOkResponse({ type: InterviewStatusResponseDto.Output })
  @ApiNotFoundResponse({ description: "Not this candidate's (code `interview_not_found`)" })
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
  ): Promise<InterviewStatusResponse> {
    return this.interviews.status(user, params.id);
  }

  /** One session and its transcript so far. */
  @Get(":id")
  @ZodSerializerDto(InterviewSessionResponseDto)
  @ApiOkResponse({ type: InterviewSessionResponseDto.Output })
  @ApiNotFoundResponse({ description: "Not this candidate's (code `interview_not_found`)" })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
  ): Promise<InterviewSessionResponse> {
    return this.interviews.get(user, params.id);
  }
}
