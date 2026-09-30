"""Latency lever 2: the opening the engine will certainly ask next, phrased while it can be.

Two halves, and the first is the interesting one. `machine.settled_next_step` decides whether the
next step depends on the answer at all — prefetching is only honest where it does not — and
`InterviewService.prefetch_next_opening` then makes the call the turn would have made, keyed on the
prompt so the turn finds it.
"""

from readi_worker.interview import machine
from readi_worker.interview.calls import Interviewer, Speech
from readi_worker.interview.fake_script import FakeInterviewerLLMClient
from readi_worker.interview.machine import AskFollowUp, AskQuestion, InviteCandidateQuestions
from readi_worker.interview.phrasings import MAX_ENTRIES, Phrased, PhrasingCache
from readi_worker.interview.service import InterviewService
from readi_worker.interview.state_store import InterviewStateStore
from readi_worker.llm.fake import FunctionLLMClient
from readi_worker.tracing import NullTracer
from tests.conftest import FakeRedis
from tests.interview_fixtures import TWO_ON_ONE, at, bundle, question
from tests.test_interview_service import build, request


def voice_service(cache: PhrasingCache) -> InterviewService:
    """The service as the **voice agent** builds it: the same engine, plus a phrasing cache."""
    client = FakeInterviewerLLMClient(FunctionLLMClient(lambda _s, _u: Speech(speech="x")))
    return InterviewService(
        Interviewer(client, "fake"), InterviewStateStore(FakeRedis(), 60), NullTracer(), cache
    )


# ---- Is the next step settled?


def test_a_question_with_probes_left_is_not_settled() -> None:
    deck = bundle()
    state = machine.begin(deck)
    state = machine.start(state)
    state, _step = machine.plan(state, deck, at(0))  # intro
    state, step = machine.plan(state, deck, at(0))  # the first question
    assert isinstance(step, AskQuestion)
    # A probe could follow, so what comes next depends on what they say.
    assert machine.settled_next_step(state, deck, at(0)) is None


def test_a_question_whose_follow_ups_are_spent_is_settled_on_the_next_one() -> None:
    deck = bundle(max_follow_ups=1)
    state = machine.begin(deck)
    state = machine.start(state)
    state, _ = machine.plan(state, deck, at(0))
    state, _ = machine.plan(state, deck, at(0))
    state, _seq = machine.take_answer(state, "an answer")
    state, step = machine.plan(state, deck, at(1))
    assert isinstance(step, AskFollowUp)
    # The cap is one probe, and it has been asked: nothing the candidate says can add another.
    settled = machine.settled_next_step(state, deck, at(2))
    assert isinstance(settled, AskQuestion)
    assert settled.question == 1


def test_a_question_whose_probes_are_all_covered_is_settled() -> None:
    deck = bundle(questions=[question(0, probes=((1, "Only probe?"),)), question(1)])
    state = machine.begin(deck)
    state = machine.start(state)
    state, _ = machine.plan(state, deck, at(0))
    state, _ = machine.plan(state, deck, at(0))
    state, _seq = machine.take_answer(state, "an answer that covered it", covered=(0,))
    settled = machine.settled_next_step(state, deck, at(1))
    assert settled is None  # mid-exchange: the engine is not waiting for anybody
    state, step = machine.plan(state, deck, at(1))
    assert isinstance(step, AskQuestion)
    assert step.question == 1


def test_no_room_for_a_probe_settles_the_next_step() -> None:
    # Out of time for a follow-up but still time to open a question: the probe cannot happen, so
    # the next opening is decided whatever the answer says.
    deck = bundle(minutes=15, max_follow_ups=2)
    state = machine.begin(deck)
    state = machine.start(state)
    state, _ = machine.plan(state, deck, at(0))
    state, _ = machine.plan(state, deck, at(0))
    assert machine.probes_to_judge(state, deck, at(14)) == ()
    settled = machine.settled_next_step(state, deck, at(14))
    # The clock has also taken the next question away, so what is settled is the close.
    assert settled is not None
    assert not isinstance(settled, AskQuestion)


