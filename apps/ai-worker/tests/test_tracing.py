"""Tracing (ADR-0008): what it masks, what it records, and that it is off without keys.

The first group is the one that matters most today, because it is the configuration every
developer, every CI run and every e2e run is in: **no Langfuse keys, nothing constructed, nothing
sent, no trace id anywhere**. The rest holds the enabled path to its shape without a Langfuse
account, by injecting a tracer that records what it was told.
"""

import base64
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

import pytest
from fastapi.testclient import TestClient

from readi_worker import main
from readi_worker.contracts import AiCallRecord, CvParseRequest
from readi_worker.cv.parse import CvExtraction, CvParser
from readi_worker.llm.base import LLMError, LLMResult
from readi_worker.llm.fake import FakeLLMError, ScriptedLLMClient
from readi_worker.settings import Settings
from readi_worker.tracing import (
    Generation,
    NullTracer,
    TracedLLMClient,
    Tracer,
    TraceSubject,
    build_tracer,
    current_trace_id,
    mask_personal_data,
    mask_text,
)
from readi_worker.tracing.context import trace_id as publish_trace_id
from tests.conftest import SERVICE_TOKEN, FakeRedis
from tests.cv_files import CV_LINES, make_pdf
from tests.interview_fixtures import SESSION_ID, at, bundle, question

AUTH = {"authorization": f"Bearer {SERVICE_TOKEN}"}
TRACE_ID = "0af7651916cd43dd8448eb211c80319c"


# ---- What never leaves the worker in a trace.


def test_contact_details_are_masked() -> None:
    masked = mask_text(
        "Reach Ada on ada.lovelace@example.com or +2348012345678, portfolio "
        "https://ada.dev/work, 12 Herbert Macaulay Way."
    )
    assert "ada.lovelace@example.com" not in masked
    assert "+2348012345678" not in masked
    assert "ada.dev" not in masked
    assert "Herbert Macaulay Way" not in masked
    # What is left is still a readable prompt, which is the whole test for a mask worth having.
    assert masked.startswith("Reach Ada on ")


def test_a_bare_profile_link_is_masked_without_a_scheme() -> None:
    assert "linkedin.com" not in mask_text("linkedin.com/in/ada and github.com/ada")


def test_masking_walks_into_the_shapes_we_send() -> None:
    masked = mask_personal_data(
        data={"system": "You are an interviewer.", "user": ["mail me at ada@example.com", 3, None]}
    )
    assert masked["system"] == "You are an interviewer."
    assert "ada@example.com" not in masked["user"][0]
    # Numbers and nulls pass through: the SDK renders them and a string is not an improvement.
    assert masked["user"][1] == 3
    assert masked["user"][2] is None


def test_masking_never_raises() -> None:
    """A mask that throws inside the SDK's export path could send the unmasked value."""

    class Hostile:
        def __str__(self) -> str:
            raise RuntimeError("no")

    assert mask_personal_data(data=Hostile()) == "[redacted-unmaskable]"


# ---- Off without keys. This is development, CI and e2e.


def test_no_keys_means_no_tracer_and_no_client(settings: Settings) -> None:
    built: list[Settings] = []

    def live(configured: Settings) -> Tracer:
        built.append(configured)  # pragma: no cover — the point is that it never runs
        return NullTracer()

    tracer = build_tracer(settings, live)
    assert isinstance(tracer, NullTracer)
    assert tracer.enabled is False
    assert built == [], "the Langfuse SDK must not even be constructed without keys"


def test_both_keys_build_the_live_tracer(settings: Settings) -> None:
    configured = settings.model_copy(
        update={
            "langfuse_public_key": _secret("pk-lf-test"),
            "langfuse_secret_key": _secret("sk-lf-test"),
        }
    )
    sentinel = RecordingTracer()
    assert build_tracer(configured, lambda _s: sentinel) is sentinel


def test_one_key_alone_is_a_configuration_error() -> None:
    with pytest.raises(ValueError, match="LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY"):
        Settings(
            _env_file=None,
            redis_url="redis://127.0.0.1:16379/0",  # type: ignore[arg-type]  # validated
            service_token="t" * 40,  # type: ignore[arg-type]  # validated
            llm_provider="fake",
            langfuse_public_key="pk-lf-test",  # type: ignore[arg-type]  # validated
        )


def test_the_null_tracer_mints_no_trace_id_and_deletes_nothing() -> None:
    tracer = NullTracer()
    with tracer.trace(TraceSubject(name="cv.parse", user_id=str(uuid.uuid4()))):
        assert current_trace_id() is None
    assert __import__("asyncio").run(tracer.delete_for_user("whoever")) == 0
    assert __import__("asyncio").run(tracer.delete_expired()) == 0


