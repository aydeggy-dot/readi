import { Controller, Get, Query } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Public } from "../auth/auth.decorators";
import { DevMailboxService } from "./dev-mailbox.service";

class MailboxQuery extends createZodDto(z.object({ to: z.string().min(3).max(254) })) {}

/** Development/test only (see DevMailboxModule). Excluded from the OpenAPI document. */
@ApiExcludeController()
@Controller("dev/mailbox")
export class DevMailboxController {
  constructor(private readonly mailbox: DevMailboxService) {}

  @Public()
  @Get()
  list(@Query() query: MailboxQuery) {
    return this.mailbox.list(query.to);
  }
}
