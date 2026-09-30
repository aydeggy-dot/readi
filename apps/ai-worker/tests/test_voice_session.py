"""A whole voice leg, against the fakes: what was said, what was pushed, and what it cost.

`VoiceLeg` is the module M5 phase 3 has to get right and the one with no LiveKit in it, so this is
the phase's real test. Everything here runs in-process: the engine is the same
`InterviewService` text mode uses, the speaker records lines and answers with scripted playback, and
the API is a list.
"""

from readi_worker.contracts import AiCallRecord, InterviewSessionBundle, InterviewTurn
from readi_worker.interview.calls import Interviewer, Speech
from readi_worker.interview.fake_script import FakeInterviewerLLMClient
from readi_worker.interview.phrasings import PhrasingCache
from readi_worker.interview.service import InterviewService
from readi_worker.interview.state_store import InterviewStateStore
from readi_worker.llm.base import LLMClient
from readi_worker.llm.fake import FakeLLMError, FunctionLLMClient
from readi_worker.speech.base import TranscriptWord as SpeechWord
from readi_worker.speech.fake import FakeTextToSpeech
from readi_worker.tracing import NullTracer
from readi_worker.voice.acknowledgements import ACKNOWLEDGEMENTS, CANNOT_ANSWER, TAKE_YOUR_TIME
from readi_worker.voice.barge_in import Playback
from readi_worker.voice.latency import TurnTiming
from readi_worker.voice.pinned_audio import PinnedAudio
from readi_worker.voice.quality import QualityMonitor
from readi_worker.voice.session import ANSWER_MAX_LENGTH, VoiceLeg
from readi_worker.voice.transport import CallSink
from tests.conftest import FakeRedis
from tests.interview_fixtures import SESSION_ID, bundle, question
from tests.voice_fixtures import FakeApi, FakeSpeaker, ManualClock, start_response

WORDS = [
    SpeechWord(text="we", start_ms=0, end_ms=200, confidence=0.9),
    SpeechWord(text="queue", start_ms=200, end_ms=600, confidence=0.9),
    SpeechWord(text="it", start_ms=600, end_ms=800, confidence=0.9),
]


class Leg:
    """A leg and everything around it, so a test reads as a conversation."""

    def __init__(
        self,
        *,
        deck: InterviewSessionBundle | None = None,
        speaker: FakeSpeaker | None = None,
        api: FakeApi | None = None,
        llm: LLMClient | None = None,
        resume: bool = False,
        voice_seconds_remaining: int = 1_800,
        silence_after_ms: int = 20_000,
    ) -> None:
        self.deck = deck or bundle()
        self.clock = ManualClock()
        self.speaker = speaker or FakeSpeaker()
        self.api = api or FakeApi()
        self.calls = CallSink()
        self.pinned = PinnedAudio(FakeTextToSpeech(), model="fake", voice="fake")
        client = llm or FakeInterviewerLLMClient(
            FunctionLLMClient(lambda _s, _u: Speech(speech="x"))
        )
        self.service = InterviewService(
            Interviewer(client, "fake"),
            InterviewStateStore(FakeRedis(), 60),
            NullTracer(),
            PhrasingCache(),
        )
        self.leg = VoiceLeg(
            session_id=SESSION_ID,
            start=start_response(
                self.deck,
                resume=resume,
                voice_seconds_remaining=voice_seconds_remaining,
                now=self.clock.now(),
            ),
            service=self.service,
            speaker=self.speaker,
            pinned=self.pinned,
            api=self.api,
            clock=self.clock,
            calls=self.calls,
            quality=QualityMonitor(self.clock),
            silence_after_ms=silence_after_ms,
        )

    def timing(self, *, endpoint_ms: int = 380, stt_final_ms: int = 520) -> TurnTiming:
        return TurnTiming(
            speech_ended_at=self.clock.now(),
            started_at=self.clock.monotonic(),
            endpoint_ms=endpoint_ms,
            stt_final_ms=stt_final_ms,
        )

    async def answer(self, text: str = "we queue the write and retry it") -> None:
        await self.leg.on_answer(text, timing=self.timing(), words=list(WORDS), confidence=0.91)
        await self.leg.drain()

    async def open(self) -> None:
        await self.leg.open()
        await self.leg.drain()


