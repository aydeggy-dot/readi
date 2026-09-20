import { Module } from "@nestjs/common";
import { CvParseProcessor } from "./cv-parse.processor";
import { CvParseQueue } from "./cv-parse.queue";
import { CvController } from "./cv.controller";
import { CvParseJobs, CvService } from "./cv.service";

@Module({
  controllers: [CvController],
  providers: [
    CvService,
    CvParseProcessor,
    CvParseQueue,
    { provide: CvParseJobs, useExisting: CvParseQueue },
  ],
})
export class CvModule {}
