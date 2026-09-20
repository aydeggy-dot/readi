"""`POST /embeddings`: the route, its auth, and what it reports for `ai_call_log`."""

import uuid

import pytest
from fastapi.testclient import TestClient

from readi_worker import main
from readi_worker.embeddings.base import EmbeddingProvider
from readi_worker.embeddings.fake import (
    FakeEmbeddingError,
    FakeEmbeddingProvider,
    ScriptedEmbeddingProvider,
)
from readi_worker.settings import Settings
from tests.conftest import SERVICE_TOKEN, FakeRedis

AUTH = {"authorization": f"Bearer {SERVICE_TOKEN}"}


@pytest.fixture
def embedding_settings(settings: Settings) -> Settings:
    return settings.model_copy(update={"embedding_dimensions": 8, "embedding_provider": "fake"})


def client(settings: Settings, embeddings: EmbeddingProvider) -> TestClient:
    return TestClient(main.create_app(settings, redis=FakeRedis(), embeddings=embeddings))


def body(*texts: str) -> dict[str, object]:
    return {"request_id": str(uuid.uuid4()), "texts": list(texts)}


def test_requires_the_service_token(embedding_settings: Settings) -> None:
    with client(embedding_settings, FakeEmbeddingProvider(8)) as http:
        assert http.post("/embeddings", json=body("one")).status_code == 401
        wrong = {"authorization": "Bearer " + "x" * 40}
        assert http.post("/embeddings", json=body("one"), headers=wrong).status_code == 401


def test_embeds_and_reports_the_call(embedding_settings: Settings) -> None:
    with client(embedding_settings, FakeEmbeddingProvider(8)) as http:
        response = http.post("/embeddings", json=body("one", "two"), headers=AUTH)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["error"] is None
    assert payload["dimensions"] == 8
    assert len(payload["embeddings"]) == 2
    call = payload["ai_calls"][0]
    assert call["purpose"] == "embedding"
    assert call["unit_kind"] == "tokens"
    assert call["output_units"] == 0
    assert call["cost_micro_usd"] == 0  # the fake costs nothing


def test_a_provider_failure_is_an_answer_with_a_recorded_call(embedding_settings: Settings) -> None:
    scripted = ScriptedEmbeddingProvider([FakeEmbeddingError("ConnectError")])
    with client(embedding_settings, scripted) as http:
        response = http.post("/embeddings", json=body("one"), headers=AUTH)

    # Not a 5xx: the API needs the record to persist, and it decides what to do about the failure.
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["error"] == "ConnectError"
    assert payload["embeddings"] == []
    assert payload["ai_calls"][0]["status"] == "error"
    assert payload["ai_calls"][0]["error_code"] == "ConnectError"


def test_refuses_a_vector_that_would_not_fit_the_column(embedding_settings: Settings) -> None:
    # A model configured to a different length would otherwise be stored as an unsearchable row.
    scripted = ScriptedEmbeddingProvider([[[0.1, 0.2, 0.3]]])
    with client(embedding_settings, scripted) as http:
        response = http.post("/embeddings", json=body("one"), headers=AUTH)

    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["error"] == "wrong_dimensions"
    assert payload["ai_calls"][0]["status"] == "ok"  # the provider answered; we refused it


def test_rejects_invalid_requests(embedding_settings: Settings) -> None:
    with client(embedding_settings, FakeEmbeddingProvider(8)) as http:
        assert http.post("/embeddings", json={"texts": ["one"]}, headers=AUTH).status_code == 422
        assert http.post("/embeddings", json=body(), headers=AUTH).status_code == 422
        too_many = body(*[f"text {index}" for index in range(33)])
        assert http.post("/embeddings", json=too_many, headers=AUTH).status_code == 422
