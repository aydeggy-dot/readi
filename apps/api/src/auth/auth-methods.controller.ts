import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AuthMethodsResponse } from "@readi/shared-types";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { Public } from "./auth.decorators";

class AuthMethodsResponseDto extends createZodDto(AuthMethodsResponse) {}

@ApiTags("auth")
@Controller("auth-methods")
export class AuthMethodsController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Which optional sign-in methods are configured, so the web app shows only working buttons. */
  @Public()
  @Get()
  @ZodSerializerDto(AuthMethodsResponseDto)
  @ApiOkResponse({ type: AuthMethodsResponseDto.Output })
  get(): AuthMethodsResponse {
    return { google: Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET) };
  }
}