async def test_records_carry_no_trace_id_when_tracing_is_off(settings: Settings) -> None:
    """The visible end of it: `ai_call_log.langfuse_trace_id` stays null."""
    with _client(settings) as http:
        response = http.post("/interview/advance", json=_advance_body(), headers=AUTH)
    calls = response.json()["ai_calls"]
    assert calls != []
    assert all(call["langfuse_trace_id"] is None for call in calls)


# ---- `POST /traces/delete`.


def test_deleting_traces_requires_the_service_token(settings: Settings) -> None:
    with _client(settings) as http:
        body = {"user_id": str(uuid.uuid4()), "expired": False}
        assert http.post("/traces/delete", json=body).status_code == 401


def test_deleting_traces_is_a_success_when_tracing_is_off(settings: Settings) -> None:
    """Account erasure calls this unconditionally; without keys there is nothing to fail at."""
    with _client(settings) as http:
        body = {"user_id": str(uuid.uuid4()), "expired": False}
        response = http.post("/traces/delete", json=body, headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {"enabled": False, "deleted": 0}


def test_deleting_nothing_in_particular_is_refused(settings: Settings) -> None:
    with _client(settings) as http:
        body = {"user_id": None, "expired": False}
        assert http.post("/traces/delete", json=body, headers=AUTH).status_code == 400


def test_both_deletion_paths_reach_the_tracer(settings: Settings) -> None:
    tracer = RecordingTracer()
    user_id = str(uuid.uuid4())
    with _client(settings, tracer=tracer) as http:
        erasure = http.post(
            "/traces/delete", json={"user_id": user_id, "expired": False}, headers=AUTH
        ).json()
        sweep = http.post(
            "/traces/delete", json={"user_id": None, "expired": True}, headers=AUTH
        ).json()
    assert tracer.deleted_for == [user_id]
    assert tracer.expired_sweeps == 1
    assert erasure == {"enabled": True, "deleted": 1}
    assert sweep == {"enabled": True, "deleted": 1}


# ---- What a trace holds, when there is one.


async def test_every_call_of_an_exchange_carries_the_trace_id(settings: Settings) -> None:
    tracer = RecordingTracer()
    with _client(settings, tracer=tracer) as http:
        first = http.post("/interview/advance", json=_advance_body(), headers=AUTH).json()
        second = http.post(
            "/interview/advance",
            json=_advance_body(
                "answer",
                text="We ran it end to end.",
                now=at(1).isoformat(),
                engine_snapshot=first["engine_snapshot"],
            ),
            headers=AUTH,
        ).json()
    assert [call["langfuse_trace_id"] for call in first["ai_calls"]] == [TRACE_ID]
    assert {call["langfuse_trace_id"] for call in second["ai_calls"]} == {TRACE_ID}
    # One trace per exchange, carrying both opaque ids and nothing else about the person.
    assert [subject.name for subject in tracer.traces] == [
        "interview.advance",
        "interview.advance",
    ]
    assert tracer.traces[0].session_id == SESSION_ID
    assert tracer.traces[0].user_id is not None
    assert tracer.traces[0].metadata == {"action": "start"}


async def test_a_generation_is_named_for_what_the_call_was_for(settings: Settings) -> None:
    """Otherwise every generation in Langfuse is called "llm" and the traces are unreadable."""
    tracer = RecordingTracer()
    with _client(settings, tracer=tracer) as http:
        first = http.post("/interview/advance", json=_advance_body(), headers=AUTH).json()
        http.post(
            "/interview/advance",
            json=_advance_body(
                "answer",
                text="We ran it end to end.",
                now=at(1).isoformat(),
                engine_snapshot=first["engine_snapshot"],
            ),
            headers=AUTH,
        )
    assert [g.name for g in tracer.generations] == ["interviewer", "coverage", "follow_up"]
    assert all(g.system and g.user for g in tracer.generations)


async def test_a_cv_parse_traces_under_the_user_whose_cv_it_is() -> None:
    tracer = RecordingTracer()
    user_id = str(uuid.uuid4())
    llm = ScriptedLLMClient([_EXTRACTION])
    parser = CvParser(TracedLLMClient(llm, tracer), "claude-sonnet-5", tracer)

    response = await parser.parse(_cv_request(user_id))

    assert response.status == "parsed"
    assert [subject.user_id for subject in tracer.traces] == [user_id]
    assert [subject.session_id for subject in tracer.traces] == [None]
    assert [g.name for g in tracer.generations] == ["cv_parse"]
    # `.root`: a length-constrained nullable string generates as a RootModel (ADR-0003).
    assert [_trace_id_of(call) for call in response.ai_calls] == [TRACE_ID]


async def test_an_unreadable_file_opens_no_trace() -> None:
    """No model call, nothing to debug: an empty trace is noise in a store we pay to keep."""
    tracer = RecordingTracer()
    parser = CvParser(TracedLLMClient(ScriptedLLMClient([]), tracer), "m", tracer)

    response = await parser.parse(_cv_request(str(uuid.uuid4()), data=b"not a pdf"))

    assert response.status == "unreadable"
    assert tracer.traces == []


async def test_a_failed_call_is_marked_rather_than_dropped() -> None:
    tracer = RecordingTracer()
    llm = TracedLLMClient(ScriptedLLMClient([FakeLLMError("overloaded"), "refusal"]), tracer)

    with pytest.raises(LLMError):
        await _parse(llm)
    result = await _parse(llm)

    assert result.output is None
    assert [(g.name, g.failure) for g in tracer.generations] == [
        ("llm", "overloaded"),
        ("llm", "refusal"),
    ]


async def test_a_tracer_that_throws_does_not_break_the_call() -> None:
    """A tracer that can turn a working call into a failing one is worse than no tracer."""
    llm = TracedLLMClient(ScriptedLLMClient([_EXTRACTION]), HostileTracer())

    result = await _parse(llm)

    assert result.output is not None


def test_the_trace_id_is_scoped_to_its_context() -> None:
    assert current_trace_id() is None
    with publish_trace_id(TRACE_ID):
        assert current_trace_id() == TRACE_ID
    assert current_trace_id() is None


# ---- Test doubles.


@dataclass
class RecordedGeneration:
    name: str
    model: str
    system: str
    user: str
    output: object = None
    input_tokens: int = 0
    output_tokens: int = 0
    failure: str | None = None


class _Recorder(Generation):
    def __init__(self, recorded: RecordedGeneration) -> None:
        self._recorded = recorded

    def succeeded(self, *, output: object, input_tokens: int, output_tokens: int) -> None:
        self._recorded.output = output
        self._recorded.input_tokens = input_tokens
        self._recorded.output_tokens = output_tokens

    def failed(self, *, code: str) -> None:
        self._recorded.failure = code


@dataclass
class RecordingTracer(Tracer):
    """A tracer that keeps what it was told, so the enabled path is testable without an account."""

    traces: list[TraceSubject] = field(default_factory=list)
    generations: list[RecordedGeneration] = field(default_factory=list)
    deleted_for: list[str] = field(default_factory=list)
    expired_sweeps: int = 0

    @property
    def enabled(self) -> bool:
        return True

    @contextmanager
    def trace(self, subject: TraceSubject) -> Iterator[None]:
        self.traces.append(subject)
        with publish_trace_id(TRACE_ID):
            yield

    @contextmanager
    def generation(self, *, name: str, model: str, system: str, user: str) -> Iterator[Generation]:
        recorded = RecordedGeneration(name=name, model=model, system=system, user=user)
        self.generations.append(recorded)
        yield _Recorder(recorded)

    async def delete_for_user(self, user_id: str) -> int:
        self.deleted_for.append(user_id)
        return 1

    async def delete_expired(self) -> int:
        self.expired_sweeps += 1
        return 1

    async def aclose(self) -> None:
        return None


class HostileTracer(NullTracer):
    """Every tracing operation fails. The worker's job is to not notice."""

    @contextmanager
    def generation(self, *, name: str, model: str, system: str, user: str) -> Iterator[Generation]:
        yield _Exploding()


class _Exploding(Generation):
    def succeeded(self, *, output: object, input_tokens: int, output_tokens: int) -> None:
        raise RuntimeError("langfuse is having a bad day")

    def failed(self, *, code: str) -> None:
        raise RuntimeError("langfuse is having a bad day")


# ---- Helpers.

_EXTRACTION = CvExtraction.model_validate(
    {"skills": ["Python"], "projects": [], "experience": [], "gaps": []}
)


def _secret(value: str) -> Any:
    from pydantic import SecretStr

    return SecretStr(value)


def _client(settings: Settings, tracer: Tracer | None = None) -> TestClient:
    return TestClient(main.create_app(settings, redis=FakeRedis(), tracer=tracer))


def _advance_body(action: str = "start", **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "session_id": SESSION_ID,
        "action": action,
        "text": None,
        "now": at(0).isoformat(),
        "bundle": bundle(questions=[question(0)], question_budget=1).model_dump(mode="json"),
        "engine_snapshot": None,
    }
    return payload | overrides


def _cv_request(user_id: str, data: bytes | None = None) -> CvParseRequest:
    return CvParseRequest.model_validate(
        {
            "request_id": str(uuid.uuid4()),
            "user_id": user_id,
            "content_type": "application/pdf",
            "file_base64": base64.b64encode(data or make_pdf(CV_LINES)).decode(),
            "target_role_label": "Backend engineer",
            "level_label": "Mid-level",
            "stack_label": None,
        }
    )


def _trace_id_of(call: AiCallRecord) -> str | None:
    return None if call.langfuse_trace_id is None else call.langfuse_trace_id.root


async def _parse(llm: TracedLLMClient) -> LLMResult[CvExtraction]:
    return await llm.parse(
        model="m", system="s", user="u", output_type=CvExtraction, max_tokens=100
    )
