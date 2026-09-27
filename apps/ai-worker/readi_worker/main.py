"""FastAPI application factory for the AI worker."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import NamedTuple, Protocol

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
from readi_worker.evaluation.calls import Evaluator
from readi_worker.evaluation.fake_script import FakeEvaluatorLLMClient
from readi_worker.evaluation.router import build_evaluation_router
from readi_worker.evaluation.service import EvaluationService
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
from readi_worker.tracing import TracedLLMClient, Tracer, build_tracer, build_tracing_router


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


logger = logging.getLogger(__name__)


class Models(NamedTuple):
    """Which model each kind of call uses. Three, because they are three different trades."""

    cv_parse: str
    interviewer: str
    evaluator: str


def _build_llm(settings: Settings) -> tuple[LLMClient, Models]:
    """The configured LLM client, and the model for each kind of call."""
    if settings.llm_provider == "fake":
        # One client, three stand-ins, tried in order: the evaluator's shape, then the
        # interviewer's, then the CV keyword extractor behind both. Each recognises its own output
        # type and passes anything else along, so a fourth call shape is a link, not an edit.
        fake = FakeEvaluatorLLMClient(
            FakeInterviewerLLMClient(FunctionLLMClient(keyword_extraction))
        )
        return fake, Models("fake", "fake", "fake")
    if settings.anthropic_api_key is None:  # guaranteed by Settings validation
        raise RuntimeError("ANTHROPIC_API_KEY missing")
    client = AnthropicLLMClient(
        settings.anthropic_api_key.get_secret_value(), timeout_s=settings.llm_timeout_s
    )
    return client, Models(
        settings.llm_model_cv_parse,
        settings.llm_model_interviewer,
        settings.llm_model_evaluator,
    )


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
    tracer: Tracer | None = None,
) -> FastAPI:
    """Build the app. Tests inject `settings`, a fake `redis`, `llm`, `embeddings` and `tracer`;
    otherwise all come from the environment."""
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

    # `NullTracer` unless both Langfuse keys are set — local development, CI and e2e (ADR-0008).
    tracer = tracer if tracer is not None else build_tracer(settings)

    owned_llm: AnthropicLLMClient | None = None
    if llm is None:
        llm, models = _build_llm(settings)
        owned_llm = llm if isinstance(llm, AnthropicLLMClient) else None
    else:
        models = Models(
            settings.llm_model_cv_parse,
            settings.llm_model_interviewer,
            settings.llm_model_evaluator,
        )
    # Tracing goes on here, once, between the provider and everything that calls it: every model
    # call the worker will ever make is traced by construction rather than by remembering to.
    llm = TracedLLMClient(llm, tracer)

    # Which provider this process is armed with, once, at startup. `fake` is the resting state and a
    # paid run is armed on the command line for its own length (`.env.example`), so the one thing an
    # operator needs before spending money is a way to tell the two apart from outside the process —
    # and the first two paid runs were each diagnosed twice partly because there was not one. Names
    # only: the key is a `SecretStr` and never goes near a log.
    logger.info(
        "llm provider=%s cv_parse=%s interviewer=%s evaluator=%s tracing=%s",
        settings.llm_provider,
        models.cv_parse,
        models.interviewer,
        models.evaluator,
        "langfuse" if settings.langfuse_public_key else "off",
    )

    owned_embeddings: VoyageEmbeddingProvider | None = None
    if embeddings is None:
        embeddings, embedding_model = _build_embeddings(settings)
        owned_embeddings = embeddings if isinstance(embeddings, VoyageEmbeddingProvider) else None
    else:
        embedding_model = settings.embedding_model

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        await tracer.aclose()
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
    app.include_router(build_cv_router(CvParser(llm, models.cv_parse, tracer), service_token))
    app.include_router(
        build_embeddings_router(
            EmbeddingService(embeddings, embedding_model, settings.embedding_dimensions),
            service_token,
        )
    )
    app.include_router(
        build_interview_router(
            InterviewService(
                Interviewer(llm, models.interviewer, settings.interview_llm_timeout_s),
                InterviewStateStore(redis, settings.interview_state_ttl_s),
                tracer,
            ),
            service_token,
        )
    )
    app.include_router(
        build_evaluation_router(
            EvaluationService(
                Evaluator(llm, models.evaluator, settings.evaluation_llm_timeout_s), tracer
            ),
            service_token,
        )
    )
    app.include_router(build_tracing_router(tracer, service_token))
    return app
