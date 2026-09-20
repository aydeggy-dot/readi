import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  CandidateLessonResponse,
  CandidatePracticeQuery,
  CandidatePracticeResponse,
  CandidateTrackQuery,
  CandidateTrackResponse,
  CONTENT_LIMITS,
  SLUG_PATTERN,
} from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { z } from "zod";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ContentService } from "./content.service";

class CandidateTrackQueryDto extends createZodDto(CandidateTrackQuery) {}
class CandidateTrackResponseDto extends createZodDto(CandidateTrackResponse) {}
class CandidatePracticeQueryDto extends createZodDto(CandidatePracticeQuery) {}
class CandidatePracticeResponseDto extends createZodDto(CandidatePracticeResponse) {}
class CandidateLessonResponseDto extends createZodDto(CandidateLessonResponse) {}
class SlugParamsDto extends createZodDto(
  z.object({
    slug: z.string().min(1).max(CONTENT_LIMITS.slugMaxLength).regex(new RegExp(SLUG_PATTERN)),
  }),
) {}

/**
 * What a candidate may read: published content, and nothing that says what a good answer contains.
 *
 * Every response here is serialized through a `Candidate*` DTO, which has no field a rubric,
 * a criterion, a level descriptor or an ideal point could occupy, and which drops anything it does
 * not know. `content-no-answer-key.int.spec.ts` checks the raw JSON of each of these routes.
 */
@ApiTags("content")
@Controller("content")
export class ContentController {
  constructor(private readonly content: ContentService) {}

  /** The published track for a role and level, defaulting to the candidate's own profile. */
  @Get("track")
  @ZodSerializerDto(CandidateTrackResponseDto)
  @ApiOkResponse({ type: CandidateTrackResponseDto.Output })
  @ApiBadRequestResponse({ description: "No role or level to use (code `profile_required`)" })
  @ApiNotFoundResponse({ description: "Nothing published yet (code `track_not_found`)" })
  track(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CandidateTrackQueryDto,
  ): Promise<CandidateTrackResponse> {
    return this.content.candidateTrack(user, query);
  }

  /** Published practice questions for the candidate's role and level. */
  @Get("practice")
  @ZodSerializerDto(CandidatePracticeResponseDto)
  @ApiOkResponse({ type: CandidatePracticeResponseDto.Output })
  @ApiBadRequestResponse({ description: "No profile to read from (code `profile_required`)" })
  practice(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CandidatePracticeQueryDto,
  ): Promise<CandidatePracticeResponse> {
    return this.content.candidatePractice(user, query);
  }

  /** One published lesson, in markdown, from a published track. */
  @Get("lessons/:slug")
  @ZodSerializerDto(CandidateLessonResponseDto)
  @ApiOkResponse({ type: CandidateLessonResponseDto.Output })
  @ApiNotFoundResponse({ description: "Not published (code `lesson_not_found`)" })
  lesson(@Param() params: SlugParamsDto): Promise<CandidateLessonResponse> {
    return this.content.candidateLesson(params.slug);
  }
}
