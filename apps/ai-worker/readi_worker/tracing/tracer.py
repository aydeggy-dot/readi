"""The tracing seam: what the rest of the worker is allowed to know about Langfuse.

Nothing outside `readi_worker/tracing/` imports the Langfuse SDK. Everything asks for a `Tracer`,
and in local development, CI and the e2e run that is `NullTracer` — the keys are absent, nothing is
constructed, nothing is sent and no trace id is minted. That is the same adapter shape as
`LLMClient` and `EmbeddingProvider` (CLAUDE.md "AI provider adapters"), for the same reason: the
code that matters should read the same whether the third party exists or not.

A trace is one **request** — one CV parse, one interview exchange — with a generation inside it per
model call. That granularity is deliberate: `ai_call_log.langfuse_trace_id` is a *trace* id, and an
exchange's two calls (`coverage` then `follow_up`) belong to the same conversation turn and are
only readable together.
"""

from abc import ABC, abstractmethod
from collections.abc import Iterator
from contextlib import AbstractContextManager, contextmanager
from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class TraceSubject:
    """Who and what a trace is about. **Opaque ids only** (ADR-0008).

    There is no field here for a name, an email or a phone number, which is the cheapest way to
    keep the rule: a caller cannot put one on a trace without changing this class first.
    """

    name: str
    user_id: str | None = None
    session_id: str | None = None
    #: Small, non-identifying facts worth filtering on in the Langfuse UI, e.g. the action.
    metadata: dict[str, str] = field(default_factory=dict)


class Generation(ABC):
    """One model call in flight. Closed exactly once, by the tracer's context manager."""

    @abstractmethod
    def succeeded(self, *, output: object, input_tokens: int, output_tokens: int) -> None:
        """The provider answered. `output` is the parsed object, or None if it gave nothing."""

    @abstractmethod
    def failed(self, *, code: str) -> None:
        """The provider could not be reached, refused, or answered unusably."""


class Tracer(ABC):
    """Every tracing operation the worker performs, including the two deletion paths."""

    @property
    @abstractmethod
    def enabled(self) -> bool:
        """False when there are no Langfuse keys. Reported by `POST /traces/delete`."""

    @abstractmethod
    def trace(self, subject: TraceSubject) -> AbstractContextManager[None]:
        """Open a trace for one request; the trace id is published on `context.current_trace_id`."""

    @abstractmethod
    def generation(
        self, *, name: str, model: str, system: str, user: str
    ) -> AbstractContextManager[Generation]:
        """Record one model call, with its prompt, its answer and its token usage."""

    @abstractmethod
    async def delete_for_user(self, user_id: str) -> int:
        """Delete every trace belonging to a user (account erasure, ADR-0011). Returns the count."""

    @abstractmethod
    async def delete_expired(self) -> int:
        """Delete everything past the retention window (ADR-0008). Returns the count."""

    @abstractmethod
    async def aclose(self) -> None:
        """Flush anything buffered and release the client."""


class _NullGeneration(Generation):
    def succeeded(self, *, output: object, input_tokens: int, output_tokens: int) -> None:
        return None

    def failed(self, *, code: str) -> None:
        return None


class NullTracer(Tracer):
    """Tracing off: the worker behaves identically and reaches no third party.

    This is not a test double — it is what runs in development, in CI and in e2e, and it is what
    makes "no keys, no traces" a property of the code rather than of an environment file.
    """

    @property
    def enabled(self) -> bool:
        return False

    @contextmanager
    def trace(self, subject: TraceSubject) -> Iterator[None]:
        yield

    @contextmanager
    def generation(self, *, name: str, model: str, system: str, user: str) -> Iterator[Generation]:
        yield _NullGeneration()

    async def delete_for_user(self, user_id: str) -> int:
        return 0

    async def delete_expired(self) -> int:
        return 0

    async def aclose(self) -> None:
        return None
