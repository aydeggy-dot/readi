"""Whole exchanges: what the API sends, what comes back, and what it cost.

These run on `FakeInterviewerLLMClient` — the same stand-in `LLM_PROVIDER=fake` uses — except
where a test is about a model misbehaving, which is what `ScriptedLLMClient` is for.
"""

from datetime import datetime
from typing import Any

import pytest
from pydantic import BaseModel

from readi_worker.contracts import InterviewAdvanceRequest, InterviewSessionBundle
from readi_worker.interview.calls import CoverageJudgement, Interviewer, ProbeVerdict, Speech
from readi_worker.interview.fake_script import FAKE_WRAP_UP, FakeInterviewerLLMClient
from readi_worker.interview.service import FALLBACK_WRAP_UP, InterviewService
from readi_worker.interview.state_store import InterviewStateStore
from readi_worker.llm.base import LLMClient, LLMResult
from readi_worker.llm.fake import FakeLLMError, FunctionLLMClient, ScriptedLLMClient, Step
from tests.conftest import FakeRedis
from tests.interview_fixtures import SESSION_ID, TWO_ON_ONE, at, bundle, question


def build(llm: LLMClient | None = None) -> tuple[InterviewService, FakeRedis]:
    redis = FakeRedis()
    client = llm or FakeInterviewerLLMClient(FunctionLLMClient(lambda _s, _u: Speech(speech="x")))
    return (
        InterviewService(Interviewer(client, "fake"), InterviewStateStore(redis, 60)),
        redis,
    )


def request(
    action: str,
    *,
    now: datetime,
    text: str | None = None,
    deck: InterviewSessionBundle | None = None,
    snapshot: Any = None,
    session_id: str = SESSION_ID,
) -> InterviewAdvanceRequest:
    return InterviewAdvanceRequest.model_validate(
        {
            "session_id": session_id,
            "action": action,
            "text": text,
            "now": now.isoformat(),
            "bundle": deck.model_dump(mode="json") if deck else None,
            "engine_snapshot": snapshot.model_dump(mode="json") if snapshot else None,
        }
    )


def texts(response: Any) -> list[str]:
    return [turn.text for turn in response.turns]


def versions(response: Any) -> dict[str, int]:
    return {name: version.root for name, version in response.prompt_versions.items()}


# ---- A whole session.


async def test_a_session_runs_from_start_to_close() -> None:
    service, _ = build()
    deck = bundle(questions=[question(0), question(1)], question_budget=2)

    opening = await service.advance(request("start", now=at(0), deck=deck))
    assert opening.error is None
    assert [turn.state for turn in opening.turns] == ["intro", "question"]
    assert [turn.speaker for turn in opening.turns] == ["interviewer", "interviewer"]
    assert deck.questions[0].prompt in texts(opening)[1], "the stand-in speaks the pinned prompt"
    assert opening.state == "question"

    # No bundle this time: Redis holds it, which is what the cache is for.
    answered = await service.advance(
        request("answer", now=at(1), text="I wrote tests.", snapshot=opening.engine_snapshot)
    )
    assert [turn.speaker for turn in answered.turns] == ["candidate", "interviewer"]
    assert answered.turns[0].text == "I wrote tests."
    assert answered.turns[1].state == "follow_up"
    assert answered.turns[1].follow_up_index is not None
    assert answered.state == "follow_up"

    # Seqs are the engine's and run on without gaps across exchanges.
    assert [turn.seq for turn in opening.turns] + [turn.seq for turn in answered.turns] == [
        0,
        1,
        2,
        3,
    ]

    ended = await service.advance(request("end", now=at(2), snapshot=answered.engine_snapshot))
    assert ended.ended is True
    assert ended.end_reason == "candidate_ended"
    assert ended.turns[-1].state == "wrap_up"
    assert ended.turns[-1].text == FAKE_WRAP_UP


async def test_every_prompt_used_is_reported_with_its_version() -> None:
    service, _ = build()
    deck = bundle(questions=[question(0)], question_budget=1)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    assert versions(opening) == {
        "interview_intro": 1,
        "interview_system": 1,
        "interview_question": 1,
    }
    answered = await service.advance(
        request("answer", now=at(1), text="Yes.", snapshot=opening.engine_snapshot)
    )
    assert versions(answered)["interview_coverage"] == 1
    assert versions(answered)["interview_followup"] == 1


