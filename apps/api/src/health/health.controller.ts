import { Controller, Get, Res } from "@nestjs/common";
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import { HealthResponse } from "@readi/shared-types";
import type { Response } from "express";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { HealthService } from "./health.service";

class HealthResponseDto extends createZodDto(HealthResponse) {}

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness and dependency status. 200 when every check passes, 503 otherwise. */
  @Get()
  @ZodSerializerDto(HealthResponseDto)
  // Both responses share one body schema; documenting both via `.Output` keeps a single component.
  @ApiOkResponse({ type: HealthResponseDto.Output, description: "All dependencies are healthy" })
  @ApiServiceUnavailableResponse({
    type: HealthResponseDto.Output,
    description: "A dependency is failing",
  })
  async get(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const body = await this.health.check();
    res.status(body.status === "ok" ? 200 : 503);
    return body;
  }
}
