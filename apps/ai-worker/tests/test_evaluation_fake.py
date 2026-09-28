"""The stand-in evaluator: it must be bland, and it must not be a lie.

A stub that returned plausible scores with made-up quotes would make CI and the e2e run pass
while `evidence.py` was broken. So two things are asserted: that it reads the real prompt — the
criteria the prompt lists, and the candidate's actual words — and that what it produces goes
through exactly the same gates as a real model's output.
"""

from readi_worker.evaluation.evidence import MIN_QUOTE_CHARS, is_quoted
from readi_worker.evaluation.fake_script import read
from readi_worker.evaluation.service import candidate_words
from tests.evaluation_fixtures import ANSWER, criterion, request, service, turn


def _prompt(**kwargs: object) -> str:
    """The user prompt the service would really send, so the stand-in is read on the real thing."""
    from readi_worker.evaluation.service import criteria_block, transcript_block
    from readi_worker.prompts import as_data, render

    payload = request(**kwargs)  # type: ignore[arg-type]
    return render(
        "evaluate_answer_input",
        1,
        question_block=as_data(payload.question.prompt, "question"),
        context_block="",
        criteria_block=criteria_block(payload.question.rubric.criteria),
        ideal_points_block="",
        transcript_block=transcript_block(payload.exchange),
    )


def test_it_answers_every_criterion_the_prompt_lists_and_no_others() -> None:
    reading = read(_prompt(criteria=[criterion(0, "A"), criterion(1, "B"), criterion(2, "C")]))
    assert [entry.criterion for entry in reading.criteria] == [0, 1, 2]


def test_it_uses_the_positions_the_rubric_uses_rather_than_counting_from_zero() -> None:
    reading = read(_prompt(criteria=[criterion(3, "D"), criterion(7, "H")]))
    assert [entry.criterion for entry in reading.criteria] == [3, 7]


def test_its_quotes_are_the_candidates_own_words_and_verify() -> None:
    payload = request()
    reading = read(_prompt())
    said = candidate_words(payload.exchange)
    for entry in reading.criteria:
        for quote in entry.evidence:
            assert quote in said, "the stand-in must quote verbatim or it hides a broken verifier"
            assert is_quoted(quote, said)


def test_it_never_quotes_the_interviewer() -> None:
    reading = read(_prompt())
    for entry in reading.criteria:
        for quote in entry.evidence:
            assert "What do you do?" not in quote


def test_an_answer_too_short_to_quote_is_scored_zero_with_no_evidence() -> None:
    """Which is exactly what spec §6.2 permits, and what an empty answer deserves."""
    reading = read(_prompt(exchange=[turn(0, "candidate", "yes")]))
    assert all(entry.score == 0 for entry in reading.criteria)
    assert all(entry.evidence == [] for entry in reading.criteria)
    assert len("yes") < MIN_QUOTE_CHARS


def test_a_criterion_the_interview_never_asked_about_is_scored_zero_with_no_evidence() -> None:
    """Which is what makes the not-assessed exclusion reachable without a paid model.

    The stand-in has not read the answer, so it cannot claim the candidate volunteered a point they
    were never asked for — and an e2e report for an interview that ran out of time then shows the
    honest "we did not get to ask" rather than a 3 out of 4 nobody earned.
    """
    reading = read(
        _prompt(criteria=[criterion(0, "Asked"), criterion(1, "Never asked", asked_about=False)])
    )
    by_position = {entry.criterion: entry for entry in reading.criteria}
    assert by_position[0].score > 0
    assert by_position[0].evidence != []
    assert by_position[1].score == 0
    assert by_position[1].evidence == []
    assert "did not get to ask" in by_position[1].reasoning


def test_it_gives_a_different_mark_when_the_candidate_explained_themselves() -> None:
    explained = read(_prompt())
    assert "because" in ANSWER
    assert {entry.score for entry in explained.criteria} == {3}

    bare = read(_prompt(exchange=[turn(0, "candidate", "I would look at the query plan first")]))
    assert {entry.score for entry in bare.criteria} == {2}


async def test_the_stand_in_survives_the_gates_it_is_meant_to_exercise() -> None:
    """End to end through the real service, with the real checks in front of it."""
    from readi_worker.evaluation.calls import Evaluator
    from readi_worker.evaluation.fake_script import FakeEvaluatorLLMClient
    from readi_worker.evaluation.service import EvaluationService
    from readi_worker.llm.fake import FunctionLLMClient
    from readi_worker.tracing import NullTracer

    llm = FakeEvaluatorLLMClient(FunctionLLMClient(lambda _s, _u: read(_u)))
    evaluator = EvaluationService(Evaluator(llm, "fake"), NullTracer())
    response = await evaluator.evaluate(request())

    assert response.error is None
    assert response.evaluation is not None
    assert response.evaluation.confidence == "low", "a stand-in should not sound sure of itself"
    assert response.ai_calls[0].cost_micro_usd == 0


async def test_it_does_not_leak_the_rubric_into_the_candidates_report() -> None:
    """Gate 3 would catch it; the stand-in's own words are checked because e2e photographs them."""
    evaluator, _ = service([read(_prompt())])
    response = await evaluator.evaluate(request())
    assert response.error is None
