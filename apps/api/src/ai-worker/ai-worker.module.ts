import { Global, Module } from "@nestjs/common";
import { AiWorkerClient, HttpAiWorkerClient } from "./ai-worker.client";

@Global()
@Module({
  providers: [{ provide: AiWorkerClient, useClass: HttpAiWorkerClient }],
  exports: [AiWorkerClient],
})
export class AiWorkerModule {}
