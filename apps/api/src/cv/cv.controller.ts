import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Put } from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import {
  ConfirmCvUploadRequest,
  CreateCvUploadRequest,
  CvResponse,
  CvUploadResponse,
  ParsedCv,
} from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { z } from "zod";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CvService } from "./cv.service";

class CreateCvUploadRequestDto extends createZodDto(CreateCvUploadRequest) {}
class CvUploadResponseDto extends createZodDto(CvUploadResponse) {}
class ConfirmCvUploadRequestDto extends createZodDto(ConfirmCvUploadRequest) {}
class CvResponseDto extends createZodDto(CvResponse) {}
// A DTO root must not carry the shared schema's `.meta({ id })` (ADR-0001).
class ParsedCvDto extends createZodDto(z.object(ParsedCv.shape)) {}

@ApiTags("cv")
@Controller("me/cv")
export class CvController {
  constructor(private readonly cv: CvService) {}

  /** The signed-in user's CV status and parsed content (poll while `processing`). */
  @Get()
  @ZodSerializerDto(CvResponseDto)
  @ApiOkResponse({ type: CvResponseDto.Output })
  get(@CurrentUser() user: AuthenticatedUser): Promise<CvResponse> {
    return this.cv.get(user.id);
  }

  /** Step 1: a presigned URL to PUT a PDF/DOCX (≤ 5 MB) straight to storage. */
  @Post("uploads")
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(CvUploadResponseDto)
  @ApiOkResponse({ type: CvUploadResponseDto.Output })
  @ApiConflictResponse({ description: "No profile yet (`profile_required`)" })
  @ApiTooManyRequestsResponse({ description: "Too many uploads (`rate_limited`)" })
  createUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateCvUploadRequestDto,
  ): Promise<CvUploadResponse> {
    return this.cv.createUpload(user.id, body);
  }

  /** Step 2: checks the uploaded file, makes it the CV and starts parsing. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(CvResponseDto)
  @ApiOkResponse({ type: CvResponseDto.Output })
  @ApiNotFoundResponse({ description: "Unknown or expired upload (`upload_not_found`)" })
  @ApiConflictResponse({ description: "`upload_incomplete`, `profile_required` or `cv_changed`" })
  @ApiUnprocessableEntityResponse({
    description: "Not a PDF/DOCX of the declared size (`invalid_file`)",
  })
  @ApiTooManyRequestsResponse({ description: "Too many CVs parsed recently (`rate_limited`)" })
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ConfirmCvUploadRequestDto,
  ): Promise<CvResponse> {
    return this.cv.confirmUpload(user.id, body.upload_id);
  }

  /** Saves the candidate's edits to the parsed CV. */
  @Put("parsed")
  @ZodSerializerDto(CvResponseDto)
  @ApiOkResponse({ type: CvResponseDto.Output })
  @ApiConflictResponse({ description: "No CV, or still processing (`cv_not_editable`)" })
  updateParsed(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ParsedCvDto,
  ): Promise<CvResponse> {
    return this.cv.updateParsed(user.id, body);
  }

  /** Deletes the CV file and its parsed content. */
  @Delete()
  @ZodSerializerDto(CvResponseDto)
  @ApiOkResponse({ type: CvResponseDto.Output })
  remove(@CurrentUser() user: AuthenticatedUser): Promise<CvResponse> {
    return this.cv.remove(user.id);
  }
}
