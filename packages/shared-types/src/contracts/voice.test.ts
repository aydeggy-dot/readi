import { describe, expect, it } from "vitest";
import { ENGINE_SNAPSHOT_VERSION, VOICE_LIMITS } from "../constants.js";
import { InterviewTurn, type TranscriptWord } from "./interviews.js";
import { InterviewTurnPush, VoiceTurnLatency } from "./voice.js";

const word = (text: string): TranscriptWord => ({
  text,
  start_ms: 0,
  end_ms: 100,
  confidence: 0.9,
});

const turn = (voice?: unknown) => ({
  seq: 1,
  speaker: "candidate",
  state: "question",
  question_position: 0,
  follow_up_index: null,
  text: "we queue the write and retry it",
  criteria_covered: null,
  ...(voice === undefined ? {} : { voice }),
});

const snapshot = {
  version: ENGINE_SNAPSHOT_VERSION,
  state: "question",
  current_question: 0,
  next_seq: 3,
  questions_asked: 1,
  progress: [{ position: 0, asked: true, probes_asked: [], probes_covered: [] }],
  end_reason: null,
};

const push = (over: Record<string, unknown> = {}) => ({
  exchange_id: "3f1a1e4c-0b5a-4f7e-9b1a-2c3d4e5f6a7b",
  state: "follow_up",
  ended: false,
  end_reason: null,
  turns: [turn()],
  engine_snapshot: snapshot,
  prompt_versions: { interview_followup: 1 },
  ai_calls: [],
  latency: [],
  ...over,
});

const latency = (over: Record<string, unknown> = {}) => ({
  turn_seq: 2,
  speech_ended_at: "2026-09-29T10:00:00.000Z",
  endpoint_ms: 420,
  stt_final_ms: 560,
  acknowledged_ms: 180,
  coverage_ms: 1_100,
  phrasing_ms: 900,
  tts_first_byte_ms: 260,
  response_ms: 2_100,
  prefetched: false,
  interim_coverage: false,
  interrupted: false,
  ...over,
});

/**
 * The reason `voice` is `nullish` and not `nullable`: the worker's generated Pydantic model omits an
 * unset optional field or dumps it as `null`, and a text-mode turn has neither. Both spellings of
 * "nothing" cross this boundary, and the API validates every worker response with Zod — so a contract
 * that accepted only one of them would fail every text interview the first time the other appeared.
 */
describe("a turn's voice block", () => {
  it("is absent on a text-mode turn", () => {
    expect(InterviewTurn.parse(turn()).voice).toBeUndefined();
  });

  it("accepts null, which is what the worker dumps when it has nothing to say", () => {
    expect(InterviewTurn.parse(turn(null)).voice).toBeNull();
  });

  it("carries word timings and the barge-in facts together", () => {
    const parsed = InterviewTurn.parse(
      turn({
        words: [word("we"), word("queue")],
        stt_confidence: 0.94,
        spoken_ms: null,
        interrupted: false,
      }),
    );
    expect(parsed.voice?.words).toHaveLength(2);
  });

  it("bounds the word timings, because an answer is bounded", () => {
    const tooMany = Array.from({ length: VOICE_LIMITS.maxWordsPerTurn + 1 }, () => word("and"));
    expect(
      InterviewTurn.safeParse(
        turn({ words: tooMany, stt_confidence: null, spoken_ms: null, interrupted: false }),
      ).success,
    ).toBe(false);
  });
});

/**
 * A push means the exchange completed — that is the difference between this and
 * `InterviewAdvanceResponse`, which carries an `error` and a nullable snapshot because it is also the
 * shape of a refusal. A refused voice exchange produces no push at all, so neither has anywhere to go.
 */
describe("InterviewTurnPush", () => {
  it("accepts a completed exchange", () => {
    expect(InterviewTurnPush.safeParse(push()).success).toBe(true);
  });

  it("refuses a null engine snapshot", () => {
    expect(InterviewTurnPush.safeParse(push({ engine_snapshot: null })).success).toBe(false);
  });

  it("refuses an empty batch", () => {
    expect(InterviewTurnPush.safeParse(push({ turns: [] })).success).toBe(false);
  });

  it("has no error field to hide a refusal in", () => {
    const parsed = InterviewTurnPush.parse(push({ error: "bad_request" }));
    expect(parsed).not.toHaveProperty("error");
  });
});

/**
 * Which stages are null says what the engine did — no coverage call, a prefetched opening, audio that
 * was already rendered. The two the latency targets are read against are never null, because a turn
 * the candidate waited for always has both.
 */
describe("VoiceTurnLatency", () => {
  it("allows every optional stage to be absent at once", () => {
    const skipped = latency({
      acknowledged_ms: null,
      coverage_ms: null,
      phrasing_ms: null,
      tts_first_byte_ms: null,
      prefetched: true,
    });
    expect(VoiceTurnLatency.safeParse(skipped).success).toBe(true);
  });

  it.each(["endpoint_ms", "stt_final_ms", "response_ms"])("requires %s", (field) => {
    expect(VoiceTurnLatency.safeParse(latency({ [field]: null })).success).toBe(false);
  });
});
