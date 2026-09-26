import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type CvParseRequest,
  CvParseResponse,
  type EmbedRequest,
  EmbedResponse,
  type InterviewAdvanceRequest,
  InterviewAdvanceResponse,
  type TraceDeleteRequest,
  TraceDeleteResponse,
} from "@readi/shared-types";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";

/** The worker could not be reached or answered with an error; the caller may retry. */
export class AiWorkerUnavailableError extends Error {
  override name = "AiWorkerUnavailableError";
}

/** Calls to the AI worker (ADR-0004). Abstract so tests can substitute a fake. */
export abstract class AiWorkerClient {
  abstract parseCv(request: CvParseRequest): Promise<CvParseResponse>;
  abstract embed(request: EmbedRequest): Promise<EmbedResponse>;
  /** One interview exchange (ADR-0004/0016). The engine lives in the worker; this asks it. */
  abstract advanceInterview(request: InterviewAdvanceRequest): Promise<InterviewAdvanceResponse>;
  /**
   * Delete LLM traces — a user's, on erasure, or everything past retention (ADR-0008). The worker
   * holds the Langfuse credentials, so this is how the API reaches them.
   */
  abstract deleteTraces(request: TraceDeleteRequest): Promise<TraceDeleteResponse>;
}

@Injectable()
export class HttpAiWorkerClient extends AiWorkerClient {
  private readonly logger = new Logger(HttpAiWorkerClient.name);

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async parseCv(request: CvParseRequest): Promise<CvParseResponse> {
    return this.post("/cv/parse", request, CvParseResponse, request.request_id);
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    return this.post("/embeddings", request, EmbedResponse, request.request_id);
  }

  async advanceInterview(request: InterviewAdvanceRequest): Promise<InterviewAdvanceResponse> {
    return this.post("/interview/advance", request, InterviewAdvanceResponse, request.session_id);
  }

  async deleteTraces(request: TraceDeleteRequest): Promise<TraceDeleteResponse> {
    // The correlation id is what the request is about — never a random one nobody could match.
    return this.post("/traces/delete", request, TraceDeleteResponse, request.user_id ?? "expired");
  }

  /** One POST to the worker, validated against the response contract (ADR-0003/0004). */
  private async post<T>(
    path: string,
    body: unknown,
    schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
    requestId: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.env.AI_WORKER_URL), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.env.AI_WORKER_TOKEN}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.env.AI_WORKER_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AiWorkerUnavailableError(error instanceof Error ? error.name : "fetch failed");
    }
    if (!response.ok) {
      // Status only: worker error bodies can echo request fields.
      throw new AiWorkerUnavailableError(`worker answered HTTP ${response.status}`);
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      this.logger.error(`invalid ${path} response for request ${requestId}`);
      throw new AiWorkerUnavailableError("invalid worker response");
    }
    return parsed.data;
  }
}
