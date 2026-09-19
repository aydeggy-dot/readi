import { Module } from "@nestjs/common";
import { DevMailboxController } from "./dev-mailbox.controller";
import { DevMailboxService } from "./dev-mailbox.service";

/**
 * Development/test-only module. It is not imported at all when NODE_ENV=production (see
 * NotificationsModule.forRoot), so neither the route nor the service exists there.
 */
@Module({
  controllers: [DevMailboxController],
  providers: [DevMailboxService],
  exports: [DevMailboxService],
})
export class DevMailboxModule {}
