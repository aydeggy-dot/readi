import asyncio
import os

import pytest

from readi_worker.settings import Settings

# Integration tests use the Redis from infra/docker-compose.yml unless REDIS_URL is set (as in CI).
LOCAL_REDIS_URL = "redis://127.0.0.1:16379/0"
SERVICE_TOKEN = "test-service-token-0123456789abcdefghijkl"


class FakeRedis:
    """Stands in for redis.asyncio.Redis in unit tests: a ping and an in-memory string store.

    The store half is real rather than a stub, because the interview engine caches the session
    bundle here and a test that never hits the cache never exercises the path the API uses on every
    turn after the first.
    """

    def __init__(self, *, error: Exception | None = None, delay_s: float = 0.0) -> None:
        self.error = error
        self.delay_s = delay_s
        self.values: dict[str, str] = {}

    async def ping(self) -> bool:
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if self.error is not None:
            raise self.error
        return True

    async def get(self, name: str) -> str | None:
        self._check()
        return self.values.get(name)

    async def set(self, name: str, value: str, ex: int | None = None) -> bool:
        self._check()
        self.values[name] = value
        return True

    async def delete(self, *names: str) -> int:
        self._check()
        return sum(self.values.pop(name, None) is not None for name in names)

    def _check(self) -> None:
        if self.error is not None:
            raise self.error


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        redis_url=os.environ.get("REDIS_URL", LOCAL_REDIS_URL),  # type: ignore[arg-type]  # validated
        health_check_timeout_ms=100,
        service_token=SERVICE_TOKEN,  # type: ignore[arg-type]  # validated
        llm_provider="fake",
    )
