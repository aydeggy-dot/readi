import { Global, Module } from "@nestjs/common";
import { AiCallLogService } from "./ai-call-log.service";

@Global()
@Module({ providers: [AiCallLogService], exports: [AiCallLogService] })
export class AiCallsModule {}
