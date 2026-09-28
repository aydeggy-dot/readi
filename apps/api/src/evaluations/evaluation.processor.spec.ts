import type { AiCallRecord, EvaluateAnswerResponse } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import type { AiWorkerClient } from "../ai-worker/ai-worker.client";
import type { Env } from "../config/env";
import { EvaluationProcessor } from "./evaluation.processor";
import type {
  EvaluationToSave,
  EvaluationsRepository,
  SessionToEvaluate,
  StoredEvaluation,
} from "./evaluations.repository";
import type { AiCallLogService } from "../ai-calls/ai-call-log.service";

/**
 * The shape of the fan-out, which no integration test can see.
 *
 * `evaluations.int.spec.ts` runs the whole thing through the real queue, and every session it scores
 * has one answered question — so the one property proved here is invisible there: **the first answer
 * is scored alone, and the rest fan out behind it** (2026-09-28).
 *
 * That is not an arbitrary shape. The evaluator caches its system prompt, and a cache entry can only
 * be read once the request that wrote it has answered, so four calls started together on a cold prefix
 * each pay the 1.25× write and none reads anything — which costs *more* than not caching at all, and
 * at MVP volume the cold prefix is the normal case. It is the kind of ordering a later tidy-up removes
 * without noticing, which is why it is pinned rather than commented.
 */
describe("the evaluation fan-out", () => {
  it("scores the first answer alone, then fans the rest out", async () => {
    const order: string[] = [];
    let live = 0;
    let mostAtOnce = 0;
    const worker = fakeWorker(async (position) => {
      order.push(`start ${position}`);
      live += 1;
      mostAtOnce = Math.max(mostAtOnce, live);
      // Two ticks, so a caller that awaited each call in turn and one that started them together
      // produce different interleavings rather than the same one.
      await Promise.resolve();
      await Promise.resolve();
      live -= 1;
      order.push(`end ${position}`);
    });

    await processor(worker, 4).process({ sessionId: "s" }, { finalAttempt: false });

    // The head is alone: nothing else starts until it has finished.
    expect(order.slice(0, 2)).toEqual(["start 0", "end 0"]);
    // …and the tail really does run together, or this test would pass on a wholly sequential loop.
    expect(mostAtOnce).toBe(4);
  });

  it("still bounds the tail by EVALUATION_CONCURRENCY", async () => {
    let live = 0;
    let mostAtOnce = 0;
    const worker = fakeWorker(async () => {
      live += 1;
      mostAtOnce = Math.max(mostAtOnce, live);
      await Promise.resolve();
      await Promise.resolve();
      live -= 1;
    });

    await processor(worker, 2).process({ sessionId: "s" }, { finalAttempt: false });

    expect(mostAtOnce).toBe(2);
  });

  it("scores every answer exactly once", async () => {
    const seen: number[] = [];
    const worker = fakeWorker((position) => {
      seen.push(position);
      return Promise.resolve();
    });

    await processor(worker, 4).process({ sessionId: "s" }, { finalAttempt: false });

    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });
});

// -------------------------------------------------------------------------------------------------

const ANSWERS = 5;

function processor(worker: AiWorkerClient, concurrency: number): EvaluationProcessor {
  const stored: StoredEvaluation[] = [];
  const repository = {
    session: () => Promise.resolve(session()),
    save: (row: EvaluationToSave) => {
      stored.push({
        sessionQuestionId: row.sessionQuestionId,
        status: row.status,
        evaluation: row.evaluation,
        overall: row.score?.overall ?? null,
        overallRaw: row.score?.overallRaw ?? null,
        promptedCriteria: row.promptedCriteria,
        notAssessedCriteria: row.notAssessedCriteria,
      });
      return Promise.resolve();
    },
    stored: () => Promise.resolve(stored),
    lessonsForTopics: () => Promise.resolve([]),
    saveReport: () => Promise.resolve(),
  } as unknown as EvaluationsRepository;
  const aiCalls = { record: () => Promise.resolve() } as unknown as AiCallLogService;
  const env = { EVALUATION_CONCURRENCY: concurrency } as Env;
  return new EvaluationProcessor(repository, worker, aiCalls, env);
}

/** A worker whose `evaluateAnswer` runs `during` and then returns a usable reading. */
function fakeWorker(during: (position: number) => Promise<void>): AiWorkerClient {
  return {
    evaluateAnswer: async (request: { position: number }): Promise<EvaluateAnswerResponse> => {
      await during(request.position);
      return {
        position: request.position,
        evaluation: {
          criteria: [
            { criterion: 0, score: 3, max_score: 4, evidence: ["they said this"], reasoning: "ok" },
          ],
          covered_points: [],
          missing_points: [],
          strengths: [],
          improvement_tip: "Practise it.",
          red_flags: [],
          confidence: "medium",
        },
        error: null,
        evidence_flags: [],
        prompt_versions: { evaluate_answer: 2 },
        ai_calls: [call()],
      };
    },
  } as unknown as AiWorkerClient;
}

function call(): AiCallRecord {
  return {
    purpose: "evaluator",
    provider: "fake",
    model: "fake",
    status: "ok",
    error_code: null,
    latency_ms: 1,
    input_units: 100,
    output_units: 10,
    cache_write_units: 0,
    cache_read_units: 0,
    unit_kind: "tokens",
    cost_micro_usd: 0,
    langfuse_trace_id: null,
  };
}

/**
 * Five answered questions, which is what a 30-minute session looks like and what no integration test
 * produces. Cast once: `SessionToEvaluate` is a Prisma payload, and the processor reads a handful of
 * its fields — building the whole generated type by hand would test the type, not the ordering.
 */
function session(): SessionToEvaluate {
  return {
    id: "s",
    userId: "u",
    state: "ended",
    careerRoleId: "role",
    careerLevelId: "level",
    catalogue: {
      role: { slug: "frontend", name: "Frontend" },
      level: { slug: "mid", name: "Mid-level" },
      stack: null,
    },
    endedAt: new Date("2026-09-28T00:00:00Z"),
    questions: Array.from({ length: ANSWERS }, (_, position) => ({
      id: `q${position}`,
      position,
      askedAt: new Date("2026-09-28T00:00:00Z"),
      snapshot: snapshot(),
      evaluation: null,
    })),
    turns: Array.from({ length: ANSWERS }, (_, position) => [
      {
        sessionQuestionId: `q${position}`,
        seq: position * 2,
        speaker: "interviewer",
        followUpIndex: null,
        text: "Why does it do that?",
      },
      {
        sessionQuestionId: `q${position}`,
        seq: position * 2 + 1,
        speaker: "candidate",
        followUpIndex: null,
        text: "Because they said this, at some length.",
      },
    ]).flat(),
  } as unknown as SessionToEvaluate;
}

function snapshot(): unknown {
  return {
    slug: "a-question",
    type: "technical",
    topic: {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "javascript-fundamentals",
      name: "JavaScript fundamentals",
      description: null,
    },
    prompt: "Why does it do that?",
    context: null,
    difficulty: 3,
    ideal_points: ["Because of the main thread."],
    rubric: {
      slug: "a-rubric",
      name: "A rubric",
      criteria: [
        {
          position: 0,
          dimension: "Says why",
          description: "Whether they say why.",
          weight: 100,
          levels: {
            "0": "No.",
            "1": "Barely.",
            "2": "Partly.",
            "3": "Yes.",
            "4": "Yes, and more.",
          },
        },
      ],
    },
    planned_follow_ups: [],
  };
}
