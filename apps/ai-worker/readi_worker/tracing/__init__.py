"""LLM tracing (ADR-0008): Langfuse, treated as a personal-data store rather than a log sink.

`langfuse_tracer` is **not** re-exported here on purpose — importing this package must not import
the SDK. `factory.build_tracer` reaches for it only when both keys are present.
"""

from readi_worker.tracing.context import call_label, current_call_label, current_trace_id
from readi_worker.tracing.factory import build_tracer
from readi_worker.tracing.llm import TracedLLMClient
from readi_worker.tracing.mask import mask_personal_data, mask_text
from readi_worker.tracing.router import build_tracing_router
from readi_worker.tracing.tracer import Generation, NullTracer, Tracer, TraceSubject

__all__ = [
    "Generation",
    "NullTracer",
    "TraceSubject",
    "TracedLLMClient",
    "Tracer",
    "build_tracer",
    "build_tracing_router",
    "call_label",
    "current_call_label",
    "current_trace_id",
    "mask_personal_data",
    "mask_text",
]
