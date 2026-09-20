import { Inject, Injectable, Logger } from "@nestjs/common";
import { type CvParseRequest, CvParseResponse } from "@readi/shared-types";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";

/** The worker could not be reached or answered with an error; the caller may retry. */
export class AiWorkerUnavailableError extends Error {
  override name = "AiWorkerUnavailableError";
}

/** Calls to the AI worker (ADR-0004). Abstract so tests can substitute a fake. */
export abstract class AiWorkerClient {
  abstract parseCv(request: CvParseRequest): Promise<CvParseResponse>;
}

@Injectable()
export class HttpAiWorkerClient extends AiWorkerClient {
  private readonly logger = new Logger(HttpAiWorkerClient.name);

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async parseCv(request: CvParseRequest): Promise<CvParseResponse> {
    let response: Response;
    try {
      response = await fetch(new URL("/cv/parse", this.env.AI_WORKER_URL), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.env.AI_WORKER_TOKEN}`,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.env.AI_WORKER_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AiWorkerUnavailableError(error instanceof Error ? error.name : "fetch failed");
    }
    if (!response.ok) {
      // Status only: worker error bodies can echo request fields.
      throw new AiWorkerUnavailableError(`worker answered HTTP ${response.status}`);
    }
    const parsed = CvParseResponse.safeParse(await response.json());
    if (!parsed.success) {
      this.logger.error(`invalid /cv/parse response for request ${request.request_id}`);
      throw new AiWorkerUnavailableError("invalid worker response");
    }
    return parsed.data;
  }
}
