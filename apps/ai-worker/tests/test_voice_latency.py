"""Where a voice turn's time went: the offsets, and the reconstruction of the two model calls."""

from datetime import UTC, datetime

from readi_worker.contracts import AiCallRecord
from readi_worker.voice.latency import SpokenTiming, TurnTiming, stage_offsets

SPEECH_ENDED = datetime(2026, 9, 30, 10, 0, tzinfo=UTC)


def call(purpose: str, latency_ms: int) -> AiCallRecord:
    return AiCallRecord.model_validate(
        {
            "purpose": purpose,
            "provider": "fake",
            "model": "fake",
            "status": "ok",
            "error_code": None,
            "latency_ms": latency_ms,
            "input_units": 10,
            "output_units": 2,
            "cache_write_units": 0,
            "cache_read_units": 0,
            "unit_kind": "tokens",
            "cost_micro_usd": 0,
            "langfuse_trace_id": None,
        }
    )


def timing(**kwargs: object) -> TurnTiming:
    defaults: dict[str, object] = {
        "speech_ended_at": SPEECH_ENDED,
        "started_at": 100.0,
        "endpoint_ms": 400,
        "stt_final_ms": 550,
        "acknowledged_ms": 620,
        "engine_entered_ms": 600,
    }
    defaults.update(kwargs)
    return TurnTiming(**defaults)  # type: ignore[arg-type]  # a test's own keyword soup


# ---- The reconstruction.


def test_the_two_calls_are_laid_end_to_end_from_the_engine() -> None:
    coverage, phrasing = stage_offsets(
        [call("coverage", 900), call("follow_up", 700)], 600, prefetched=False
    )
    assert coverage == 1_500
    assert phrasing == 2_200


def test_a_skipped_coverage_call_reports_nothing_rather_than_zero() -> None:
    coverage, phrasing = stage_offsets([call("interviewer", 800)], 600, prefetched=False)
    assert coverage is None
    assert phrasing == 1_400


def test_a_prefetched_opening_claims_no_phrasing_time() -> None:
    # The call happened during the previous answer; its record rides home with this exchange, and
    # counting it here would bill the candidate for a second they never waited.
    coverage, phrasing = stage_offsets([call("interviewer", 800)], 600, prefetched=True)
    assert (coverage, phrasing) == (None, None)


def test_a_retry_counts_because_the_candidate_waited_for_both() -> None:
    coverage, phrasing = stage_offsets(
        [call("coverage", 900), call("follow_up", 700), call("follow_up", 650)],
        600,
        prefetched=False,
    )
    assert coverage == 1_500
    assert phrasing == 1_500 + 1_350


def test_calls_of_other_purposes_are_not_a_stage_of_this_turn() -> None:
    coverage, phrasing = stage_offsets(
        [call("stt", 120), call("tts", 90), call("evaluator", 4_000)], 600, prefetched=False
    )
    assert (coverage, phrasing) == (None, None)


# ---- The samples.


def test_one_sample_per_spoken_turn() -> None:
    samples = timing(ai_calls=[call("coverage", 900), call("follow_up", 700)]).samples(
        [SpokenTiming(turn_seq=5, response_ms=2_400, tts_first_byte_ms=2_100)]
    )
    assert len(samples) == 1
    sample = samples[0]
    assert sample.turn_seq == 5
    assert sample.endpoint_ms == 400
    assert sample.stt_final_ms == 550
    assert sample.acknowledged_ms is not None
    assert sample.acknowledged_ms.root == 620
    assert sample.coverage_ms is not None
    assert sample.coverage_ms.root == 1_500
    assert sample.phrasing_ms is not None
    assert sample.phrasing_ms.root == 2_200
    assert sample.tts_first_byte_ms is not None
    assert sample.tts_first_byte_ms.root == 2_100
    assert sample.response_ms == 2_400
    assert sample.prefetched is False
    assert sample.interim_coverage is False
    assert sample.speech_ended_at == SPEECH_ENDED


def test_only_the_first_sample_carries_the_acknowledgement() -> None:
    # Two interviewer turns from one answer share the acknowledgement that was played before both;
    # repeating it would double it in every p50 taken over the column.
    samples = timing().samples(
        [
            SpokenTiming(turn_seq=1, response_ms=1_000),
            SpokenTiming(turn_seq=2, response_ms=4_000),
        ]
    )
    assert samples[0].acknowledged_ms is not None
    assert samples[1].acknowledged_ms is None


def test_pinned_audio_reports_no_synthesis() -> None:
    sample = timing().samples([SpokenTiming(turn_seq=1, response_ms=80, prefetched=True)])[0]
    assert sample.prefetched is True
    assert sample.tts_first_byte_ms is None
    assert sample.phrasing_ms is None


def test_an_exchange_that_said_nothing_has_no_samples() -> None:
    assert timing().samples([]) == []


def test_negative_stopwatch_readings_cannot_reach_the_contract() -> None:
    # `VoiceTurnLatency` refuses a negative offset, and a clock adjustment mid-turn must not cost
    # the exchange: it is clamped rather than raised.
    sample = timing(endpoint_ms=-5, acknowledged_ms=-9).samples(
        [SpokenTiming(turn_seq=1, response_ms=-3)]
    )[0]
    assert sample.endpoint_ms == 0
    assert sample.response_ms == 0
    assert sample.acknowledged_ms is not None
    assert sample.acknowledged_ms.root == 0
