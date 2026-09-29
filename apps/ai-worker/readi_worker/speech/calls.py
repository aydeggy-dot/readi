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
from readi_worker.speech.providers import CallPath
from readi_worker.tracing import current_trace_id


def stt_record(
    result: TranscriptionResult,
    *,
    path: CallPath = "batch",
    session_seconds: float | None = None,
) -> AiCallRecord:
    """One transcription.

    `input_units` is always the **audio** seconds, because that is what the row is a record of; the
    cost may nonetheless be computed from `session_seconds`, because AssemblyAI's streaming product
    bills the time the socket was open rather than the audio inside it. The two figures being
    different is the thing `ai_call_log` has to be able to show, so the units column stays audio and
    the cost column says what was billed.

    `path` defaults to `batch` because this module's protocols are batch (see `base.py`); the live
    wrapper phase 3 puts around LiveKit's plugin passes `streaming` and the session length.
    """
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
            "cost_micro_usd": stt_cost_micro_usd(
                result.provider,
                result.model,
                path,
                audio_seconds=seconds,
                session_seconds=session_seconds,
            ),
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
