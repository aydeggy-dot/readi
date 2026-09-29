"""Speech calls as `AiCallRecord`s (ADR-0007), so a voice session's bill is re-derivable.

The same shape as `interview/calls.py`'s records, with two differences that matter: `unit_kind` is
`seconds` for recognition and `characters` for synthesis, and the units go in `input_units` — there
is no output side to bill. `cache_write_units` and `cache_read_units` are zero because neither
vendor caches anything.

A record is written for a failed call too, with zero units and the provider's code, because a call
that failed still took time and still says something about the provider.
"""

from readi_worker.contracts import AiCallRecord
from readi_worker.speech.base import SttError, Synthesis, TranscriptionResult, TtsError
from readi_worker.speech.pricing import stt_cost_micro_usd, tts_cost_micro_usd
from readi_worker.tracing import current_trace_id


def stt_record(result: TranscriptionResult) -> AiCallRecord:
    """One transcription. Billed on audio seconds, rounded up to whole seconds as vendors do."""
    seconds = _billable_seconds(result.audio_seconds)
    return AiCallRecord.model_validate(
        {
            "purpose": "stt",
            "provider": result.provider,
            "model": result.model,
            "status": "ok",
            "error_code": None,
            "latency_ms": result.latency_ms,
            "input_units": seconds,
            "output_units": 0,
            "cache_write_units": 0,
            "cache_read_units": 0,
            "unit_kind": "seconds",
            "cost_micro_usd": stt_cost_micro_usd(result.provider, result.model, seconds),
            "langfuse_trace_id": current_trace_id(),
        }
    )


def stt_error_record(exc: SttError) -> AiCallRecord:
    return AiCallRecord.model_validate(
        {
            "purpose": "stt",
            "provider": exc.provider,
            "model": exc.model,
            "status": "error",
            "error_code": exc.code[:60],
            "latency_ms": exc.latency_ms,
            "input_units": 0,
            "output_units": 0,
            "cache_write_units": 0,
            "cache_read_units": 0,
            "unit_kind": "seconds",
            "cost_micro_usd": 0,
            "langfuse_trace_id": current_trace_id(),
        }
    )


def tts_record(result: Synthesis) -> AiCallRecord:
    """One synthesis. Billed on the characters sent, not on the audio that came back."""
    return AiCallRecord.model_validate(
        {
            "purpose": "tts",
            "provider": result.provider,
            "model": result.model,
            "status": "ok",
            "error_code": None,
            "latency_ms": result.latency_ms,
            "input_units": result.characters,
            "output_units": 0,
            "cache_write_units": 0,
            "cache_read_units": 0,
            "unit_kind": "characters",
            "cost_micro_usd": tts_cost_micro_usd(result.provider, result.model, result.characters),
            "langfuse_trace_id": current_trace_id(),
        }
    )


def tts_error_record(exc: TtsError) -> AiCallRecord:
    return AiCallRecord.model_validate(
        {
            "purpose": "tts",
            "provider": exc.provider,
            "model": exc.model,
            "status": "error",
            "error_code": exc.code[:60],
            "latency_ms": exc.latency_ms,
            "input_units": 0,
            "output_units": 0,
            "cache_write_units": 0,
            "cache_read_units": 0,
            "unit_kind": "characters",
            "cost_micro_usd": 0,
            "langfuse_trace_id": current_trace_id(),
        }
    )


def _billable_seconds(audio_seconds: float) -> int:
    """Whole seconds, rounded **up**: vendors bill the second a syllable started.

    `input_units` is an integer (ADR-0007), so this has to round somewhere; rounding up means our
    estimate is never lower than the invoice, which is the direction a cost estimate should err.
    """
    return max(0, -(-int(audio_seconds * 1_000) // 1_000))
