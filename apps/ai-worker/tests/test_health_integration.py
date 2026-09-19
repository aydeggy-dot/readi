"""Runs against a real Redis (infra/docker-compose.yml locally, a service container in CI)."""

from fastapi.testclient import TestClient

from readi_worker.main import create_app
from readi_worker.settings import Settings


def test_health_against_real_redis(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        response = client.get("/health")

    assert response.status_code == 200, (
        "Redis unreachable: start infra/docker-compose.yml or set REDIS_URL"
    )
    assert response.json()["checks"]["redis"]["status"] == "ok"
