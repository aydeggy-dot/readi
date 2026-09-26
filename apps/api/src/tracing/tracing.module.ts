import { Module } from "@nestjs/common";
import { TracesService } from "./traces.service";

/** LLM-trace deletion: account erasure and the retention sweep (ADR-0008, ADR-0011). */
@Module({
  providers: [TracesService],
  exports: [TracesService],
})
export class TracingModule {}
