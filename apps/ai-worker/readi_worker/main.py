"""FastAPI application factory for the AI worker."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Protocol

import sentry_sdk
from fastapi import FastAPI
from redis.asyncio import Redis

from readi_worker.auth import require_service_token
from readi_worker.cv.parse import CvParser, keyword_extraction
from readi_worker.cv.router import build_cv_router
from readi_worker.embeddings.base import EmbeddingProvider
from readi_worker.embeddings.fake import FakeEmbeddingProvider
from readi_worker.embeddings.router import build_embeddings_router
from readi_worker.embeddings.service import EmbeddingService
from readi_worker.embeddings.voyage import VoyageEmbeddingProvider
from readi_worker.health import SupportsPing, build_health_router
from readi_worker.http_limits import BodySizeLimit
from readi_worker.interview.calls import Interviewer
from readi_worker.interview.fake_script import FakeInterviewerLLMClient
from readi_worker.interview.router import build_interview_router
from readi_worker.interview.service import InterviewService
from readi_worker.interview.state_store import InterviewStateStore, SupportsCache
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


class RedisClient(SupportsPing, SupportsCache, Protocol):
    """What the worker asks of Redis: a ping for `/health`, and a small cache for the engine."""


def _build_llm(settings: Settings) -> tuple[LLMClient, str, str]:
    """The configured LLM client, and the models for CV parsing and for the live interviewer."""
    if settings.llm_provider == "fake":
        # One client, two stand-ins: the interviewer shapes first, the CV keyword extractor behind.
        return FakeInterviewerLLMClient(FunctionLLMClient(keyword_extraction)), "fake", "fake"
    if settings.anthropic_api_key is None:  # guaranteed by Settings validation
        raise RuntimeError("ANTHROPIC_API_KEY missing")
    client = AnthropicLLMClient(
        settings.anthropic_api_key.get_secret_value(), timeout_s=settings.llm_timeout_s
    )
    return client, settings.llm_model_cv_parse, settings.llm_model_interviewer


def _build_embeddings(settings: Settings) -> tuple[EmbeddingProvider, str]:
    """The configured embedding provider and the model to record it under."""
    if settings.embedding_provider == "fake":
        # "fake" as the model too, so the cost table matches it and reports zero (ADR-0007).
        return FakeEmbeddingProvider(settings.embedding_dimensions), "fake"
    if settings.voyage_api_key is None:  # guaranteed by Settings validation
        raise RuntimeError("VOYAGE_API_KEY missing")
    provider = VoyageEmbeddingProvider(
        settings.voyage_api_key.get_secret_value(),
        timeout_s=settings.embedding_timeout_s,
        dimensions=settings.embedding_dimensions,
    )
    return provider, settings.embedding_model


def create_app(
    settings: Settings | None = None,
    redis: RedisClient | None = None,
    llm: LLMClient | None = None,
    embeddings: EmbeddingProvider | None = None,
) -> FastAPI:
    """Build the app. Tests inject `settings`, a fake `redis`, `llm` and `embeddings`; otherwise
    all come from the environment."""
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
        llm, cv_model, interviewer_model = _build_llm(settings)
        owned_llm = llm if isinstance(llm, AnthropicLLMClient) else None
    else:
        cv_model = settings.llm_model_cv_parse
        interviewer_model = settings.llm_model_interviewer

    owned_embeddings: VoyageEmbeddingProvider | None = None
    if embeddings is None:
        embeddings, embedding_model = _build_embeddings(settings)
        owned_embeddings = embeddings if isinstance(embeddings, VoyageEmbeddingProvider) else None
    else:
        embedding_model = settings.embedding_model

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        if owned_redis is not None:
            await owned_redis.aclose()
        if owned_llm is not None:
            await owned_llm.aclose()
        if owned_embeddings is not None:
            await owned_embeddings.aclose()

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
    service_token = require_service_token(settings.service_token)
    app.include_router(build_cv_router(CvParser(llm, cv_model), service_token))
    app.include_router(
        build_embeddings_router(
            EmbeddingService(embeddings, embedding_model, settings.embedding_dimensions),
            service_token,
        )
    )
    app.include_router(
        build_interview_router(
            InterviewService(
                Interviewer(llm, interviewer_model, settings.interview_llm_timeout_s),
                InterviewStateStore(redis, settings.interview_state_ttl_s),
            ),
            service_token,
        )
    )
    return app