async def test_the_intro_states_the_real_budgets() -> None:
    service, _ = build()
    deck = bundle(questions=[question(index) for index in range(9)], question_budget=8, minutes=30)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    assert "8 questions" in opening.turns[0].text
    assert "30 minutes" in opening.turns[0].text


async def test_the_intro_counts_the_questions_that_exist_not_the_budget() -> None:
    service, _ = build()
    deck = bundle(questions=[question(0), question(1)], question_budget=8)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    assert "2 questions" in opening.turns[0].text


# ---- Coverage.


async def test_an_answer_that_covers_every_probe_earns_no_follow_up() -> None:
    """The stand-in reads `covered:<n>` markers; the engine then has nothing left to ask."""
    service, _ = build()
    deck = bundle(questions=[question(0), question(1)], question_budget=2)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    answered = await service.advance(
        request(
            "answer",
            now=at(1),
            text="All of it — covered:0 covered:1",
            snapshot=opening.engine_snapshot,
        )
    )
    assert [turn.speaker for turn in answered.turns] == ["candidate", "interviewer"]
    assert [turn.state for turn in answered.turns] == ["question", "question"]
    log = answered.turns[0].criteria_covered
    assert log is not None
    assert [entry.covered for entry in log.root] == ["not_judged", "covered", "covered"]


async def test_the_coverage_log_names_the_probe_the_engine_chose() -> None:
    service, _ = build()
    deck = bundle(questions=[question(0)], question_budget=1)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    answered = await service.advance(
        request("answer", now=at(1), text="Not much.", snapshot=opening.engine_snapshot)
    )
    log = answered.turns[0].criteria_covered
    assert log is not None
    chosen = [None if e.follow_up_index is None else e.follow_up_index.root for e in log.root]
    assert chosen == [None, 0, None]
    assert answered.turns[1].follow_up_index is not None
    assert answered.turns[1].follow_up_index.root == 0


async def test_no_coverage_call_is_made_once_the_budget_is_spent() -> None:
    """The free saving, counted in calls rather than asserted in prose."""
    service, _ = build()
    deck = bundle(questions=[question(0)], question_budget=1)
    response = await service.advance(request("start", now=at(0), deck=deck))
    coverage_calls = []
    for minute in (1, 2, 3):
        response = await service.advance(
            request("answer", now=at(minute), text="More.", snapshot=response.engine_snapshot)
        )
        coverage_calls.append(sum(1 for call in response.ai_calls if call.purpose == "coverage"))
    assert coverage_calls == [1, 1, 0], "two probes, two judgements, then nothing left to judge"
    log = response.turns[0].criteria_covered
    assert log is not None
    assert {entry.covered for entry in log.root} == {"not_judged"}


async def test_their_own_questions_carry_no_coverage_log() -> None:
    service, _ = build()
    deck = bundle(questions=[question(0)], question_budget=1)
    response = await service.advance(request("start", now=at(0), deck=deck))
    response = await service.advance(
        request(
            "answer",
            now=at(1),
            text="Done — covered:0 covered:1",
            snapshot=response.engine_snapshot,
        )
    )
    assert response.state == "candidate_questions"
    asked = await service.advance(
        request("answer", now=at(2), text="How big is the team?", snapshot=response.engine_snapshot)
    )
    assert asked.turns[0].speaker == "candidate"
    assert asked.turns[0].criteria_covered is None
    assert asked.turns[1].state == "candidate_questions"


# ---- Resuming, and what the authority is.


async def test_redis_losing_the_bundle_asks_for_it_back() -> None:
    service, redis = build()
    deck = bundle(questions=[question(0)], question_budget=1)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    redis.values.clear()  # a flush, mid-session
    refused = await service.advance(
        request("answer", now=at(1), text="Yes.", snapshot=opening.engine_snapshot)
    )
    assert refused.error == "bundle_required"
    assert refused.turns == []
    assert refused.engine_snapshot is None

    resumed = await service.advance(
        request("answer", now=at(1), text="Yes.", deck=deck, snapshot=opening.engine_snapshot)
    )
    assert resumed.error is None
    assert resumed.turns[0].seq == 2, "the transcript carries on where it was"


