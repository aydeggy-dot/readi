import asyncio
import os

import pytest

from readi_worker.settings import Settings

# Integration tests use the Redis from infra/docker-compose.yml unless REDIS_URL is set (as in CI).
LOCAL_REDIS_URL = "redis://127.0.0.1:16379/0"


class FakeRedis:
    """Stands in for redis.asyncio.Redis in unit tests."""

    def __init__(self, *, error: Exception | None = None, delay_s: float = 0.0) -> None:
        self.error = error
        self.delay_s = delay_s

    async def ping(self) -> bool:
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if self.error is not None:
            raise self.error
        return True


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        redis_url=os.environ.get("REDIS_URL", LOCAL_REDIS_URL),  # type: ignore[arg-type]  # validated
        health_check_timeout_ms=100,
    )
