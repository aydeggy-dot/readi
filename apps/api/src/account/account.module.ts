import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TracingModule } from "../tracing/tracing.module";
import { AccountDeletionService } from "./account-deletion.service";
import { AccountErasureQueue } from "./account-erasure.queue";
import { AccountController } from "./account.controller";
import { DataExportService } from "./data-export.service";

/** Data export and account deletion (ADR-0011). */
@Module({
  imports: [AuthModule, TracingModule],
  controllers: [AccountController],
  providers: [DataExportService, AccountDeletionService, AccountErasureQueue],
})
export class AccountModule {}
