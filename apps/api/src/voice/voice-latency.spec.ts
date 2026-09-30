import type { VoiceTurnLatency } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { NO_TURNS, summarise } from "./voice-latency";

const turn = (overrides: Partial<VoiceTurnLatency> = {}): VoiceTurnLatency => ({
  turn_seq: 1,
  speech_ended_at: "2026-09-30T10:00:00.000Z",
  endpoint_ms: 400,
  stt_final_ms: 200,
  acknowledged_ms: 120,
  coverage_ms: 900,
  phrasing_ms: 800,
  tts_first_byte_ms: 250,
  response_ms: 2_000,
  prefetched: false,
  interim_coverage: false,
  interrupted: false,
  ...overrides,
});

describe("summarising voice latency", () => {
  it("reports nothing rather than zero when there is nothing to report", () => {
    expect(NO_TURNS.turns).toBe(0);
    expect(NO_TURNS.response).toEqual({ n: 0, p50_ms: null, p95_ms: null });
    expect(NO_TURNS.coverage).toEqual({ n: 0, p50_ms: null, p95_ms: null });
  });

  /**
   * The rule the whole module exists for. Lever 2's entire effect is that `phrasing_ms` **disappears**
   * on a prefetched opening — so averaging a missing stage as zero would report the lever as an
   * instantaneous phrasing call and make the ladder impossible to read.
   */
  it("leaves a stage that did not happen out of its own spread, rather than counting it as instant", () => {
    const summary = summarise([
      turn({ turn_seq: 1, phrasing_ms: 800 }),
      turn({ turn_seq: 2, phrasing_ms: null, prefetched: true }),
      turn({ turn_seq: 3, phrasing_ms: null, prefetched: true }),
    ]);
    expect(summary.turns).toBe(3);
    expect(summary.phrasing).toEqual({ n: 1, p50_ms: 800, p95_ms: 800 });
    expect(summary.prefetched).toBe(2);
  });

  it("counts a real zero, because pinned audio genuinely is that fast", () => {
    const summary = summarise([turn({ acknowledged_ms: 0 }), turn({ acknowledged_ms: 40 })]);
    expect(summary.first_audio).toEqual({ n: 2, p50_ms: 0, p95_ms: 40 });
  });

  /** Nearest-rank, from `interviews/pace.ts`: every millisecond printed is a delay somebody waited. */
  it("never interpolates a percentile", () => {
    const summary = summarise(
      [1_000, 1_100, 1_200, 5_000].map((ms, index) => turn({ turn_seq: index, response_ms: ms })),
    );
    expect(summary.response.p50_ms).toBe(1_100);
    expect(summary.response.p95_ms).toBe(5_000);
  });

  it("counts barge-ins, because how often a candidate talks over us is the point of recording it", () => {
    const summary = summarise([turn({ interrupted: true }), turn({ interrupted: false })]);
    expect(summary.interrupted).toBe(1);
  });

  it("gives every stage its own sample size, because they differ by design", () => {
    const summary = summarise([
      turn({ turn_seq: 1, coverage_ms: 900, acknowledged_ms: null }),
      turn({ turn_seq: 2, coverage_ms: null, acknowledged_ms: 100 }),
    ]);
    expect(summary.coverage.n).toBe(1);
    expect(summary.first_audio.n).toBe(1);
    expect(summary.endpoint.n).toBe(2);
  });
});
