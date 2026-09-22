import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  ContentEntityPath,
  ContentListQuery,
  ContentReviewRequest,
  ContentReviewResponse,
  ContentTransitionRequest,
  ContentTransitionResponse,
  ContentVersionResponse,
  ContentVersionsResponse,
  DuplicateCheckRequest,
  DuplicateWarningsResponse,
  Lesson,
  LessonInput,
  LessonListResponse,
  Module as ModuleContract,
  ModuleInput,
  Question,
  QuestionInput,
  QuestionListResponse,
  Rubric,
  RubricInput,
  RubricListResponse,
  Topic,
  TopicInput,
  TopicsResponse,
  Track,
  TrackInput,
  TrackListResponse,
} from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { z } from "zod";
import { CurrentUser, Roles } from "../auth/auth.decorators";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ContentService } from "./content.service";

class ContentListQueryDto extends createZodDto(ContentListQuery) {}
class IdParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}
class EntityParamsDto extends createZodDto(z.object({ entity: ContentEntityPath, id: z.uuid() })) {}
class VersionParamsDto extends createZodDto(
  z.object({ entity: ContentEntityPath, id: z.uuid(), version: z.coerce.number().int().min(1) }),
) {}

class TopicInputDto extends createZodDto(TopicInput) {}
class TopicDto extends createZodDto(Topic) {}
class TopicsResponseDto extends createZodDto(TopicsResponse) {}
class TrackInputDto extends createZodDto(TrackInput) {}
class TrackDto extends createZodDto(Track) {}
class TrackListResponseDto extends createZodDto(TrackListResponse) {}
class ModuleInputDto extends createZodDto(ModuleInput) {}
class ModuleDto extends createZodDto(ModuleContract) {}
class LessonInputDto extends createZodDto(LessonInput) {}
class LessonDto extends createZodDto(Lesson) {}
class LessonListResponseDto extends createZodDto(LessonListResponse) {}
class RubricInputDto extends createZodDto(RubricInput) {}
class RubricDto extends createZodDto(Rubric) {}
class RubricListResponseDto extends createZodDto(RubricListResponse) {}
class QuestionInputDto extends createZodDto(QuestionInput) {}
class QuestionDto extends createZodDto(Question) {}
class QuestionListResponseDto extends createZodDto(QuestionListResponse) {}
class ContentReviewRequestDto extends createZodDto(ContentReviewRequest) {}
class ContentReviewResponseDto extends createZodDto(ContentReviewResponse) {}
class ContentTransitionRequestDto extends createZodDto(ContentTransitionRequest) {}
class ContentTransitionResponseDto extends createZodDto(ContentTransitionResponse) {}
class ContentVersionsResponseDto extends createZodDto(ContentVersionsResponse) {}
class DuplicateCheckRequestDto extends createZodDto(DuplicateCheckRequest) {}
class DuplicateWarningsResponseDto extends createZodDto(DuplicateWarningsResponse) {}
class ContentVersionResponseDto extends createZodDto(ContentVersionResponse) {}

/**
 * The CMS (spec §4.8). A content expert writes, edits and submits; publishing and retiring are an
 * admin's call, enforced per transition by the workflow guard rather than by the route.
 *
 * Everything here may carry the answer key — that is the point of the admin side. The candidate
 * side is a separate controller with separate shapes (ADR-0014).
 */
@ApiTags("admin-content")
@Roles("content_expert", "admin")
@Controller("admin/content")
export class ContentAdminController {
  constructor(private readonly content: ContentService) {}

  // --- Topics ----------------------------------------------------------------------------------

  /** The whole topic taxonomy, by slug. */
  @Get("topics")
  @ZodSerializerDto(TopicsResponseDto)
  @ApiOkResponse({ type: TopicsResponseDto.Output })
  listTopics(): Promise<TopicsResponse> {
    return this.content.listTopics();
  }

  @Post("topics")
  @ZodSerializerDto(TopicDto)
  @ApiOkResponse({ type: TopicDto.Output })
  @ApiConflictResponse({ description: "Slug already in use (code `content_slug_taken`)" })
  createTopic(@CurrentUser() user: AuthenticatedUser, @Body() body: TopicInputDto): Promise<Topic> {
    return this.content.createTopic(user, body);
  }

  @Put("topics/:id")
  @ZodSerializerDto(TopicDto)
  @ApiOkResponse({ type: TopicDto.Output })
  @ApiNotFoundResponse({ description: "No such topic (code `topic_not_found`)" })
  updateTopic(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
    @Body() body: TopicInputDto,
  ): Promise<Topic> {
    return this.content.updateTopic(user, params.id, body);
  }

  // --- Tracks and modules ----------------------------------------------------------------------

