"""`POST /interview/advance`: the route, its auth, and what it refuses."""

from typing import Any

from fastapi.testclient import TestClient

from readi_worker import main
from readi_worker.settings import Settings
from tests.conftest import SERVICE_TOKEN, FakeRedis
from tests.interview_fixtures import SESSION_ID, at, bundle, question

AUTH = {"authorization": f"Bearer {SERVICE_TOKEN}"}


def client(settings: Settings) -> TestClient:
    return TestClient(main.create_app(settings, redis=FakeRedis()))


def body(action: str = "start", **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "session_id": SESSION_ID,
        "action": action,
        "text": None,
        "now": at(0).isoformat(),
        "bundle": bundle(questions=[question(0)], question_budget=1).model_dump(mode="json"),
        "engine_snapshot": None,
    }
    return payload | overrides


def test_requires_the_service_token(settings: Settings) -> None:
    with client(settings) as http:
        assert http.post("/interview/advance", json=body()).status_code == 401
        wrong = {"authorization": "Bearer " + "x" * 40}
        assert http.post("/interview/advance", json=body(), headers=wrong).status_code == 401


def test_advances_with_the_service_token(settings: Settings) -> None:
    with client(settings) as http:
        response = http.post("/interview/advance", json=body(), headers=AUTH)
    assert response.status_code == 200
    payload = response.json()
    assert payload["state"] == "question"
    assert [turn["state"] for turn in payload["turns"]] == ["intro", "question"]
    assert payload["engine_snapshot"]["version"] == 1
    assert payload["error"] is None


def test_the_whole_exchange_rides_the_response(settings: Settings) -> None:
    """The API needs the turns, the snapshot, the prompt versions and the costs from one call."""
    with client(settings) as http:
        first = http.post("/interview/advance", json=body(), headers=AUTH).json()
        second = http.post(
            "/interview/advance",
            json=body(
                "answer",
                text="I tested the checkout flow end to end.",
                now=at(1).isoformat(),
                engine_snapshot=first["engine_snapshot"],
            ),
            headers=AUTH,
        ).json()
    assert set(second) == {
        "session_id",
        "state",
        "ended",
        "end_reason",
        "turns",
        "engine_snapshot",
        "prompt_versions",
        "ai_calls",
        "error",
    }
    assert second["turns"][0]["speaker"] == "candidate"
    assert second["turns"][0]["criteria_covered"] is not None
    assert second["prompt_versions"]["interview_coverage"] == 1
    assert {call["purpose"] for call in second["ai_calls"]} == {"coverage", "follow_up"}


def test_rejects_a_request_the_contract_does_not_allow(settings: Settings) -> None:
    with client(settings) as http:
        assert http.post("/interview/advance", json=body("sing"), headers=AUTH).status_code == 422
        assert (
            http.post("/interview/advance", json=body(session_id="nope"), headers=AUTH).status_code
            == 422
        )
        # A snapshot from an engine that means something else by the shape.
        stale = {
            "version": 99,
            "state": "question",
            "current_question": 0,
            "next_seq": 2,
            "questions_asked": 1,
            "progress": [],
            "end_reason": None,
        }
        assert (
            http.post(
                "/interview/advance", json=body(engine_snapshot=stale), headers=AUTH
            ).status_code
            == 422
        )


def test_reports_a_redis_miss_rather_than_guessing(settings: Settings) -> None:
    with client(settings) as http:
        refused = http.post(
            "/interview/advance", json=body("answer", text="Yes.", bundle=None), headers=AUTH
        ).json()
    assert refused["error"] == "bundle_required"
    assert refused["turns"] == []
    assert refused["engine_snapshot"] is None
