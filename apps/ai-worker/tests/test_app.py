from typing import Any

import pytest
import sentry_sdk
from fastapi.testclient import TestClient

from readi_worker import main
from readi_worker.settings import Settings
from tests.conftest import FakeRedis


def test_sentry_disabled_without_dsn(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kwargs: calls.append(kwargs))

    main.create_app(settings, redis=FakeRedis())

    assert calls == []


def test_sentry_never_sends_bodies_or_locals(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    # CLAUDE.md §5: candidate text (answers, CVs) must never reach Sentry.
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kwargs: calls.append(kwargs))
    with_dsn = settings.model_copy(update={"sentry_dsn": "https://key@example.ingest.sentry.io/1"})

    main.create_app(with_dsn, redis=FakeRedis())

    assert len(calls) == 1
    assert calls[0]["send_default_pii"] is False
    assert calls[0]["max_request_body_size"] == "never"
    assert calls[0]["include_local_variables"] is False


def test_docs_disabled_in_production(settings: Settings) -> None:
    production = settings.model_copy(update={"environment": "production"})

    with TestClient(main.create_app(production, redis=FakeRedis())) as client:
        assert client.get("/openapi.json").status_code == 404
        assert client.get("/docs").status_code == 404
        assert client.get("/health").status_code == 200


def test_docs_available_outside_production(settings: Settings) -> None:
    with TestClient(main.create_app(settings, redis=FakeRedis())) as client:
        assert client.get("/openapi.json").status_code == 200