def interviewer_turns(turns: list[InterviewTurn]) -> list[InterviewTurn]:
    return [turn for turn in turns if turn.speaker == "interviewer"]


def candidate_turns(turns: list[InterviewTurn]) -> list[InterviewTurn]:
    return [turn for turn in turns if turn.speaker == "candidate"]


def purposes(calls: list[AiCallRecord]) -> list[str]:
    return [call.purpose for call in calls]


# ---- Opening the leg.


async def test_the_leg_greets_and_asks_the_first_question() -> None:
    leg = Leg()
    await leg.open()

    # The intro and the first question, in that order, and no acknowledgement: nobody has spoken.
    assert len(leg.speaker.said) == 2
    assert all(line not in ACKNOWLEDGEMENTS for line in leg.speaker.lines)
    push = leg.api.pushes[0]
    assert len(interviewer_turns(list(push.turns))) == 2
    assert candidate_turns(list(push.turns)) == []
    # No candidate speech in front of it, so there is nothing to measure a turn against.
    assert list(push.latency) == []
    assert push.state == "question"
    assert push.ended is False


async def test_the_pinned_lines_are_rendered_before_the_greeting() -> None:
    leg = Leg()
    await leg.open()
    assert leg.pinned.has(TAKE_YOUR_TIME)
    assert leg.pinned.has(ACKNOWLEDGEMENTS[0])
    # Every render is a cost record, and it rides home with the first exchange (ADR-0007).
    assert purposes(list(leg.api.pushes[0].ai_calls)).count("tts") >= len(ACKNOWLEDGEMENTS)


async def test_a_resumed_leg_says_nothing_and_waits() -> None:
    # ADR-0019 §7: the API's snapshot is the authority, so a second leg has nothing to hand over.
    leg = Leg(resume=True)
    await leg.open()
    assert leg.speaker.said == []
    assert leg.api.pushes == []


# ---- One exchange.


async def test_the_acknowledgement_is_the_first_audio_and_comes_from_rendered_audio() -> None:
    leg = Leg()
    await leg.open()
    said_before = len(leg.speaker.said)
    await leg.answer()

    first = leg.speaker.said[said_before]
    assert first.text in ACKNOWLEDGEMENTS
    assert first.pinned is True  # no synthesis round trip: latency lever 1


async def test_the_exchange_is_pushed_with_the_words_the_candidate_said() -> None:
    leg = Leg()
    await leg.open()
    await leg.answer()

    push = leg.api.pushes[1]
    candidate = candidate_turns(list(push.turns))[0]
    assert candidate.voice is not None
    assert [word.text for word in candidate.voice.words] == ["we", "queue", "it"]
    assert candidate.voice.stt_confidence is not None
    assert candidate.voice.stt_confidence.root == 0.91
    # And the interviewer's reply carries its barge-in facts.
    spoken = interviewer_turns(list(push.turns))[0]
    assert spoken.voice is not None
    assert spoken.voice.interrupted is False
    assert spoken.voice.spoken_ms is not None


async def test_one_latency_sample_per_reply_with_the_stages_filled_in() -> None:
    leg = Leg()
    await leg.open()
    await leg.answer()

    samples = list(leg.api.pushes[1].latency)
    assert len(samples) == 1
    sample = samples[0]
    assert sample.endpoint_ms == 380
    assert sample.stt_final_ms == 520
    assert sample.acknowledged_ms is not None
    assert sample.response_ms >= 0
    assert sample.interim_coverage is False  # lever 3 is a phase 8 decision
    assert sample.turn_seq == interviewer_turns(list(leg.api.pushes[1].turns))[0].seq


async def test_the_engine_is_the_same_one_text_mode_drives() -> None:
    # A follow-up was chosen from the question's own probes, by the engine, and its index is on the
    # turn — the same fact M4 scores on.
    leg = Leg()
    await leg.open()
    await leg.answer()
    spoken = interviewer_turns(list(leg.api.pushes[1].turns))[0]
    assert spoken.state == "follow_up"
    assert spoken.follow_up_index is not None
    assert spoken.text == leg.deck.questions[0].planned_follow_ups[0].probe


async def test_a_long_answer_is_truncated_rather_than_refused() -> None:
    leg = Leg()
    await leg.open()
    await leg.answer("and " * 4_000)
    candidate = candidate_turns(list(leg.api.pushes[1].turns))[0]
    assert len(candidate.text) <= ANSWER_MAX_LENGTH


