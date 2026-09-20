import { Body, Controller, Get, Put } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ConsentsResponse, UpdateConsentsRequest } from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ConsentsService } from "./consents.service";

class UpdateConsentsRequestDto extends createZodDto(UpdateConsentsRequest) {}
class ConsentsResponseDto extends createZodDto(ConsentsResponse) {}

@ApiTags("consents")
@Controller("me/consents")
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  /** The signed-in user's consent decisions, one per consent type. */
  @Get()
  @ZodSerializerDto(ConsentsResponseDto)
  @ApiOkResponse({ type: ConsentsResponseDto.Output })
  async get(@CurrentUser() user: AuthenticatedUser): Promise<ConsentsResponse> {
    return { consents: await this.consents.list(user.id) };
  }

  /** Records consent decisions; each change is stored as a new consent record. */
  @Put()
  @ZodSerializerDto(ConsentsResponseDto)
  @ApiOkResponse({ type: ConsentsResponseDto.Output })
  @ApiBadRequestResponse({ description: "Invalid decisions (e.g. a type listed twice)" })
  @ApiConflictResponse({
    description:
      "A decision was made against an outdated consent text (`consent_version_outdated`)",
  })
  async put(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateConsentsRequestDto,
  ): Promise<ConsentsResponse> {
    return { consents: await this.consents.update(user.id, body.decisions) };
  }
}
