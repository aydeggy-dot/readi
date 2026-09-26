"""The Langfuse implementation, and the only file in the repository that imports the SDK.

Everything here is conditional on keys being present: `build_tracer` returns `NullTracer` without
them and this module is not even imported (`main.py` imports it lazily), so a worker with no
Langfuse configuration does not pay for the OpenTelemetry stack the SDK brings with it.

Three things are worth knowing before changing anything here.

**Masking is set once, on the client.** `mask=` runs over every input, output and metadata value
the SDK is given, which is why no call site has to remember it (ADR-0008).

**Deletion always re-reads page 1.** Deleting shifts the pages under a cursor, so walking
`page=1,2,3…` while deleting skips traces. The loop below asks for page 1 again each time and
stops when a page holds nothing it has not already deleted — which also terminates cleanly against
Langfuse's asynchronous delete, where a just-deleted trace can still be listed for a moment.

**A sweep is bounded.** `MAX_BATCHES` caps one call; the hourly sweep drains the rest. An erasure
that hits the cap is a user with more than 2,000 traces, which is not a shape we have, but the cap
is still the right side to fail on: the alternative is a deletion request that never returns.
"""

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

from langfuse import Langfuse, LangfuseGeneration, propagate_attributes

from readi_worker.tracing.context import trace_id as publish_trace_id
from readi_worker.tracing.mask import mask_personal_data
from readi_worker.tracing.tracer import Generation, Tracer, TraceSubject

logger = logging.getLogger(__name__)

#: Traces fetched, and deleted, per round trip.
BATCH_SIZE = 100
#: Rounds per call: 2,000 traces. The next sweep continues where this one stopped.
MAX_BATCHES = 20


class _LangfuseGeneration(Generation):
    """Wraps one SDK generation handle. Output goes through the client's mask on the way out."""

    def __init__(self, handle: LangfuseGeneration) -> None:
        self._handle = handle

    def succeeded(self, *, output: object, input_tokens: int, output_tokens: int) -> None:
        self._handle.update(
            output=output,
            usage_details={"input": input_tokens, "output": output_tokens},
        )

    def failed(self, *, code: str) -> None:
        # ERROR rather than a dropped span: a provider that refuses or times out is exactly what
        # somebody reading these traces is looking for, and it is invisible in `ai_call_log` prose.
        self._handle.update(level="ERROR", status_message=code)


class LangfuseTracer(Tracer):
    """Tracing on. Constructed only when both keys are present (`build_tracer`)."""

    def __init__(self, client: Langfuse, *, retention_days: int) -> None:
        self._client = client
        self._retention_days = retention_days

    @property
    def enabled(self) -> bool:
        return True

    @contextmanager
    def trace(self, subject: TraceSubject) -> Iterator[None]:
        with (
            self._client.start_as_current_observation(as_type="span", name=subject.name),
            propagate_attributes(
                user_id=subject.user_id,
                session_id=subject.session_id,
                metadata=dict(subject.metadata) or None,
            ),
            # Read *inside* the span: `get_current_trace_id` is context-local, and this id is what
            # every `AiCallRecord` made under it will carry into `ai_call_log`.
            publish_trace_id(self._client.get_current_trace_id()),
        ):
            yield

    @contextmanager
    def generation(self, *, name: str, model: str, system: str, user: str) -> Iterator[Generation]:
        with self._client.start_as_current_observation(
            as_type="generation",
            name=name,
            model=model,
            input={"system": system, "user": user},
        ) as handle:
            yield _LangfuseGeneration(handle)

    async def delete_for_user(self, user_id: str) -> int:
        return await self._delete(user_id=user_id, to_timestamp=None)

    async def delete_expired(self) -> int:
        cutoff = datetime.now(UTC) - timedelta(days=self._retention_days)
        return await self._delete(user_id=None, to_timestamp=cutoff)

    async def _delete(self, *, user_id: str | None, to_timestamp: datetime | None) -> int:
        api = self._client.async_api
        deleted: set[str] = set()
        for _round in range(MAX_BATCHES):
            page = await api.trace.list(
                page=1, limit=BATCH_SIZE, user_id=user_id, to_timestamp=to_timestamp
            )
            ids = [trace.id for trace in page.data if trace.id not in deleted]
            if not ids:
                break
            await api.trace.delete_multiple(trace_ids=ids)
            deleted.update(ids)
        # Ids and counts only — a trace id is opaque, and a user id is already how we log people.
        logger.info("deleted %d langfuse trace(s)", len(deleted))
        return len(deleted)

    async def aclose(self) -> None:
        self._client.flush()
        self._client.shutdown()


def build_langfuse_client(
    *, public_key: str, secret_key: str, host: str, timeout_s: int, environment: str
) -> Langfuse:
    """The configured SDK client. Nothing is sent until a span is created."""
    return Langfuse(
        public_key=public_key,
        secret_key=secret_key,
        # `base_url`, not `host`: the SDK resolves `base_url` -> $LANGFUSE_BASE_URL -> `host`, so a
        # stray LANGFUSE_BASE_URL in the environment would otherwise beat our configured region.
        base_url=host,
        timeout=timeout_s,
        environment=environment,
        mask=mask_personal_data,
    )
