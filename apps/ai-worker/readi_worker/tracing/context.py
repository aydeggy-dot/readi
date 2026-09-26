"""Two pieces of ambient state that tracing needs and nothing else should read.

Both are context variables rather than arguments, and each for a different reason.

**The trace id** is read where an `AiCallRecord` is built — three files, six functions — so that
`ai_call_log.langfuse_trace_id` points at the trace holding that call's prompt (ADR-0007/0008).
Threading it through would mean a tracing parameter on every function between the router and the
record, in code whose whole point is that it does not know about tracing.

**The call label** is the opposite problem. Tracing wraps `LLMClient`, which is where the prompt
and the answer are, and that interface deliberately knows nothing about *why* it is being called —
"interviewer" and "follow_up" are the same call to it. So the caller, which does know, leaves the
word here. Without it every generation in Langfuse would be called "llm" and the traces would be
unreadable, which defeats the point of having them.

Both are read-only outside this module. `contextvars` are task-local, so concurrent requests do not
see each other's values, which a module global would not give us.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

#: The Langfuse trace the current task is running under; None whenever tracing is off.
_TRACE_ID: ContextVar[str | None] = ContextVar("readi_trace_id", default=None)

#: What the next model call is for. Falls back to a name that is at least honest.
_CALL_LABEL: ContextVar[str] = ContextVar("readi_call_label", default="llm")


def current_trace_id() -> str | None:
    """The trace this call belongs to, for `AiCallRecord.langfuse_trace_id`."""
    return _TRACE_ID.get()


def current_call_label() -> str:
    """What to name the generation in Langfuse."""
    return _CALL_LABEL.get()


@contextmanager
def trace_id(value: str | None) -> Iterator[None]:
    """Publish the trace id for the duration of one traced request."""
    token = _TRACE_ID.set(value)
    try:
        yield
    finally:
        _TRACE_ID.reset(token)


@contextmanager
def call_label(value: str) -> Iterator[None]:
    """Name what the model calls made inside are for, e.g. "coverage" or "cv_parse"."""
    token = _CALL_LABEL.set(value)
    try:
        yield
    finally:
        _CALL_LABEL.reset(token)
