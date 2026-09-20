import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Res } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
} from "@nestjs/swagger";
import { DataExport, DeleteAccountRequest, DeleteAccountResponse } from "@readi/shared-types";
import type { Response } from "express";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { CurrentSession, CurrentUser } from "../auth/auth.decorators";
import type { AuthenticatedUser, AuthSession } from "../auth/auth.service";
import { AccountDeletionService } from "./account-deletion.service";
import { DataExportService, exportFilename } from "./data-export.service";

class DataExportDto extends createZodDto(DataExport) {}
class DeleteAccountRequestDto extends createZodDto(DeleteAccountRequest) {}
class DeleteAccountResponseDto extends createZodDto(DeleteAccountResponse) {}

@ApiTags("account")
@Controller("me")
export class AccountController {
  constructor(
    private readonly exports: DataExportService,
    private readonly deletion: AccountDeletionService,
  ) {}

  /** Everything Readi holds about the signed-in user, as a JSON download (ADR-0011). */
  @Get("export")
  @Header("Cache-Control", "no-store")
  @ZodSerializerDto(DataExportDto)
  @ApiProduces("application/json")
  @ApiOkResponse({ type: DataExportDto.Output })
  @ApiTooManyRequestsResponse({ description: "Too many exports recently (`rate_limited`)" })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DataExport> {
    const now = new Date();
    const data = await this.exports.export(user.id, now);
    response.setHeader("Content-Disposition", `attachment; filename="${exportFilename(now)}"`);
    return data;
  }

  /**
   * Schedules the account for deletion and signs out every session. Needs the typed
   * confirmation and a sign-in within the last few minutes (ADR-0011).
   */
  @Post("deletion")
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(DeleteAccountResponseDto)
  @ApiOkResponse({ type: DeleteAccountResponseDto.Output })
  @ApiBadRequestResponse({ description: "The confirmation word is missing or wrong" })
  @ApiForbiddenResponse({ description: "Signed in too long ago (`recent_sign_in_required`)" })
  requestDeletion(
    @CurrentSession() session: AuthSession,
    @Body() _body: DeleteAccountRequestDto,
  ): Promise<DeleteAccountResponse> {
    return this.deletion.request(session);
  }
}