  /** Tracks, newest edit first. Understands `status`, `role`, `level`, `q`, `cursor`, `limit`. */
  @Get("tracks")
  @ZodSerializerDto(TrackListResponseDto)
  @ApiOkResponse({ type: TrackListResponseDto.Output })
  listTracks(@Query() query: ContentListQueryDto): Promise<TrackListResponse> {
    return this.content.listTracks(query);
  }

  @Post("tracks")
  @ZodSerializerDto(TrackDto)
  @ApiOkResponse({ type: TrackDto.Output })
  createTrack(@CurrentUser() user: AuthenticatedUser, @Body() body: TrackInputDto): Promise<Track> {
    return this.content.createTrack(user, body);
  }

  @Get("tracks/:id")
  @ZodSerializerDto(TrackDto)
  @ApiOkResponse({ type: TrackDto.Output })
  @ApiNotFoundResponse({ description: "No such track (code `track_not_found`)" })
  getTrack(@Param() params: IdParamsDto): Promise<Track> {
    return this.content.getTrack(params.id);
  }

  @Put("tracks/:id")
  @ZodSerializerDto(TrackDto)
  @ApiOkResponse({ type: TrackDto.Output })
  async updateTrack(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
    @Body() body: TrackInputDto,
  ): Promise<Track> {
    const { entity } = await this.content.updateTrack(params.id, body, { actor: user });
    return entity;
  }

  @Post("tracks/:id/modules")
  @ZodSerializerDto(ModuleDto)
  @ApiOkResponse({ type: ModuleDto.Output })
  createModule(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
    @Body() body: ModuleInputDto,
  ): Promise<ModuleContract> {
    return this.content.createModule(params.id, body, { actor: user });
  }

  @Put("modules/:id")
  @ZodSerializerDto(ModuleDto)
  @ApiOkResponse({ type: ModuleDto.Output })
  @ApiNotFoundResponse({ description: "No such module (code `module_not_found`)" })
  async updateModule(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
    @Body() body: ModuleInputDto,
  ): Promise<ModuleContract> {
    const { entity } = await this.content.updateModule(params.id, body, { actor: user });
    return entity;
  }

  // --- Lessons ---------------------------------------------------------------------------------

  /** Lessons, newest edit first. Understands `status`, `topic_id`, `q`, `cursor`, `limit`. */
  @Get("lessons")
  @ZodSerializerDto(LessonListResponseDto)
  @ApiOkResponse({ type: LessonListResponseDto.Output })
  listLessons(@Query() query: ContentListQueryDto): Promise<LessonListResponse> {
    return this.content.listLessons(query);
  }