async def test_the_snapshot_in_the_request_wins_over_redis() -> None:
    """A response that reached Redis but not the database is replayed, not skipped past."""
    service, _ = build()
    deck = bundle(questions=[question(0), question(1)], question_budget=2)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    first = await service.advance(
        request("answer", now=at(1), text="One.", snapshot=opening.engine_snapshot)
    )
    replay = await service.advance(
        request("answer", now=at(1), text="One.", snapshot=opening.engine_snapshot)
    )
    assert [turn.seq for turn in replay.turns] == [turn.seq for turn in first.turns]


async def test_a_snapshot_for_another_bundle_is_refused() -> None:
    service, _ = build()
    deck = bundle(questions=[question(0), question(1)], question_budget=2)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    refused = await service.advance(
        request(
            "answer",
            now=at(1),
            text="Yes.",
            deck=bundle(questions=[question(0)]),
            snapshot=opening.engine_snapshot,
        )
    )
    assert refused.error == "engine_error"


async def test_a_bundle_for_another_session_is_refused() -> None:
    service, _ = build()
    refused = await service.advance(
        request(
            "start",
            now=at(0),
            deck=bundle(),
            session_id="99999999-2222-4333-8444-555555555555",
        )
    )
    assert refused.error == "bad_request"


async def test_nothing_to_answer_is_refused_rather_than_guessed() -> None:
    service, _ = build()
    refused = await service.advance(request("answer", now=at(0), text="Hello", deck=bundle()))
    assert refused.error == "bad_request"
    assert refused.turns == []


# ---- When the model will not play.


def scripted(*steps: Step) -> ScriptedLLMClient:
    return ScriptedLLMClient(list(steps))


async def test_a_question_falls_back_to_its_own_pinned_wording() -> None:
    prompt = "Walk me through how you would test a payment flow."
    deck = bundle(questions=[question(0, prompt=prompt)], question_budget=1)
    service, _ = build(scripted("invalid_output", "invalid_output", "invalid_output"))
    opening = await service.advance(request("start", now=at(0), deck=deck))
    assert opening.error is None
    assert opening.turns[1].text == prompt
    assert [call.status for call in opening.ai_calls] == ["error", "error", "error"]


async def test_a_refusal_is_not_retried() -> None:
    deck = bundle(questions=[question(0)], question_budget=1)
    service, _ = build(scripted("refusal", Speech(speech="never reached")))
    opening = await service.advance(request("start", now=at(0), deck=deck))
    assert len(opening.ai_calls) == 1
    assert opening.ai_calls[0].error_code is not None
    assert opening.ai_calls[0].error_code.root == "refusal"
    assert opening.turns[1].text == deck.questions[0].prompt


async def test_an_unreachable_provider_still_produces_the_interview() -> None:
    deck = bundle(questions=[question(0)], question_budget=1)
    service, _ = build(scripted(FakeLLMError(), FakeLLMError()))
    opening = await service.advance(request("start", now=at(0), deck=deck))
    assert opening.error is None
    assert opening.turns[1].text == deck.questions[0].prompt
    assert opening.ai_calls[0].cost_micro_usd == 0


async def test_a_follow_up_falls_back_to_the_probe_as_written() -> None:
    deck = bundle(questions=[question(0)], question_budget=1)
    probe = deck.questions[0].planned_follow_ups[0].probe
    service, _ = build(
        scripted(
            Speech(speech="Here is the question."),
            CoverageJudgement(probes=[ProbeVerdict(probe=0, reason="no", already_answered=False)]),
            "invalid_output",
            "invalid_output",
            "invalid_output",
        )
    )
    opening = await service.advance(request("start", now=at(0), deck=deck))
    answered = await service.advance(
        request("answer", now=at(1), text="Briefly.", snapshot=opening.engine_snapshot)
    )
    assert answered.turns[1].text == probe


async def test_the_close_falls_back_to_a_fixed_line() -> None:
    deck = bundle(questions=[question(0)], question_budget=1)
    service, _ = build(scripted(Speech(speech="Q."), "invalid_output", "refusal"))
    opening = await service.advance(request("start", now=at(0), deck=deck))
    ended = await service.advance(request("end", now=at(1), snapshot=opening.engine_snapshot))
    assert ended.turns[-1].text == FALLBACK_WRAP_UP
    assert ended.ended is True


