"""Choosing a tracer, which is the whole of "tracing is off without keys" (ADR-0008).

One function, and it is the thing `test_tracing.py` holds to: with no keys it returns `NullTracer`
and **does not call the builder**, so the SDK is never constructed, never imported and never
reaches the network. Local development, CI and the e2e run all take that branch.
"""

from collections.abc import Callable

from readi_worker.settings import Settings
from readi_worker.tracing.tracer import NullTracer, Tracer

#: How a live tracer is made. Injectable so a test can prove the branch above without keys, and
#: without paying for the OpenTelemetry stack the SDK brings with it.
LiveTracerFactory = Callable[[Settings], Tracer]


def _langfuse(settings: Settings) -> Tracer:
    # Imported here rather than at module scope: a worker with no Langfuse keys should not load
    # the SDK at all, and this is the only place that decides it needs to.
    from readi_worker.tracing.langfuse_tracer import LangfuseTracer, build_langfuse_client

    assert settings.langfuse_public_key is not None  # noqa: S101 — checked by `build_tracer`
    assert settings.langfuse_secret_key is not None  # noqa: S101 — and by Settings validation
    client = build_langfuse_client(
        public_key=settings.langfuse_public_key.get_secret_value(),
        secret_key=settings.langfuse_secret_key.get_secret_value(),
        host=settings.langfuse_host,
        timeout_s=settings.langfuse_timeout_s,
        environment=settings.environment,
    )
    return LangfuseTracer(client, retention_days=settings.langfuse_retention_days)


def build_tracer(settings: Settings, live: LiveTracerFactory = _langfuse) -> Tracer:
    """`NullTracer` unless both Langfuse keys are set; `Settings` refuses one without the other."""
    if settings.langfuse_public_key is None or settings.langfuse_secret_key is None:
        return NullTracer()
    return live(settings)