  @Post("modules/:id/lessons")
  @ZodSerializerDto(LessonDto)
  @ApiOkResponse({ type: LessonDto.Output })
  createLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
    @Body() body: LessonInputDto,
  ): Promise<Lesson> {
    return this.content.createLesson(user, params.id, body);
  }

  @Get("lessons/:id")
  @ZodSerializerDto(LessonDto)
  @ApiOkResponse({ type: LessonDto.Output })
  @ApiNotFoundResponse({ description: "No such lesson (code `lesson_not_found`)" })
  getLesson(@Param() params: IdParamsDto): Promise<Lesson> {
    return this.content.getLesson(params.id);
  }

  @Put("lessons/:id")
  @ZodSerializerDto(LessonDto)
  @ApiOkResponse({ type: LessonDto.Output })
  async updateLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
    @Body() body: LessonInputDto,
  ): Promise<Lesson> {
    const { entity } = await this.content.updateLesson(params.id, body, { actor: user });
    return entity;
  }

  // --- Rubrics ---------------------------------------------------------------------------------

  /** Rubrics, newest edit first. Understands `status`, `q`, `cursor`, `limit`. */
  @Get("rubrics")
  @ZodSerializerDto(RubricListResponseDto)
  @ApiOkResponse({ type: RubricListResponseDto.Output })
  listRubrics(@Query() query: ContentListQueryDto): Promise<RubricListResponse> {
    return this.content.listRubrics(query);
  }

  @Post("rubrics")
  @ZodSerializerDto(RubricDto)
  @ApiOkResponse({ type: RubricDto.Output })
  createRubric(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RubricInputDto,
  ): Promise<Rubric> {
    return this.content.createRubric(user, body);
  }

  @Get("rubrics/:id")
  @ZodSerializerDto(RubricDto)
  @ApiOkResponse({ type: RubricDto.Output })
  @ApiNotFoundResponse({ description: "No such rubric (code `rubric_not_found`)" })
  getRubric(@Param() params: IdParamsDto): Promise<Rubric> {
    return this.content.getRubric(params.id);
  }

  @Put("rubrics/:id")
  @ZodSerializerDto(RubricDto)
  @ApiOkResponse({ type: RubricDto.Output })
  async updateRubric(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
    @Body() body: RubricInputDto,
  ): Promise<Rubric> {
    const { entity } = await this.content.updateRubric(params.id, body, { actor: user });
    return entity;
  }

  // --- Questions -------------------------------------------------------------------------------

  /** Questions, newest edit first. Understands `status`, `type`, `role`, `level`, `topic_id`, `q`. */
  @Get("questions")
  @ZodSerializerDto(QuestionListResponseDto)
  @ApiOkResponse({ type: QuestionListResponseDto.Output })
  listQuestions(@Query() query: ContentListQueryDto): Promise<QuestionListResponse> {
    return this.content.listQuestions(query);
  }

  /**
   * Near-duplicates of a question that has not been saved yet, so the form can warn while it is
   * still being written. Declared before `questions/:id` has any chance to claim the path.
   */
  @Post("questions/duplicate-check")
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(DuplicateWarningsResponseDto)
  @ApiOkResponse({ type: DuplicateWarningsResponseDto.Output })
  async duplicateCheck(@Body() body: DuplicateCheckRequestDto): Promise<DuplicateWarningsResponse> {
    return { matches: await this.content.duplicateCheck(body) };
  }

  @Post("questions")
  @ZodSerializerDto(QuestionDto)
  @ApiOkResponse({ type: QuestionDto.Output })
  createQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: QuestionInputDto,
  ): Promise<Question> {
    return this.content.createQuestion(user, body);
  }

  @Get("questions/:id")
  @ZodSerializerDto(QuestionDto)
  @ApiOkResponse({ type: QuestionDto.Output })
  @ApiNotFoundResponse({ description: "No such question (code `question_not_found`)" })
  getQuestion(@Param() params: IdParamsDto): Promise<Question> {
    return this.content.getQuestion(params.id);
  }

  @Put("questions/:id")
  @ZodSerializerDto(QuestionDto)
  @ApiOkResponse({ type: QuestionDto.Output })
  async updateQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamsDto,
    @Body() body: QuestionInputDto,
  ): Promise<Question> {
    const { entity } = await this.content.updateQuestion(params.id, body, { actor: user });
    return entity;
  }

  // --- Workflow and history --------------------------------------------------------------------

  /**
   * Moves one piece of content through the workflow. One route for all four entities: the rules
   * are the same everywhere, and so is the answer — the new status, not the entity.
   */
  @Post(":entity/:id/transition")
  @ZodSerializerDto(ContentTransitionResponseDto)
  @ApiOkResponse({ type: ContentTransitionResponseDto.Output })
  @ApiForbiddenResponse({ description: "Not yours to make (code `content_transition_forbidden`)" })
  @ApiConflictResponse({
    description:
      "Wrong status (`content_transition_invalid`), or a publish rule refuses: " +
      "`rubric_weights_invalid`, `question_rubric_not_published`, `track_has_no_modules`, " +
      "`track_already_published`, or in production an unreviewed AI draft " +
      "(`content_unreviewed_ai_draft`, overridable with `acknowledge_unreviewed`)",
  })
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: EntityParamsDto,
    @Body() body: ContentTransitionRequestDto,
  ): Promise<ContentTransitionResponse> {
    return this.content.transition(user, params.entity, params.id, body);
  }

  /**
   * Records that a person has read a model's draft and stands behind it (ADR-0014 decision 6).
   * Open to a content expert as well as an admin: reviewing content is exactly an expert's job,
   * and publishing it afterwards is still the admin's.
   */
  @Post(":entity/:id/reviewed")
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(ContentReviewResponseDto)
  @ApiOkResponse({ type: ContentReviewResponseDto.Output })
  @ApiConflictResponse({
    description:
      "Nothing to review — it was not an AI draft, or already is (`content_not_unreviewed`)",
  })
  markReviewed(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: EntityParamsDto,
    @Body() body: ContentReviewRequestDto,
  ): Promise<ContentReviewResponse> {
    return this.content.markReviewed(user, params.entity, params.id, body);
  }

  /** Every recorded version of one entity, newest first. */
  @Get(":entity/:id/versions")
  @ZodSerializerDto(ContentVersionsResponseDto)
  @ApiOkResponse({ type: ContentVersionsResponseDto.Output })
  listVersions(@Param() params: EntityParamsDto): Promise<ContentVersionsResponse> {
    return this.content.listVersions(params.entity, params.id);
  }

  /** One stored snapshot: the content as it stood, and the status it was leaving. */
  @Get(":entity/:id/versions/:version")
  @ZodSerializerDto(ContentVersionResponseDto)
  @ApiOkResponse({ type: ContentVersionResponseDto.Output })
  @ApiNotFoundResponse({ description: "No such version (code `content_version_not_found`)" })
  getVersion(@Param() params: VersionParamsDto): Promise<ContentVersionResponse> {
    return this.content.getVersion(params.entity, params.id, params.version);
  }
}