def test_the_last_question_settles_on_the_candidate_s_own_questions() -> None:
    # One question, no follow-ups allowed: while the candidate answers it, what happens next is
    # already decided, and it is their turn to ask.
    deck = bundle(questions=[question(0)], question_budget=1, max_follow_ups=0)
    state = machine.begin(deck)
    state = machine.start(state)
    state, _ = machine.plan(state, deck, at(0))
    state, _ = machine.plan(state, deck, at(0))
    settled = machine.settled_next_step(state, deck, at(1))
    assert isinstance(settled, InviteCandidateQuestions)


def test_nothing_is_settled_outside_a_question() -> None:
    deck = bundle()
    state = machine.begin(deck)
    assert machine.settled_next_step(state, deck, at(0)) is None


# ---- The call, and the turn that uses it.


async def test_the_prefetched_phrasing_is_what_the_turn_says() -> None:
    cache = PhrasingCache()
    service = voice_service(cache)
    deck = bundle(max_follow_ups=1)

    started = await service.advance(request("start", now=at(0), deck=deck))
    answered = await service.advance(
        request(
            "answer",
            now=at(1),
            text="an answer",
            deck=deck,
            snapshot=started.engine_snapshot,
        )
    )
    # A probe was asked and the cap is one, so the next opening is settled.
    text = await service.prefetch_next_opening(deck, answered.engine_snapshot, at(2))
    assert text is not None
    assert len(cache) == 1

    second = await service.advance(
        request(
            "answer",
            now=at(3),
            text="a second answer",
            deck=deck,
            snapshot=answered.engine_snapshot,
        )
    )
    spoken = [turn.text for turn in second.turns if turn.speaker == "interviewer"]
    assert spoken == [text]
    # Taken once: the entry is gone, and the records rode home with the exchange.
    assert len(cache) == 0
    assert [call.purpose for call in second.ai_calls].count("interviewer") == 1


async def test_prefetching_twice_makes_one_call() -> None:
    cache = PhrasingCache()
    service = voice_service(cache)
    deck = bundle(max_follow_ups=0)

    started = await service.advance(request("start", now=at(0), deck=deck))
    first = await service.prefetch_next_opening(deck, started.engine_snapshot, at(1))
    second = await service.prefetch_next_opening(deck, started.engine_snapshot, at(1))
    assert first is not None
    assert second == first
    assert len(cache) == 1


async def test_nothing_is_prefetched_where_a_probe_could_still_follow() -> None:
    cache = PhrasingCache()
    service = voice_service(cache)
    deck = bundle(questions=[question(0, probes=TWO_ON_ONE), question(1)])
    started = await service.advance(request("start", now=at(0), deck=deck))
    assert await service.prefetch_next_opening(deck, started.engine_snapshot, at(1)) is None
    assert len(cache) == 0


async def test_text_mode_has_no_cache_and_prefetches_nothing() -> None:
    service, _redis = build()
    deck = bundle(max_follow_ups=0)
    started = await service.advance(request("start", now=at(0), deck=deck))
    assert await service.prefetch_next_opening(deck, started.engine_snapshot, at(1)) is None


async def test_a_snapshot_that_does_not_fit_the_bundle_prefetches_nothing() -> None:
    # Rather than raising into a leg that is mid-conversation: the worst a bad prefetch may cost is
    # one ordinary phrasing call.
    cache = PhrasingCache()
    service = voice_service(cache)
    deck = bundle(max_follow_ups=0)
    started = await service.advance(request("start", now=at(0), deck=deck))
    other = bundle(questions=[question(0)])
    assert await service.prefetch_next_opening(other, started.engine_snapshot, at(1)) is None


# ---- The cache itself.


def test_the_cache_is_bounded() -> None:
    cache = PhrasingCache()
    for index in range(MAX_ENTRIES + 3):
        cache.put(f"prompt {index}", Phrased(text=f"said {index}"))
    assert len(cache) == MAX_ENTRIES
    # The oldest went first, which is the order they would have been needed in.
    assert cache.take("prompt 0") is None
    assert cache.take(f"prompt {MAX_ENTRIES + 2}") is not None


def test_taking_is_single_use() -> None:
    cache = PhrasingCache()
    cache.put("prompt", Phrased(text="said"))
    assert cache.has("prompt")
    assert cache.take("prompt") is not None
    assert cache.take("prompt") is None
    assert not cache.has("prompt")
