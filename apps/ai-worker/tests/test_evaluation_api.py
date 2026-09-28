"""`POST /evaluate/answer`: the route, its auth, and what it answers with."""

from typing import Any

from fastapi.testclient import TestClient

from readi_worker import main
from readi_worker.settings import Settings
from tests.conftest import SERVICE_TOKEN, FakeRedis
from tests.evaluation_fixtures import request as evaluation_request

AUTH = {"authorization": f"Bearer {SERVICE_TOKEN}"}


def client(settings: Settings) -> TestClient:
    return TestClient(main.create_app(settings, redis=FakeRedis()))


def body(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = evaluation_request().model_dump(mode="json")
    return payload | overrides


def test_requires_the_service_token(settings: Settings) -> None:
    with client(settings) as http:
        assert http.post("/evaluate/answer", json=body()).status_code == 401
        wrong = {"authorization": "Bearer " + "x" * 40}
        assert http.post("/evaluate/answer", json=body(), headers=wrong).status_code == 401


def test_scores_an_answer_with_the_stand_in_evaluator(settings: Settings) -> None:
    """`LLM_PROVIDER=fake` in the test settings, so this is the path CI and e2e take."""
    with client(settings) as http:
        response = http.post("/evaluate/answer", json=body(), headers=AUTH)

    assert response.status_code == 200
    payload = response.json()
    assert payload["position"] == 1
    assert payload["error"] is None
    assert [entry["criterion"] for entry in payload["evaluation"]["criteria"]] == [0, 1]
    # The stand-in quotes the candidate, so `evidence.py` verified it like any other quote.
    assert payload["evaluation"]["criteria"][0]["evidence"]
    assert payload["ai_calls"][0]["purpose"] == "evaluator"


def test_a_malformed_request_is_refused_before_any_model_call(settings: Settings) -> None:
    with client(settings) as http:
        assert (
            http.post("/evaluate/answer", json=body(position=-1), headers=AUTH).status_code == 422
        )
        assert (
            http.post("/evaluate/answer", json=body(exchange=[]), headers=AUTH).status_code == 422
        )
        no_rubric = body()
        no_rubric["question"]["rubric"]["criteria"] = []
        assert http.post("/evaluate/answer", json=no_rubric, headers=AUTH).status_code == 422
