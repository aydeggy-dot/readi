import type {
  VoiceLatencySpread,
  VoiceLatencySummary,
  VoiceTurnLatency,
} from "@readi/shared-types";
import { quantile } from "../interviews/pace";

/**
 * What a set of voice turns says about the latency budget (ADR-0019 §5). Pure: no clock, no database,
 * no constants of its own — the two targets are served beside the figures, from `VOICE_LIMITS`.
 *
 * ## Two rules, and both of them are about honesty rather than arithmetic
 *
 * **A stage with no samples is null, not zero.** Most stages are legitimately absent on most turns:
 * `coverage_ms` is null when the engine had no probe left worth judging, `phrasing_ms` when the
 * opening was prefetched during the previous answer, `tts_first_byte_ms` when the audio had already
 * been rendered. Averaging those as zeros would make every lever look like a speed-up and would make
 * the ladder impossible to read — the whole point of lever 2 is that `phrasing_ms` **disappears**.
 *
 * **Every stage carries its own `n`.** They differ, by design, and a p50 over three turns is not the
 * same claim as a p50 over three hundred. It is the rule the pace report already follows, for the same
 * reason: the first paid interview run's figures were read as constants until somebody asked how many
 * answers they came from.
 *
 * `quantile` is `interviews/pace.ts`'s — nearest-rank, never interpolated, so every millisecond
 * printed is a delay somebody really waited. Imported rather than copied: two percentile functions
 * that round differently would make the admin view and the phase 8 report disagree about the same run.
 */
export function summarise(turns: readonly VoiceTurnLatency[]): VoiceLatencySummary {
  const of = (pick: (turn: VoiceTurnLatency) => number | null): VoiceLatencySpread =>
    spread(turns.flatMap((turn) => valueOf(pick(turn))));
  return {
    turns: turns.length,
    first_audio: of((turn) => turn.acknowledged_ms),
    response: of((turn) => turn.response_ms),
    endpoint: of((turn) => turn.endpoint_ms),
    stt_final: of((turn) => turn.stt_final_ms),
    coverage: of((turn) => turn.coverage_ms),
    phrasing: of((turn) => turn.phrasing_ms),
    tts_first_byte: of((turn) => turn.tts_first_byte_ms),
    prefetched: turns.filter((turn) => turn.prefetched).length,
    interrupted: turns.filter((turn) => turn.interrupted).length,
  };
}

/** Zero is a measurement (pinned audio really is that fast); null and NaN are not. */
function valueOf(value: number | null): number[] {
  return value === null || !Number.isFinite(value) ? [] : [value];
}

function spread(values: readonly number[]): VoiceLatencySpread {
  if (values.length === 0) return { n: 0, p50_ms: null, p95_ms: null };
  return {
    n: values.length,
    p50_ms: Math.round(quantile(values, 0.5)),
    p95_ms: Math.round(quantile(values, 0.95)),
  };
}

/** The empty summary, so a session with no samples yet still has a shape to render. */
export const NO_TURNS: VoiceLatencySummary = summarise([]);
