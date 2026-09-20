import { Body, Controller, Get, HttpStatus, Put } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ProfileResponse, UpdateProfileRequest } from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ApiError } from "../http/api-error";
import { ProfilesService } from "./profiles.service";

class UpdateProfileRequestDto extends createZodDto(UpdateProfileRequest) {}
class ProfileResponseDto extends createZodDto(ProfileResponse) {}

@ApiTags("profile")
@Controller("me/profile")
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  /** The signed-in user's career profile. */
  @Get()
  @ZodSerializerDto(ProfileResponseDto)
  @ApiOkResponse({ type: ProfileResponseDto.Output })
  @ApiNotFoundResponse({ description: "No profile yet (code `profile_not_found`)" })
  async get(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponse> {
    const profile = await this.profiles.get(user.id);
    if (!profile) throw new ApiError(HttpStatus.NOT_FOUND, "profile_not_found", "No profile yet");
    return profile;
  }

  /** Creates or replaces the signed-in user's career profile. */
  @Put()
  @ZodSerializerDto(ProfileResponseDto)
  @ApiOkResponse({ type: ProfileResponseDto.Output })
  @ApiBadRequestResponse({ description: "Invalid profile" })
  put(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProfileRequestDto,
  ): Promise<ProfileResponse> {
    return this.profiles.upsert(user.id, body);
  }
}
