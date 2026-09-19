import type { CvParseRequest, CvParseResponse, ParsedCv } from "@readi/shared-types";
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

/** Stands in for the AI worker: records requests and answers with the configured outcome. */
export class FakeAiWorker extends AiWorkerClient {
  readonly requests: CvParseRequest[] = [];
  outcome: Outcome = "parsed";

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
