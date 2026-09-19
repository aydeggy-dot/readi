"""`GET /health`. Checks Redis only: the worker has no database access (ADR-0004)."""

import asyncio
import inspect
import logging
import time
from typing import Protocol

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError

from readi_worker.contracts import HealthCheckResult, HealthResponse

logger = logging.getLogger(__name__)


class SupportsPing(Protocol):
    def ping(self) -> object: ...


def _elapsed_ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)


async def check_redis(client: SupportsPing, timeout_s: float) -> HealthCheckResult:
    start = time.perf_counter()
    try:
        async with asyncio.timeout(timeout_s):
            result = client.ping()
            if inspect.isawaitable(result):
                await result
    except TimeoutError:
        logger.warning("redis health check timed out")
        return HealthCheckResult(status="error", latency_ms=_elapsed_ms(start), error="timeout")
    except (RedisError, OSError) as exc:
        logger.warning("redis health check failed: %s", type(exc).__name__)
        return HealthCheckResult(status="error", latency_ms=_elapsed_ms(start), error="unreachable")
    return HealthCheckResult(status="ok", latency_ms=_elapsed_ms(start))


def build_health_router(redis: SupportsPing, timeout_s: float) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/health", response_model=HealthResponse, responses={503: {"model": HealthResponse}}
    )
    async def health() -> JSONResponse:
        checks = {"redis": await check_redis(redis, timeout_s)}
        healthy = all(check.status == "ok" for check in checks.values())
        body = HealthResponse(
            status="ok" if healthy else "error", service="ai-worker", checks=checks
        )
        # exclude_none: optional fields are omitted, never null (the Zod contract has no nulls).
        return JSONResponse(
            status_code=200 if healthy else 503,
            content=body.model_dump(mode="json", exclude_none=True),
        )

    return router
