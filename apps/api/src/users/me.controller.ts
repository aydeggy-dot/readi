import { Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { MeResponse, OnboardingState } from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { z } from "zod";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthenticatedUser } from "../auth/auth.service";
import { OnboardingService } from "./onboarding.service";

class MeResponseDto extends createZodDto(MeResponse) {}
// A registered DTO root must not carry the nested schema's `.meta({ id })` (ADR-0001).
class OnboardingStateDto extends createZodDto(z.object(OnboardingState.shape)) {}

@ApiTags("users")
@Controller("me")
export class MeController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** The signed-in user, with their onboarding progress. */
  @Get()
  @ZodSerializerDto(MeResponseDto)
  @ApiOkResponse({ type: MeResponseDto.Output })
  @ApiUnauthorizedResponse({ description: "Not signed in" })
  async get(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      email_verified: user.emailVerified,
      phone_number: user.phoneNumber,
      phone_number_verified: user.phoneNumberVerified,
      signup_method: user.signupMethod,
      onboarding: await this.onboarding.state(user.id),
    };
  }

  /** Completes onboarding once the profile and consent steps are done. Idempotent. */
  @Post("onboarding/complete")
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(OnboardingStateDto)
  @ApiOkResponse({ type: OnboardingStateDto.Output })
  @ApiConflictResponse({
    description: "A required step is missing (`profile_required`, `consents_required`)",
  })
  complete(@CurrentUser() user: AuthenticatedUser): Promise<OnboardingState> {
    return this.onboarding.complete(user.id);
  }
}
