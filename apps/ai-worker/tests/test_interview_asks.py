"""The phrasing call may not add an ask, and the counter that decides whether it did.

This is the test the first paid run asked for. That run's four openings each gained a framing
sentence and no ask, which looked like the rule holding — but every opening in that session asked
three or four things already, so the model had nothing left to add. The banks now ask one thing
each. These tests are the one-ask case, driven from the model's side.
"""

import json
from pathlib import Path

import pytest

from readi_worker.interview.asks import count_asks
from readi_worker.interview.calls import (
    REJECTED_ADDED_ASK,
    CoverageJudgement,
    ProbeVerdict,
    Speech,
)
from readi_worker.interview.service import PROMPT_VERSIONS
from readi_worker.interview.transitions import LAST_QUESTION, NEXT_QUESTION, connective
from readi_worker.llm.fake import ScriptedLLMClient
from readi_worker.prompts import render
from tests.interview_fixtures import SESSION_ID, at, bundle, question
from tests.test_interview_injection import Recording
from tests.test_interview_service import build, request, texts

VECTORS = Path(__file__).parents[3] / "packages/shared-types/src/ask-vectors.json"

# ---- The counter, against the vectors the bank checker also asserts.


@pytest.mark.parametrize(
    "case", json.loads(VECTORS.read_text())["cases"], ids=lambda c: c["text"][:40]
)
def test_the_shared_vectors_hold(case: dict[str, object]) -> None:
    """`countAsks` in check-bank.mjs asserts the same file. Neither copy may drift from it."""
    assert count_asks(str(case["text"])) == case["asks"]


# ---- The guard.

PINNED = "Walk me through how that state comes about."


def scripted_speech(*speeches: str) -> ScriptedLLMClient:
    return ScriptedLLMClient([Speech(speech=text) for text in speeches])


async def test_a_phrased_opening_may_not_ask_more_than_the_pinned_one() -> None:
    """The defect the paid run could not have caught: one question phrased as two."""
    added = "Walk me through how that state comes about, and what you would change about it."
    assert count_asks(added) > count_asks(PINNED), "the fixture has to actually add an ask"

    llm = scripted_speech(added, added, added)  # every attempt misbehaves
    service, _ = build(llm)
    deck = bundle(questions=[question(0, prompt=PINNED)], question_budget=1)

    opening = await service.advance(request("start", now=at(0), deck=deck))

    spoken = texts(opening)[-1]
    assert spoken == PINNED, "the pinned wording is spoken instead of the model's second question"
    assert len(llm.calls) == 3, "rejected like invalid output is: two retries, then fall back"


async def test_the_same_number_of_asks_phrased_differently_is_kept() -> None:
    """The rule is about asks, not about wording: rephrasing is the whole point of the call."""
    rephrased = "Let's start with a scenario. Talk me through how that state comes about."
    assert count_asks(rephrased) == count_asks(PINNED)

    service, _ = build(scripted_speech(rephrased))
    deck = bundle(questions=[question(0, prompt=PINNED)], question_budget=1)

    opening = await service.advance(request("start", now=at(0), deck=deck))
    assert texts(opening)[-1] == rephrased


async def test_a_phrased_follow_up_may_not_add_an_ask_either() -> None:
    """A probe is one sentence, and two questions in it is the same defect in a smaller space."""
    probe = "What would you change?"
    greedy = "What would you change, and how would you find the rows that are already wrong?"
    assert count_asks(greedy) > count_asks(probe)

    # One question, one probe: coverage says nothing is covered, so the probe is asked.
    service, _ = build(
        ScriptedLLMClient(
            [
                Speech(speech="Question one."),  # the opening
                # Coverage: the answer did not reach the probe, so the probe is asked.
                CoverageJudgement(
                    probes=[
                        ProbeVerdict(probe=0, reason="nothing about it", already_answered=False)
                    ]
                ),
                Speech(speech=greedy),
                Speech(speech=greedy),
                Speech(speech=greedy),
            ]
        )
    )
    deck = bundle(
        questions=[question(0, criteria=2, probes=((1, probe),))], question_budget=1, minutes=30
    )
    opening = await service.advance(request("start", now=at(0), deck=deck))
    answered = await service.advance(
        request(
            "answer",
            now=at(1),
            text="Two updates, no transaction.",
            snapshot=opening.engine_snapshot,
        )
    )

    assert [turn.state for turn in answered.turns] == ["question", "follow_up"]
    assert texts(answered)[-1] == probe, "the probe's own wording, not the model's two questions"


async def test_the_invitation_is_not_held_to_a_count_it_has_no_pinned_wording_for() -> None:
    """There is no question behind the invitation, so there is nothing for it to exceed."""
    invite = "Before we finish — is there anything you would like to ask me? Anything at all?"
    service, _ = build(ScriptedLLMClient([Speech(speech="Question one."), Speech(speech=invite)]))
    deck = bundle(questions=[question(0)], question_budget=1, max_follow_ups=0)
    opening = await service.advance(request("start", now=at(0), deck=deck))
    answered = await service.advance(
        request("answer", now=at(1), text="An answer.", snapshot=opening.engine_snapshot)
    )
    assert texts(answered)[-1] == invite


# ---- The connective the engine supplies.