async def test_an_empty_transcript_is_not_an_exchange() -> None:
    leg = Leg()
    await leg.open()
    before = len(leg.api.pushes)
    await leg.answer("   ")
    assert len(leg.api.pushes) == before


# ---- Barge-in.


async def test_a_probe_the_candidate_talked_over_is_pushed_as_not_asked() -> None:
    deck = bundle()
    probe = deck.questions[0].planned_follow_ups[0].probe
    speaker = FakeSpeaker(
        interruptions={
            probe: Playback(spoken_ms=300, interrupted=True, total_ms=3_000, heard_text=probe[:8])
        }
    )
    leg = Leg(deck=deck, speaker=speaker)
    await leg.open()
    await leg.answer()

    spoken = interviewer_turns(list(leg.api.pushes[1].turns))[0]
    assert spoken.text == probe  # the words the engine said are still the record
    assert spoken.follow_up_index is None  # …but the candidate was not asked them
    assert spoken.voice is not None
    assert spoken.voice.interrupted is True
    assert next(iter(leg.api.pushes[1].latency)).interrupted is True


async def test_a_probe_heard_to_the_end_keeps_its_index() -> None:
    leg = Leg()
    await leg.open()
    await leg.answer()
    spoken = interviewer_turns(list(leg.api.pushes[1].turns))[0]
    assert spoken.follow_up_index is not None


# ---- The silence prompt.


async def test_one_reassurance_into_a_long_silence() -> None:
    import asyncio

    leg = Leg(silence_after_ms=10)
    await leg.open()
    await asyncio.sleep(0.05)
    assert leg.speaker.lines.count(TAKE_YOUR_TIME) == 1
    # Said once. A second "take your time" is the interviewer hurrying somebody along.
    await asyncio.sleep(0.05)
    assert leg.speaker.lines.count(TAKE_YOUR_TIME) == 1


async def test_a_candidate_who_starts_speaking_is_not_reassured() -> None:
    import asyncio

    leg = Leg(silence_after_ms=40)
    await leg.open()
    leg.leg.on_user_started_speaking()
    await asyncio.sleep(0.08)
    assert TAKE_YOUR_TIME not in leg.speaker.lines


async def test_the_silence_clock_restarts_after_each_reply() -> None:
    import asyncio

    leg = Leg(silence_after_ms=10)
    await leg.open()
    await asyncio.sleep(0.05)
    await leg.answer()
    await asyncio.sleep(0.05)
    assert leg.speaker.lines.count(TAKE_YOUR_TIME) == 2


# ---- The prefetch (latency lever 2).


async def test_the_next_opening_is_prefetched_and_then_played_from_audio() -> None:
    import asyncio

    # One probe per question and a cap of one: after the probe is answered the next opening is
    # settled, so phrasing it during the answer is prefetching rather than speculation.
    deck = bundle(
        questions=[
            question(0, probes=((1, "How did you decide what to test first?"),)),
            question(1),
        ],
        max_follow_ups=1,
    )
    leg = Leg(deck=deck)
    await leg.open()
    await leg.answer()  # the probe is asked; the next opening is now settled
    await asyncio.sleep(0.05)  # the prefetch runs while the candidate would be answering
    await leg.answer()

    push = leg.api.pushes[2]
    spoken = interviewer_turns(list(push.turns))[0]
    assert leg.pinned.has(spoken.text)
    said = [one for one in leg.speaker.said if one.text == spoken.text]
    assert said
    assert said[0].pinned is True
    sample = next(iter(push.latency))
    assert sample.prefetched is True
    # The phrasing happened during the previous answer, so the candidate waited for none of it.
    assert sample.phrasing_ms is None
    assert sample.tts_first_byte_ms is None
    # One phrasing call, not two: the exchange found it already made.
    assert purposes(list(push.ai_calls)).count("interviewer") == 1


# ---- Ending.


async def test_the_interview_ending_ends_the_leg() -> None:
    leg = Leg()
    await leg.open()
    await leg.leg.end_early()
    await leg.leg.drain()

    assert leg.leg.ended is True
    last = leg.api.pushes[-1]
    assert last.ended is True
    assert last.end_reason == "candidate_ended"
    outcome = await leg.leg.close("completed")
    assert outcome.ended is True
    assert outcome.reason == "completed"


