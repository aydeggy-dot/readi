"""Tracing wrapped around the LLM adapter, so no business logic has to remember it.

`TracedLLMClient` is an `LLMClient` that delegates to another one and records a generation around
each call. It is put on in `main.py`, between the provider client and everything that uses it, so
CV parsing, the interview engine and M4's evaluator are traced by existing — there is no "did you
trace this call?" review question, and no call site to forget.

What it deliberately does not do is change behaviour. Every failure path is the inner client's:
`LLMError` propagates untouched after the span is marked, an unusable answer is still an
`LLMResult` with `output=None`, and all retry logic stays where it was. The recording itself is
best-effort — a tracer that can turn a working call into a failing one is worse than no tracer.
"""

import logging
from collections.abc import Callable

from pydantic import BaseModel

from readi_worker.llm.base import LLMClient, LLMError, LLMResult
from readi_worker.tracing.context import current_call_label
from readi_worker.tracing.tracer import Tracer

logger = logging.getLogger(__name__)


class TracedLLMClient:
    """Records every `parse` as a Langfuse generation under the request's trace (ADR-0008)."""

    def __init__(self, inner: LLMClient, tracer: Tracer) -> None:
        self._inner = inner
        self._tracer = tracer
        self.provider = inner.provider

    async def parse[T: BaseModel](
        self,
        *,
        model: str,
        system: str,
        user: str,
        output_type: type[T],
        max_tokens: int,
        timeout_s: float | None = None,
    ) -> LLMResult[T]:
        with self._tracer.generation(
            # The caller left the word here; see `tracing/context.py` for why it is not a
            # parameter on `LLMClient.parse`, which knows nothing about why it is being called.
            name=current_call_label(),
            model=model,
            system=system,
            user=user,
        ) as generation:
            try:
                result = await self._inner.parse(
                    model=model,
                    system=system,
                    user=user,
                    output_type=output_type,
                    max_tokens=max_tokens,
                    timeout_s=timeout_s,
                )
            except LLMError as exc:
                # Bound before the lambda: `exc` is unbound once the except block ends.
                code = exc.code
                _describe(lambda: generation.failed(code=code))
                raise
            output = result.output
            if output is None:
                failure = result.failure or "no_output"
                _describe(lambda: generation.failed(code=failure))
            else:
                _describe(
                    lambda: generation.succeeded(
                        output=output,
                        input_tokens=result.input_tokens,
                        output_tokens=result.output_tokens,
                    )
                )
            return result


def _describe(record: Callable[[], None]) -> None:
    """Describe a call to the tracer, never failing the call because the description failed."""
    try:
        record()
    except Exception:  # see the module docstring: describing a call may not fail it
        logger.warning("could not record an llm call in the trace")
