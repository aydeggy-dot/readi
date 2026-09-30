"""The worker's side of the three internal routes, driven through a mock transport.

No network and no key. What these assert is the part that is easy to get wrong and expensive to
discover in phase 4: the URL, the service token, which statuses are retried, and that nothing here
logs or echoes a body — the bodies are whole exchanges of a candidate's words.
"""

import json

import httpx2
import pytest

from readi_worker.contracts import InterviewTurnPush, VoiceLegEndedRequest
from readi_worker.voice.api_client import (
    MAX_ATTEMPTS,
    VoiceApiClient,
    VoiceApiError,
    new_exchange_id,
)
from tests.interview_fixtures import SESSION_ID, bundle

BASE = "http://api.test"


def push_body() -> InterviewTurnPush:
    deck = bundle()
    return InterviewTurnPush.model_validate(
        {
            "exchange_id": new_exchange_id(),
            "state": "question",
            "ended": False,
            "end_reason": None,
            "turns": [
                {
                    "seq": 0,
                    "speaker": "interviewer",
                    "state": "question",
                    "question_position": 0,
                    "follow_up_index": None,
                    "text": deck.questions[0].prompt,
                    "criteria_covered": None,
                }
            ],
            "engine_snapshot": {
                "version": 1,
                "state": "question",
                "current_question": 0,
                "next_seq": 1,
                "questions_asked": 1,
                "progress": [
                    {
                        "position": index,
                        "asked": index == 0,
                        "probes_asked": [],
                        "probes_covered": [],
                    }
                    for index in range(len(deck.questions))
                ],
                "end_reason": None,
            },
            "prompt_versions": {"interview_question": 2},
            "ai_calls": [],
            "latency": [],
        }
    )


def leg_body() -> VoiceLegEndedRequest:
    return VoiceLegEndedRequest.model_validate(
        {
            "leg_id": new_exchange_id(),
            "reason": "completed",
            "voice_seconds": 812,
            "turns_spoken": 9,
            "quality": {
                "rtt_ms_p50": 90,
                "rtt_ms_p95": 260,
                "packet_loss_percent": 1.5,
                "reconnects": 1,
            },
        }
    )


class Recorder:
    """A mock transport that records every request and answers from a script."""

    def __init__(self, *statuses: tuple[int, object]) -> None:
        self.script = list(statuses)
        self.requests: list[httpx2.Request] = []

    def transport(self) -> httpx2.MockTransport:
        def handle(request: httpx2.Request) -> httpx2.Response:
            self.requests.append(request)
            status, payload = self.script.pop(0) if self.script else (200, {})
            return httpx2.Response(status, json=payload)

        return httpx2.MockTransport(handle)


def client(recorder: Recorder) -> VoiceApiClient:
    return VoiceApiClient(BASE, "service-token", transport=recorder.transport(), sleep=0.0)


# ---- The routes.


async def test_the_session_is_pulled_over_the_service_token_channel() -> None:
    deck = bundle()
    recorder = Recorder(
        (
            200,
            {
                "bundle": deck.model_dump(mode="json"),
                "engine_snapshot": None,
                "resume": False,
                "room": "interview-1",
                "ends_at": "2026-09-30T10:15:00Z",
                "now": "2026-09-30T10:00:00Z",
                "voice_seconds_remaining": 900,
            },
        )
    )
    api = client(recorder)
    start = await api.voice_session(SESSION_ID)
    await api.aclose()

    assert start.resume is False
    assert start.voice_seconds_remaining == 900
    request = recorder.requests[0]
    assert request.method == "GET"
    assert str(request.url) == f"{BASE}/api/internal/interviews/{SESSION_ID}/voice-session"
    assert request.headers["authorization"] == "Bearer service-token"


async def test_a_push_carries_the_exchange_and_the_session_is_in_the_path() -> None:
    recorder = Recorder(
        (200, {"state": "question", "status": "in_progress", "ended": False, "duplicate": False})
    )
    api = client(recorder)
    body = push_body()
    answer = await api.push(SESSION_ID, body)
    await api.aclose()

    assert answer.duplicate is False
    request = recorder.requests[0]
    assert str(request.url) == f"{BASE}/api/internal/interviews/{SESSION_ID}/turns"
    sent = json.loads(request.content)
    assert sent["exchange_id"] == str(body.exchange_id)
    assert "session_id" not in sent


async def test_a_duplicate_is_the_expected_answer_to_a_retry() -> None:
    recorder = Recorder(
        (200, {"state": "question", "status": "in_progress", "ended": False, "duplicate": True})
    )
    api = client(recorder)
    answer = await api.push(SESSION_ID, push_body())
    await api.aclose()
    assert answer.duplicate is True


async def test_the_leg_is_metered_on_its_own_route() -> None:
    recorder = Recorder((200, {"duplicate": False, "voice_seconds_total": 812}))
    api = client(recorder)
    answer = await api.leg_ended(SESSION_ID, leg_body())
    await api.aclose()
    assert answer.voice_seconds_total == 812
    assert str(recorder.requests[0].url).endswith(f"/{SESSION_ID}/voice-ended")


# ---- Failure.


async def test_a_transient_failure_is_retried() -> None:
    recorder = Recorder(
        (503, {"message": "restarting"}),
        (200, {"state": "question", "status": "in_progress", "ended": False, "duplicate": False}),
    )
    api = client(recorder)
    await api.push(SESSION_ID, push_body())
    await api.aclose()
    assert len(recorder.requests) == 2


async def test_a_refusal_is_not_retried() -> None:
    # A 400 is a contract problem: sending it again is a second identical mistake.
    recorder = Recorder((400, {"code": "bad_request", "detail": "candidate said …"}))
    api = client(recorder)
    with pytest.raises(VoiceApiError) as raised:
        await api.push(SESSION_ID, push_body())
    await api.aclose()
    assert len(recorder.requests) == 1
    assert raised.value.status == 400
    assert raised.value.code == "http_400"
    # The body is not in the error: a validation error quotes what it rejected.
    assert "candidate" not in str(raised.value)


async def test_retries_are_bounded() -> None:
    recorder = Recorder(*[(503, {}) for _ in range(MAX_ATTEMPTS + 2)])
    api = client(recorder)
    with pytest.raises(VoiceApiError):
        await api.push(SESSION_ID, push_body())
    await api.aclose()
    assert len(recorder.requests) == MAX_ATTEMPTS


async def test_a_connection_error_reports_its_type_and_nothing_else() -> None:
    def handle(_request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("connection refused to 10.0.0.4")

    api = VoiceApiClient(BASE, "service-token", transport=httpx2.MockTransport(handle), sleep=0.0)
    with pytest.raises(VoiceApiError) as raised:
        await api.voice_session(SESSION_ID)
    await api.aclose()
    assert raised.value.code == "ConnectError"
    assert "10.0.0.4" not in str(raised.value)


def test_every_exchange_id_is_its_own() -> None:
    assert new_exchange_id() != new_exchange_id()
