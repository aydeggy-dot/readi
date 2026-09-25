import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from "@nestjs/swagger";
import {
  CreateInterviewRequest,
  InterviewListQuery,
  InterviewListResponse,
  InterviewSessionResponse,
} from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { z } from "zod";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthenticatedUser } from "../auth/auth.service";
import { InterviewsService } from "./interviews.service";

class CreateInterviewRequestDto extends createZodDto(CreateInterviewRequest) {}
class InterviewListQueryDto extends createZodDto(InterviewListQuery) {}
class InterviewListResponseDto extends createZodDto(InterviewListResponse) {}
class InterviewSessionResponseDto extends createZodDto(InterviewSessionResponse) {}
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
  constructor(private readonly interviews: InterviewsService) {}

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
