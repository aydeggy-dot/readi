import { Module } from "@nestjs/common";
import { ContentAdminController } from "./content-admin.controller";
import { ContentController } from "./content.controller";
import { ContentService } from "./content.service";
import { QuestionEmbeddingsRepository } from "./question-embeddings.repository";
import { QuestionEmbeddingsService } from "./question-embeddings.service";

@Module({
  controllers: [ContentController, ContentAdminController],
  providers: [ContentService, QuestionEmbeddingsService, QuestionEmbeddingsRepository],
  exports: [ContentService, QuestionEmbeddingsService],
})
export class ContentModule {}