def test_the_question_prompt_carries_the_connective_and_the_first_one_carries_none() -> None:
    def rendered(position: int, line: str) -> str:
        return render(
            "interview_question",
            PROMPT_VERSIONS["interview_question"],
            position=position,
            total=4,
            question_block="<question>\nAsk this.\n</question>",
            has_context=False,
            connective=line,
        )

    assert 'Open with "Next one."' in rendered(1, "Next one.")
    assert "Open with" not in rendered(0, ""), "the intro has just introduced the first question"


async def test_the_engine_is_the_one_that_chooses_it() -> None:
    """Not the model: it is never sent the turns before this one, so it cannot avoid repeating."""
    llm = Recording()
    service, _ = build(llm)
    # No follow-ups, so the answer is followed by the next question rather than by a probe.
    deck = bundle(
        questions=[question(index) for index in range(3)],
        question_budget=3,
        minutes=30,
        max_follow_ups=0,
    )

    opening = await service.advance(request("start", now=at(0), deck=deck))
    await service.advance(
        request("answer", now=at(1), text="An answer.", snapshot=opening.engine_snapshot)
    )

    # The rendered prompt is wrapped, so compare on whitespace-normalised text.
    sent = [" ".join(call["user"].split()) for call in llm.calls]
    asked = [prompt for prompt in sent if "question 2 of the 3 you have" in prompt]
    assert asked, "the second question was put to the candidate"
    expected = connective(SESSION_ID, 1, 3)
    assert expected in NEXT_QUESTION
    assert f'Open with "{expected}"' in asked[0]


def test_a_session_does_not_repeat_a_connective_and_marks_its_last_question() -> None:
    session = "7ad41245-b13f-412a-8bf3-9250f9ef29dc"
    lines = [connective(session, position, 4) for position in range(4)]
    assert lines[0] == ""
    assert lines[3] in LAST_QUESTION, "the last question is worth marking"
    assert len(set(lines[1:3])) == 2, "and the ones before it do not repeat"
    assert all(line in NEXT_QUESTION for line in lines[1:3])


def test_two_sessions_do_not_sound_the_same() -> None:
    """Deterministic per session, not fixed across them — and not `hash()`, which is salted."""
    mine = [connective("11111111-1111-4111-8111-111111111111", p, 5) for p in range(1, 4)]
    yours = [connective("22222222-2222-4222-8222-222222222222", p, 5) for p in range(1, 4)]
    assert mine != yours
    assert mine == [connective("11111111-1111-4111-8111-111111111111", p, 5) for p in range(1, 4)]


# ---- Versions.


def test_every_prompt_version_in_use_has_a_file_and_every_file_is_accounted_for() -> None:
    """A bump with no template, or a template nothing points at, is caught here rather than live.

    A superseded version is **kept** — a session that spoke it names it, and must keep meaning
    what it meant (CLAUDE.md "Prompts") — so the rule is not "every file is in use". It is that
    every file is either the version in use or an earlier one of a prompt that is: a file nobody
    ever pointed at, or a version *above* the one in use, is a mistake.
    """
    directory = Path(__file__).parents[1] / "readi_worker/prompts"
    for name, version in PROMPT_VERSIONS.items():
        assert (directory / f"{name}.v{version}.md").is_file(), f"{name} v{version} is missing"

    for path in directory.glob("interview_*.v*.md"):
        prompt, _, on_disk = path.name.removesuffix(".md").rpartition(".v")
        assert prompt in PROMPT_VERSIONS, f"{path.name} belongs to no prompt in use"
        assert int(on_disk) <= PROMPT_VERSIONS[prompt], (
            f"{path.name} is above the version in use ({PROMPT_VERSIONS[prompt]})"
        )


# ---- What the guard leaves behind, and what it must never reject.


def test_every_connective_adds_no_ask() -> None:
    """Load-bearing: the connective rides on the pinned wording in the fallback, and it is compared
    against a ceiling computed from the question alone. One that counted as an ask would make the
    engine's own words trip the engine's own guard."""
    for line in (*NEXT_QUESTION, *LAST_QUESTION):
        assert count_asks(line) == 0, line


async def test_a_rejected_phrasing_is_logged_and_the_fallback_keeps_its_transition() -> None:
    """Both halves of what the second paid run made us go and read a transcript for.

    The rejection was invisible in `ai_call_log` — three `interviewer` rows that all said `ok` — and
    the fallback spoke the pinned question with no connective, so the interview lurched from one
    question into the next with nothing between them.
    """
    greedy = "Next one. Walk me through how that state comes about, and what you would change."
    assert count_asks(greedy) > count_asks(PINNED)

    llm = scripted_speech("Question one.", greedy, greedy, greedy)
    service, _ = build(llm)
    deck = bundle(
        questions=[question(0), question(1, prompt=PINNED)],
        question_budget=2,
        max_follow_ups=0,
        minutes=30,
    )
    opening = await service.advance(request("start", now=at(0), deck=deck))
    answered = await service.advance(
        request("answer", now=at(1), text="An answer.", snapshot=opening.engine_snapshot)
    )

    spoken = texts(answered)[-1]
    expected = connective(SESSION_ID, 1, 2)
    assert expected in LAST_QUESTION, "position 1 of 2 is the last question"
    assert spoken == f"{expected} {PINNED}", (
        "the pinned wording, but not stripped of its transition"
    )

    rejected = [
        call
        for call in answered.ai_calls
        if call.error_code is not None and call.error_code.root == REJECTED_ADDED_ASK
    ]
    assert len(rejected) == 3, "each attempt is one call, and each says why it was thrown away"
    # The calls succeeded and cost money; it is our check on the output that failed.
    assert all(call.status == "ok" for call in rejected)
