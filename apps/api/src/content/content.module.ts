import { Module } from "@nestjs/common";
import { ContentAdminController } from "./content-admin.controller";
import { ContentController } from "./content.controller";
import { ContentService } from "./content.service";

@Module({
  controllers: [ContentController, ContentAdminController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