async def test_a_failed_coverage_call_leaves_the_log_unjudged_and_asks_anyway() -> None:
    deck = bundle(questions=[question(0)], question_budget=1)
    service, _ = build(
        scripted(
            Speech(speech="Q."),
            FakeLLMError(),
            Speech(speech="A follow-up."),
        )
    )
    opening = await service.advance(request("start", now=at(0), deck=deck))
    answered = await service.advance(
        request("answer", now=at(1), text="Something.", snapshot=opening.engine_snapshot)
    )
    log = answered.turns[0].criteria_covered
    assert log is not None
    assert {entry.covered for entry in log.root} == {"not_judged"}
    assert answered.turns[1].state == "follow_up", "in doubt, ask"


async def test_a_question_the_candidate_asked_cannot_be_faked() -> None:
    """The one call with no honest fallback. Nothing is stored, so a retry replays it."""
    deck = bundle(questions=[question(0)], question_budget=1)
    service, _ = build(
        scripted(
            Speech(speech="Q."),
            CoverageJudgement(
                probes=[
                    ProbeVerdict(probe=0, reason="y", already_answered=True),
                    ProbeVerdict(probe=1, reason="y", already_answered=True),
                ]
            ),
            Speech(speech="Anything to ask?"),
            "invalid_output",
            "invalid_output",
            "invalid_output",
        )
    )
    opening = await service.advance(request("start", now=at(0), deck=deck))
    done = await service.advance(
        request("answer", now=at(1), text="Covered.", snapshot=opening.engine_snapshot)
    )
    assert done.state == "candidate_questions"
    failed = await service.advance(
        request("answer", now=at(2), text="What is the team like?", snapshot=done.engine_snapshot)
    )
    assert failed.error == "llm_error"
    assert failed.turns == []
    assert failed.engine_snapshot is None


# ---- What every call is recorded as.


async def test_each_call_is_recorded_under_its_own_purpose() -> None:
    service, _ = build()
    deck = bundle(questions=[question(0, probes=TWO_ON_ONE)], question_budget=1)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    answered = await service.advance(
        request("answer", now=at(1), text="Something.", snapshot=opening.engine_snapshot)
    )
    assert [call.purpose for call in opening.ai_calls] == ["interviewer"]
    assert [call.purpose for call in answered.ai_calls] == ["coverage", "follow_up"]
    assert all(call.unit_kind == "tokens" for call in answered.ai_calls)


@pytest.mark.parametrize("action", ["skip", "end"])
async def test_skipping_and_ending_write_no_candidate_turn(action: str) -> None:
    service, _ = build()
    deck = bundle(questions=[question(0), question(1)], question_budget=2)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    response = await service.advance(request(action, now=at(1), snapshot=opening.engine_snapshot))
    assert all(turn.speaker == "interviewer" for turn in response.turns)
    assert response.ai_calls != []
    assert all(call.purpose != "coverage" for call in response.ai_calls)


async def test_every_interview_call_carries_the_interviewer_deadline() -> None:
    """A candidate is watching a spinner, so these calls are bounded far tighter than a CV parse.

    `AI_WORKER_TIMEOUT_MS` on the API side is sized from two of these chained, so if this stops
    being passed the API's own deadline stops meaning what its comment says it means.
    """
    deadlines: list[float | None] = []

    class Timed:
        provider = "fake"

        def __init__(self) -> None:
            self._inner = FakeInterviewerLLMClient(
                FunctionLLMClient(lambda _s, _u: Speech(speech="x"))
            )

        async def parse[T: BaseModel](
            self,
            *,
            model: str,
            system: str,
            user: str,
            output_type: type[T],
            max_tokens: int,
            timeout_s: float | None = None,
        ) -> LLMResult[T]:
            deadlines.append(timeout_s)
            return await self._inner.parse(
                model=model,
                system=system,
                user=user,
                output_type=output_type,
                max_tokens=max_tokens,
                timeout_s=timeout_s,
            )

    redis = FakeRedis()
    service = InterviewService(Interviewer(Timed(), "fake", 12.5), InterviewStateStore(redis, 60))
    deck = bundle(questions=[question(0)], question_budget=1)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    await service.advance(
        request("answer", now=at(1), text="Something.", snapshot=opening.engine_snapshot)
    )
    assert deadlines, "the engine did call a model"
    assert set(deadlines) == {12.5}, "phrasing and coverage alike"
