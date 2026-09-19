import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { MeResponse } from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthenticatedUser } from "../auth/auth.service";

class MeResponseDto extends createZodDto(MeResponse) {}

@ApiTags("users")
@Controller("me")
export class MeController {
  /** The signed-in user. */
  @Get()
  @ZodSerializerDto(MeResponseDto)
  @ApiOkResponse({ type: MeResponseDto.Output })
  @ApiUnauthorizedResponse({ description: "Not signed in" })
  get(@CurrentUser() user: AuthenticatedUser): MeResponse {
    return {
      id: user.id,
      role: user.role,
      email: user.email,
      email_verified: user.emailVerified,
      phone_number: user.phoneNumber,
      phone_number_verified: user.phoneNumberVerified,
      signup_method: user.signupMethod,
    };
  }
}
