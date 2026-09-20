import { createHash } from "node:crypto";
import {
  EMBEDDING_DIMENSIONS,
  type CvParseRequest,
  type CvParseResponse,
  type EmbedRequest,
  type EmbedResponse,
  type ParsedCv,
} from "@readi/shared-types";
import { AiWorkerClient, AiWorkerUnavailableError } from "../src/ai-worker/ai-worker.client";

export const PARSED: ParsedCv = {
  skills: ["React", "TypeScript"],
  projects: [{ name: "Price tracker", description: "Tracks prices.", technologies: ["Next.js"] }],
  experience: [
    {
      title: "Frontend intern",
      organisation: "Fintech Ltd",
      start: "2024-01",
      end: null,
      current: true,
      summary: "Built dashboards.",
    },
  ],
  gaps: ["No automated testing shown"],
};

type Outcome = "parsed" | "unreadable" | "unavailable";

/**
 * A unit-length vector derived from the text, standing in for the worker's fake provider (which
 * does the same thing in Python). It does not have to produce the same numbers as the worker: what
 * the API needs from it is that identical text gives an identical vector and different text does
 * not, which is what the duplicate path is built on.
 */
export function stubVector(text: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const values: number[] = [];
  let block = 0;
  while (values.length < dimensions) {
    const digest = createHash("sha256").update(`${block++}:${text}`).digest();
    for (const byte of digest) values.push(byte / 255 - 0.5);
  }
  const vector = values.slice(0, dimensions);
  const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

/** Stands in for the AI worker: records requests and answers with the configured outcome. */
export class FakeAiWorker extends AiWorkerClient {
  readonly requests: CvParseRequest[] = [];
  readonly embedRequests: EmbedRequest[] = [];
  outcome: Outcome = "parsed";
  /** What the next embed call does: answer, report a provider failure, or be unreachable. */
  embedOutcome: "ok" | "failed" | "unavailable" = "ok";
  /** Set to answer with vectors of the wrong length, as a model change would. */
  embedDimensions = EMBEDDING_DIMENSIONS;

  embed(request: EmbedRequest): Promise<EmbedResponse> {
    this.embedRequests.push(request);
    if (this.embedOutcome === "unavailable") {
      return Promise.reject(new AiWorkerUnavailableError("connection refused"));
    }
    const failed = this.embedOutcome === "failed";
    return Promise.resolve({
      request_id: request.request_id,
      status: failed ? "failed" : "ok",
      error: failed ? "ConnectError" : null,
      model: "fake",
      dimensions: failed ? 0 : this.embedDimensions,
      embeddings: failed ? [] : request.texts.map((text) => stubVector(text, this.embedDimensions)),
      ai_calls: [
        {
          purpose: "embedding",
          provider: "fake",
          model: "fake",
          status: failed ? "error" : "ok",
          error_code: failed ? "ConnectError" : null,
          latency_ms: 3,
          input_units: failed ? 0 : 120,
          output_units: 0,
          unit_kind: "tokens",
          cost_micro_usd: 0,
        },
      ],
    });
  }

  parseCv(request: CvParseRequest): Promise<CvParseResponse> {
    this.requests.push(request);
    if (this.outcome === "unavailable") {
      return Promise.reject(new AiWorkerUnavailableError("connection refused"));
    }
    const parsed = this.outcome === "parsed";
    return Promise.resolve({
      request_id: request.request_id,
      status: parsed ? "parsed" : "unreadable",
      parsed: parsed ? PARSED : null,
      error: parsed ? null : "no_text",
      ai_calls: parsed
        ? [
            {
              purpose: "cv_parse",
              provider: "anthropic",
              model: "claude-sonnet-5",
              status: "ok",
              error_code: null,
              latency_ms: 1234,
              input_units: 3000,
              output_units: 1000,
              unit_kind: "tokens",
              cost_micro_usd: 16_000,
            },
          ]
        : [],
    });
  }
}
