import { createHash } from "node:crypto";
import {
  ENGINE_SNAPSHOT_VERSION,
  EMBEDDING_DIMENSIONS,
  type AiCallRecord,
  type BundleQuestion,
  type CvParseRequest,
  type CvParseResponse,
  type EmbedRequest,
  type EmbedResponse,
  type InterviewAdvanceRequest,
  type InterviewAdvanceResponse,
  type InterviewEndReason,
  type InterviewEngineSnapshot,
  type InterviewSessionBundle,
  type InterviewTurn,
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
  /** The interview half, kept in its own object so its state is obvious in a test. */
  readonly engine = new FakeInterviewEngine();
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

  advanceInterview(request: InterviewAdvanceRequest): Promise<InterviewAdvanceResponse> {
    return this.engine.advance(request);
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

/**
 * Stands in for the interview engine (`apps/ai-worker/readi_worker/interview/`).
 *
 * **It is not the engine and must never grow into one.** The engine's rules — the budgets, the probe
 * selection, the coverage judgement — are decided and tested in Python, and duplicating them here
 * would give us two implementations and one place to be wrong. What the API needs from a double is
 * the *shape* of an exchange: turns with engine-allocated seqs, a snapshot that round-trips, a
 * coverage log on a candidate turn, `ai_calls` to record, and the `bundle_required` answer.
 *
 * It does cache the bundle, because that behaviour belongs to the API's side of the contract: the
 * API sends the bundle once and the worker is expected to remember it. `forgetBundles()` is a Redis
 * flush in the worker, which is the one thing the API has to handle and cannot otherwise provoke.
 */
export class FakeInterviewEngine {
  readonly requests: InterviewAdvanceRequest[] = [];
  /** What it answered, so a test can compare what was written with what was sent. */
  readonly responses: InterviewAdvanceResponse[] = [];
  /** `ok`, or what the engine answers instead. */
  outcome: "ok" | "unavailable" | "engine_error" = "ok";
  private readonly bundles = new Map<string, InterviewSessionBundle>();

  /** A Redis flush inside the worker: the next exchange must ask for the bundle again. */
  forgetBundles(): void {
    this.bundles.clear();
  }

  advance(request: InterviewAdvanceRequest): Promise<InterviewAdvanceResponse> {
    this.requests.push(request);
    if (this.outcome === "unavailable") {
      return Promise.reject(new AiWorkerUnavailableError("connection refused"));
    }
    if (request.bundle) this.bundles.set(request.session_id, request.bundle);
    const bundle = this.bundles.get(request.session_id);
    if (!bundle) return Promise.resolve(this.answer(this.refuse(request, "bundle_required")));
    if (this.outcome === "engine_error") {
      return Promise.resolve(this.answer(this.refuse(request, "engine_error")));
    }
    return Promise.resolve(this.answer(this.run(request, bundle)));
  }

  private answer(response: InterviewAdvanceResponse): InterviewAdvanceResponse {
    this.responses.push(response);
    return response;
  }

  private run(
    request: InterviewAdvanceRequest,
    bundle: InterviewSessionBundle,
  ): InterviewAdvanceResponse {
    const snapshot: InterviewEngineSnapshot = request.engine_snapshot ?? {
      version: ENGINE_SNAPSHOT_VERSION,
      state: "intro",
      current_question: null,
      next_seq: 0,
      questions_asked: 0,
      progress: bundle.questions.map((question) => ({
        position: question.position,
        asked: false,
        probes_asked: [],
        probes_covered: [],
      })),
      end_reason: null,
    };
    const turns: InterviewTurn[] = [];
    const next = { ...snapshot, progress: snapshot.progress.map((row) => ({ ...row })) };
    const take = (): number => next.next_seq++;

    const ask = (position: number): void => {
      const question = bundle.questions[position];
      next.state = "question";
      next.current_question = position;
      next.questions_asked += 1;
      const progress = next.progress[position];
      if (progress) progress.asked = true;
      turns.push(turn(take(), "interviewer", "question", position, null, question?.prompt ?? "?"));
    };
    const wrapUp = (reason: InterviewEndReason): void => {
      next.state = "ended";
      next.current_question = null;
      next.end_reason = reason;
      turns.push(turn(take(), "interviewer", "wrap_up", null, null, "Thank you for your time."));
    };

    if (request.action === "start") {
      turns.push(turn(take(), "interviewer", "intro", null, null, "Hello, and welcome."));
      ask(0);
    } else if (request.action === "end") {
      wrapUp("candidate_ended");
    } else if (request.action === "skip" || request.action === "answer") {
      const position = snapshot.current_question ?? 0;
      const question = bundle.questions[position];
      const progress = next.progress[position];
      if (request.action === "answer") {
        turns.push(
          turn(
            take(),
            "candidate",
            snapshot.state,
            position,
            null,
            request.text?.trim() ?? "",
            coverageFor(question, progress?.probes_asked.length === 0),
          ),
        );
      }
      const probe = progress && progress.probes_asked.length === 0 ? 0 : null;
      const hasProbe = (question?.planned_follow_ups.length ?? 0) > 0;
      if (request.action === "answer" && probe !== null && hasProbe && progress) {
        progress.probes_asked = [probe];
        next.state = "follow_up";
        turns.push(
          turn(
            take(),
            "interviewer",
            "follow_up",
            position,
            probe,
            question?.planned_follow_ups[probe]?.probe ?? "?",
          ),
        );
      } else if (
        position + 1 < bundle.questions.length &&
        next.questions_asked < bundle.question_budget
      ) {
        ask(position + 1);
      } else {
        wrapUp("questions_done");
      }
    }

    return {
      session_id: request.session_id,
      state: next.state,
      ended: next.state === "ended",
      end_reason: next.state === "ended" ? next.end_reason : null,
      turns,
      engine_snapshot: next,
      prompt_versions: { interview_system: 1, interview_question: 1 },
      ai_calls: [interviewerCall()],
      error: null,
    };
  }

  private refuse(
    request: InterviewAdvanceRequest,
    error: NonNullable<InterviewAdvanceResponse["error"]>,
  ): InterviewAdvanceResponse {
    return {
      session_id: request.session_id,
      state: request.engine_snapshot?.state ?? "intro",
      ended: false,
      end_reason: null,
      turns: [],
      engine_snapshot: null,
      prompt_versions: {},
      ai_calls: [],
      error,
    };
  }
}

function turn(
  seq: number,
  speaker: InterviewTurn["speaker"],
  state: InterviewTurn["state"],
  position: number | null,
  followUp: number | null,
  text: string,
  criteria: InterviewTurn["criteria_covered"] = null,
): InterviewTurn {
  return {
    seq,
    speaker,
    state,
    question_position: position,
    follow_up_index: followUp,
    text: text || "(nothing)",
    criteria_covered: criteria,
  };
}

/** One entry per criterion, as the engine writes it: nothing keyed by criterion, ever. */
function coverageFor(
  question: BundleQuestion | undefined,
  judged: boolean,
): InterviewTurn["criteria_covered"] {
  if (!question) return null;
  return Array.from({ length: question.criterion_count }, (_unused, criterion) => {
    const probes = question.planned_follow_ups.filter((probe) => probe.criterion === criterion);
    return {
      criterion,
      has_probe: probes.length > 0,
      covered: probes.length > 0 && judged ? "not_covered" : "not_judged",
      follow_up_index: null,
    };
  });
}

function interviewerCall(): AiCallRecord {
  return {
    purpose: "interviewer",
    provider: "fake",
    model: "fake",
    status: "ok",
    error_code: null,
    latency_ms: 7,
    input_units: 900,
    output_units: 40,
    unit_kind: "tokens",
    cost_micro_usd: 0,
  };
}
