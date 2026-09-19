"""FastAPI application factory for the AI worker."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from redis.asyncio import Redis

from readi_worker.health import SupportsPing, build_health_router
from readi_worker.settings import Settings, load_settings


def _init_sentry(settings: Settings) -> None:
    if settings.sentry_dsn is None:
        return  # Sentry is disabled when SENTRY_DSN is absent.
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        send_default_pii=False,  # never send transcripts, emails, phone numbers (CLAUDE.md §5)
        traces_sample_rate=0.0,
    )


def create_app(settings: Settings | None = None, redis: SupportsPing | None = None) -> FastAPI:
    """Build the app. Tests inject `settings` and a fake `redis`; otherwise both come from env."""
    settings = settings if settings is not None else load_settings()
    _init_sentry(settings)

    timeout_s = settings.health_check_timeout_ms / 1000
    owned_redis: Redis | None = None
    if redis is None:
        owned_redis = Redis.from_url(
            str(settings.redis_url), socket_connect_timeout=timeout_s, socket_timeout=timeout_s
        )
        redis = owned_redis

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        if owned_redis is not None:
            await owned_redis.aclose()

    app = FastAPI(title="Readi AI worker", version="0.0.0", lifespan=lifespan)
    app.include_router(build_health_router(redis, timeout_s))
    return app