async def test_closing_meters_the_leg_once() -> None:
    leg = Leg()
    await leg.open()
    leg.clock.advance(812.4)
    leg.leg.note_reconnect()
    outcome = await leg.leg.close("fallback_poor_connection")

    assert outcome.voice_seconds == 813  # rounded up: a vendor bills the second it started in
    assert outcome.turns_spoken == 2
    assert len(leg.api.legs) == 1
    metered = leg.api.legs[0]
    assert metered.reason == "fallback_poor_connection"
    assert metered.quality.reconnects == 1
    # Twice is not twice on the ledger.
    await leg.leg.close("fallback_poor_connection")
    assert len(leg.api.legs) == 1


async def test_nothing_happens_after_the_leg_is_closed() -> None:
    leg = Leg()
    await leg.open()
    await leg.leg.close("candidate_left")
    before = len(leg.speaker.said)
    await leg.answer()
    assert len(leg.speaker.said) == before


async def test_an_answer_after_the_interview_ended_is_ignored() -> None:
    leg = Leg()
    await leg.open()
    await leg.leg.end_early()
    await leg.leg.drain()
    before = len(leg.api.pushes)
    await leg.answer()
    assert len(leg.api.pushes) == before


# ---- The push, and its failures.


async def test_exchanges_are_pushed_in_the_order_they_happened() -> None:
    leg = Leg()
    await leg.open()
    await leg.answer()
    await leg.answer()
    seqs = [turn.seq for push in leg.api.pushes for turn in push.turns]
    assert seqs == sorted(seqs)
    assert len(set(seqs)) == len(seqs)


async def test_a_lost_push_does_not_stop_the_interview() -> None:
    # The API's stored snapshot is the authority, so a lost exchange is replayed by the next leg.
    leg = Leg(api=FakeApi(fail_pushes=1))
    await leg.open()
    await leg.answer()
    assert len(leg.api.pushes) == 1  # the intro's push was lost; the answer's landed
    assert leg.speaker.said  # and the candidate heard every word of it
    outcome = await leg.leg.close("completed")
    assert outcome.turns_spoken >= 3


async def test_a_duplicate_is_not_an_error() -> None:
    leg = Leg(api=FakeApi(duplicate=True))
    await leg.open()
    await leg.answer()
    assert len(leg.api.pushes) == 2


# ---- The allowance.


async def test_the_leg_knows_when_it_has_used_the_minutes_the_session_had() -> None:
    leg = Leg(voice_seconds_remaining=60)
    await leg.open()
    assert leg.leg.allowance_exhausted is False
    leg.clock.advance(61)
    assert leg.leg.allowance_exhausted is True


# ---- A refused exchange.


class UnreachableLLM:
    """A model that will not answer anything. Every turn falls back to its pinned wording —
    except the one that has none: answering a question the candidate asked."""

    provider = "fake"

    async def parse[T: object](self, **_kwargs: object) -> T:
        raise FakeLLMError()


async def test_a_model_that_will_not_answer_gives_a_plainer_interview() -> None:
    deck = bundle(questions=[question(0)], question_budget=1, max_follow_ups=0)
    leg = Leg(deck=deck, llm=UnreachableLLM())
    await leg.open()
    # The greeting and the question were still spoken, from their own pinned wording.
    assert len(leg.speaker.said) == 2
    assert leg.deck.questions[0].prompt in leg.speaker.lines[1]


async def test_a_question_the_interviewer_cannot_answer_is_said_out_loud() -> None:
    # The one call with no honest fallback (`interview/calls.py`). In text mode the API reports an
    # error; in voice the alternative to saying something is silence, which reads as a dropped call.
    deck = bundle(questions=[question(0)], question_budget=1, max_follow_ups=0)
    leg = Leg(deck=deck, llm=UnreachableLLM())
    await leg.open()
    await leg.answer()  # the answer moves the session to the candidate's own questions
    pushes_before = len(leg.api.pushes)

    await leg.leg.on_answer("What is the salary?", timing=leg.timing())
    await leg.leg.drain()

    assert CANNOT_ANSWER in leg.speaker.lines
    # Nothing was stored: a refused exchange produces no push, exactly as it produces no turns.
    assert len(leg.api.pushes) == pushes_before
