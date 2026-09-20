"""FastAPI application factory for the AI worker."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from redis.asyncio import Redis

from readi_worker.auth import require_service_token
from readi_worker.cv.parse import CvParser, keyword_extraction
from readi_worker.cv.router import build_cv_router
from readi_worker.health import SupportsPing, build_health_router
from readi_worker.http_limits import BodySizeLimit
from readi_worker.llm.anthropic_client import AnthropicLLMClient
from readi_worker.llm.base import LLMClient
from readi_worker.llm.fake import FunctionLLMClient
from readi_worker.logging_config import install_pii_filter
from readi_worker.settings import Settings, load_settings


def _init_sentry(settings: Settings) -> None:
    if settings.sentry_dsn is None:
        return  # Sentry is disabled when SENTRY_DSN is absent.
    # CLAUDE.md §5: no transcripts, CVs, emails or phone numbers in Sentry. The Python SDK sends
    # request bodies and stack-frame locals by default, independently of send_default_pii.
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        send_default_pii=False,  # no cookies, auth headers or user IPs
        max_request_body_size="never",  # bodies carry candidate answers and CV text
        include_local_variables=False,  # frame locals can hold the same data
        traces_sample_rate=0.0,
    )


def _build_llm(settings: Settings) -> tuple[LLMClient, str]:
    """The configured LLM client and the model to use for CV parsing."""
    if settings.llm_provider == "fake":
        return FunctionLLMClient(keyword_extraction), "fake"
    if settings.anthropic_api_key is None:  # guaranteed by Settings validation
        raise RuntimeError("ANTHROPIC_API_KEY missing")
    client = AnthropicLLMClient(
        settings.anthropic_api_key.get_secret_value(), timeout_s=settings.llm_timeout_s
    )
    return client, settings.llm_model_cv_parse


def create_app(
    settings: Settings | None = None,
    redis: SupportsPing | None = None,
    llm: LLMClient | None = None,
) -> FastAPI:
    """Build the app. Tests inject `settings`, a fake `redis` and a fake `llm`; otherwise all come
    from the environment."""
    settings = settings if settings is not None else load_settings()
    install_pii_filter()
    _init_sentry(settings)

    timeout_s = settings.health_check_timeout_ms / 1000
    owned_redis: Redis | None = None
    if redis is None:
        owned_redis = Redis.from_url(
            str(settings.redis_url), socket_connect_timeout=timeout_s, socket_timeout=timeout_s
        )
        redis = owned_redis

    owned_llm: AnthropicLLMClient | None = None
    if llm is None:
        llm, cv_model = _build_llm(settings)
        owned_llm = llm if isinstance(llm, AnthropicLLMClient) else None
    else:
        cv_model = settings.llm_model_cv_parse

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        if owned_redis is not None:
            await owned_redis.aclose()
        if owned_llm is not None:
            await owned_llm.aclose()

    # Interactive docs are for development; the worker is internal-only (ADR-0004).
    docs_enabled = settings.environment != "production"
    app = FastAPI(
        title="Readi AI worker",
        version="0.0.0",
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    app.add_middleware(BodySizeLimit)
    app.include_router(build_health_router(redis, timeout_s))
    app.include_router(
        build_cv_router(CvParser(llm, cv_model), require_service_token(settings.service_token))
    )
    return app
