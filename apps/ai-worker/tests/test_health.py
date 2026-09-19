from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError as RedisConnectionError

from readi_worker.contracts import HealthResponse
from readi_worker.main import create_app
from readi_worker.settings import Settings
from tests.conftest import FakeRedis


def get_health(settings: Settings, redis: FakeRedis) -> tuple[int, HealthResponse]:
    with TestClient(create_app(settings, redis=redis)) as client:
        response = client.get("/health")
    return response.status_code, HealthResponse.model_validate(response.json())


def test_healthy_when_redis_answers(settings: Settings) -> None:
    status_code, body = get_health(settings, FakeRedis())

    assert status_code == 200
    assert body.status == "ok"
    assert body.service == "ai-worker"
    assert body.checks["redis"].status == "ok"


def test_database_is_not_checked(settings: Settings) -> None:
    # ADR-0004: the worker has no database access, so /health must not report on one.
    _, body = get_health(settings, FakeRedis())

    assert set(body.checks) == {"redis"}


def test_unreachable_redis_returns_503_without_details(settings: Settings) -> None:
    status_code, body = get_health(settings, FakeRedis(error=RedisConnectionError("10.1.2.3:6379")))

    assert status_code == 503
    assert body.status == "error"
    assert body.checks["redis"].error == "unreachable"


def test_slow_redis_times_out(settings: Settings) -> None:
    status_code, body = get_health(settings, FakeRedis(delay_s=1.0))

    assert status_code == 503
    assert body.checks["redis"].error == "timeout"


def test_optional_fields_are_omitted_not_null(settings: Settings) -> None:
    with TestClient(create_app(settings, redis=FakeRedis())) as client:
        raw = client.get("/health").json()

    assert "error" not in raw["checks"]["redis"]
