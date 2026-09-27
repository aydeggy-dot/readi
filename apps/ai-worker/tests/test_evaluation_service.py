"""Scoring one answer: the three gates, the retries, and what is stored when nothing works.

The model is scripted here, so what is under test is the code around it — which is where every
guarantee the report makes actually lives. A real model is exercised by the paid run and measured by
`/evals`; neither belongs in a unit test.
"""

from readi_worker.evaluation.calls import CriterionReading
from readi_worker.evaluation.service import (
    NOT_ASKED_LABEL,
    PROMPT_VERSIONS,
    candidate_words,
    criteria_block,
    transcript_block,
)
from readi_worker.llm.fake import FakeLLMError
from readi_worker.prompts import render
from tests.evaluation_fixtures import (
    ANSWER,
    DESCRIPTOR_3,
    DIMENSION_0,
    DIMENSION_1,
    code_of,
    criterion,
    default_exchange,
    reading,
    request,
    service,
    turn,
)

# ---- The answer is scored.


async def test_a_reading_whose_quotes_check_out_is_stored_as_it_stands() -> None:
    evaluator, llm = service([reading()])
    response = await evaluator.evaluate(request())

    assert response.error is None
    assert response.position == 1
    assert response.evaluation is not None
    assert [(c.criterion, c.score, c.max_score) for c in response.evaluation.criteria] == [
        (0, 3, 4),
        (1, 3, 4),
    ]
    # No score was touched, and the model's own confidence stands when nothing was dropped.
    assert response.evaluation.confidence == "high"
    assert len(llm.calls) == 1
    assert len(response.ai_calls) == 1
    assert response.ai_calls[0].purpose == "evaluator"
    assert response.ai_calls[0].status == "ok"
    assert code_of(response.ai_calls[0]) is None


async def test_the_criteria_come_back_in_the_rubrics_order_however_the_model_ordered_them() -> None:
    reversed_reading = reading()
    reversed_reading.criteria.reverse()
    evaluator, _ = service([reversed_reading])
    response = await evaluator.evaluate(request())
    assert response.evaluation is not None
    assert [c.criterion for c in response.evaluation.criteria] == [0, 1]


async def test_what_the_answer_row_records_about_who_scored_it() -> None:
    evaluator, _ = service([reading()])
    assert evaluator.model_config_record == {"provider": "fake", "evaluator": "fake"}


# ---- Gate 1: every criterion, exactly once.


async def test_a_reading_that_skips_a_criterion_is_retried_and_told_which_one() -> None:
    incomplete = reading(criteria=[reading().criteria[0]])
    evaluator, llm = service([incomplete, reading()])
    response = await evaluator.evaluate(request())

    assert response.error is None
    assert len(llm.calls) == 2
    assert "criterion 1" in llm.calls[1]["user"]
    assert "left out" in llm.calls[1]["user"]
    # The first call is recorded, paid for, and marked as output we threw away — not as an error,
    # because the provider did its job.
    assert [call.status for call in response.ai_calls] == ["ok", "ok"]
    assert code_of(response.ai_calls[0]) == "rejected_criteria"
    assert response.ai_calls[0].cost_micro_usd >= 0


async def test_a_criterion_the_rubric_does_not_have_is_refused() -> None:
    invented = reading()
    invented.criteria.append(
        CriterionReading(criterion=7, reasoning="Invented.", evidence=[], score=4)
    )
    evaluator, llm = service([invented, reading()])
    response = await evaluator.evaluate(request())
    assert response.error is None
    assert "no criterion 7" in llm.calls[1]["user"]


# ---- Gate 2: every quote is the candidate's.


async def test_a_non_zero_score_quoting_words_nobody_said_is_retried() -> None:
    fabricated = reading()
    fabricated.criteria[1].evidence = ["I read the execution plan for the slowest query"]
    evaluator, llm = service([fabricated, reading()])
    response = await evaluator.evaluate(request())

    assert response.error is None
    assert len(llm.calls) == 2
    correction = llm.calls[1]["user"]
    assert "criterion 1" in correction
    assert "quote them" in correction
    assert "without correcting spelling" in correction
    assert code_of(response.ai_calls[0]) == "rejected_evidence"


async def test_quoting_the_interviewer_is_not_quoting_the_candidate() -> None:
    """The interviewer's turns are in the prompt so the model can see what was asked."""
    borrowed = reading()
    borrowed.criteria[0].evidence = ["Say an endpoint takes three seconds in production"]
    evaluator, llm = service([borrowed, reading()])
    response = await evaluator.evaluate(request())
    assert response.error is None
    assert len(llm.calls) == 2


async def test_a_zero_may_keep_its_empty_evidence() -> None:
    silent = reading()
    silent.criteria[1].score = 0
    silent.criteria[1].evidence = []
    evaluator, llm = service([silent])
    response = await evaluator.evaluate(request())
    assert response.error is None
    assert len(llm.calls) == 1
    assert response.evaluation is not None
    assert response.evaluation.criteria[1].evidence == []


async def test_a_zero_with_a_quote_survives_because_being_wrong_is_worth_quoting() -> None:
    """The confident, specific, wrong answer the rubric descriptors were rewritten for."""
    wrong = reading()
    wrong.criteria[1].score = 0
    wrong.criteria[1].evidence = ["I no trust my laptop"]
    evaluator, _ = service([wrong])
    response = await evaluator.evaluate(request())
    assert response.evaluation is not None
    assert response.evaluation.criteria[1].score == 0
    assert [quote.root for quote in response.evaluation.criteria[1].evidence] == [
        "I no trust my laptop"
    ]


async def test_an_unverifiable_quote_is_dropped_and_the_confidence_goes_down_with_it() -> None:
    mixed = reading()
    mixed.criteria[0].evidence = [
        "I go open the trace for that endpoint in production and count how many",
        "I would also profile the garbage collector",
    ]
    evaluator, llm = service([mixed])
    response = await evaluator.evaluate(request())

    assert len(llm.calls) == 1, "one quote survived, so there was nothing to retry"
    assert response.evaluation is not None
    assert len(response.evaluation.criteria[0].evidence) == 1
    # Stated "high", one quote dropped: one step down.
    assert response.evaluation.confidence == "medium"


async def test_a_zero_scored_criterion_still_loses_its_invented_quote() -> None:
    silent = reading()
    silent.criteria[1].score = 0
    silent.criteria[1].evidence = ["They mentioned the connection pool at length"]
    evaluator, llm = service([silent])
    response = await evaluator.evaluate(request())
    assert len(llm.calls) == 1
    assert response.evaluation is not None
    assert response.evaluation.criteria[1].evidence == []
    assert response.evaluation.confidence == "medium"


# ---- Gate 3: the rubric may not appear in what the candidate reads.


async def test_a_level_descriptor_pasted_into_the_feedback_is_refused() -> None:
    leaky = reading()
    leaky.criteria[0].reasoning = f"You did this: {DESCRIPTOR_3}."
    evaluator, llm = service([leaky, reading()])
    response = await evaluator.evaluate(request())

    assert response.error is None
    assert len(llm.calls) == 2
    assert "copied the rubric" in llm.calls[1]["user"]
    assert code_of(response.ai_calls[0]) == "rejected_rubric_echo"


async def test_a_descriptor_in_the_improvement_tip_is_refused_too() -> None:
    leaky = reading(improvement_tip=f"Next time: {DESCRIPTOR_3}.")
    evaluator, llm = service([leaky, reading()])
    await evaluator.evaluate(request())
    assert len(llm.calls) == 2


async def test_naming_the_dimension_is_not_a_leak() -> None:
    """The dimension is the vocabulary the feedback is written in; the candidate sees it anyway."""
    fine = reading()
    fine.criteria[0].reasoning = f"On {DIMENSION_0}, you went and looked. Good."
    evaluator, llm = service([fine])
    response = await evaluator.evaluate(request())
    assert len(llm.calls) == 1
    assert response.error is None


# ---- When there is no usable reading at all.


async def test_three_bad_readings_leave_the_answer_unscored_rather_than_invented() -> None:
    fabricated = reading()
    fabricated.criteria[1].evidence = ["I read the execution plan for the slowest query"]
    evaluator, llm = service(
        [fabricated, fabricated.model_copy(deep=True), fabricated.model_copy(deep=True)]
    )
    response = await evaluator.evaluate(request())

    assert len(llm.calls) == 3
    assert response.evaluation is None
    assert response.error == "invalid_output"
    # Every attempt is recorded: the report says this answer failed, and the log says what it cost.
    assert len(response.ai_calls) == 3


async def test_a_refusal_is_never_retried() -> None:
    evaluator, llm = service(["refusal", reading()])
    response = await evaluator.evaluate(request())
    assert len(llm.calls) == 1
    assert response.evaluation is None
    assert response.error == "refused"


async def test_a_timeout_says_so_and_a_connection_failure_does_not() -> None:
    evaluator, _ = service([FakeLLMError("APITimeoutError")] * 3)
    assert (await evaluator.evaluate(request())).error == "timeout"

    evaluator, _ = service([FakeLLMError("APIConnectionError")] * 3)
    assert (await evaluator.evaluate(request())).error == "provider_error"


async def test_a_provider_failure_is_retried_and_can_still_succeed() -> None:
    evaluator, llm = service([FakeLLMError(), reading()])
    response = await evaluator.evaluate(request())
    assert len(llm.calls) == 2
    assert response.error is None
    assert [call.status for call in response.ai_calls] == ["error", "ok"]


# ---- Normalising, rather than retrying, what is only untidy.


async def test_prose_past_its_limit_is_trimmed_instead_of_costing_a_retry() -> None:
    wordy = reading(
        improvement_tip="x" * 500,
        strengths=["y" * 300, "", "  "],
        covered_points=[f"point {index}" for index in range(30)],
    )
    evaluator, llm = service([wordy])
    response = await evaluator.evaluate(request())

    assert len(llm.calls) == 1
    assert response.evaluation is not None
    assert len(response.evaluation.improvement_tip) == 300
    assert len(response.evaluation.strengths) == 1
    assert len(response.evaluation.covered_points) == 10


async def test_an_empty_tip_is_replaced_rather_than_stored_blank() -> None:
    evaluator, _ = service([reading(improvement_tip="   ")])
    response = await evaluator.evaluate(request())
    assert response.evaluation is not None
    assert response.evaluation.improvement_tip


# ---- What the model is actually shown.


def test_the_criteria_are_numbered_by_position_and_carry_their_whole_ladder() -> None:
    block = criteria_block(request().question.rubric.criteria)
    assert block.startswith(f"0. {DIMENSION_0}")
    assert "1. Recognises the pattern" in block
    for rung in ("0 —", "1 —", "2 —", "3 —", "4 —"):
        assert rung in block
    # The rubric is the instruction, not a record of what happened, so it is not wrapped as data.
    assert "<rubric>" not in block


def test_a_criterion_the_interview_never_asked_about_is_labelled_as_such() -> None:
    """The one engine fact the evaluator is given (the owner's decision, 2026-09-27).

    It is here so the **prose** can be fair: a model that does not know the interview ran out of
    time writes "you did not mention how you would repair the rows", which reads to the candidate as
    a criticism for something nobody asked them. Whether it counts towards the score is decided in
    `scoring.ts`, on the same engine fact and on this reading's own 0-with-no-evidence.
    """
    block = criteria_block(
        request(
            criteria=[criterion(0, DIMENSION_0), criterion(1, DIMENSION_1, asked_about=False)]
        ).question.rubric.criteria
    )
    assert block.count(NOT_ASKED_LABEL) == 1
    # On the marked criterion, and under its dimension rather than anywhere else in the block.
    assert f"1. {DIMENSION_1}\n   {NOT_ASKED_LABEL}" in block
    assert f"0. {DIMENSION_0}\n   What it scores:" in block


def test_the_system_prompt_says_what_to_do_with_a_criterion_nobody_asked_about() -> None:
    """A rewording that drops the rule fails here rather than in a candidate's report."""
    system = render("evaluate_answer", PROMPT_VERSIONS["evaluate_answer"])
    assert "NOT ASKED" in system
    # Score it as the answer merits — the exclusion is arithmetic and is not the model's to apply.
    assert "Do not compensate" in system
    # And the half that is the model's: do not blame them for a question nobody put to them.
    assert "Do not tell the candidate they failed to say something" in system
    assert "missing_points" in system


def test_only_the_candidates_turns_are_evidence() -> None:
    said = candidate_words(request().exchange)
    assert ANSWER in said
    assert "Say an endpoint takes three seconds" not in said


def test_the_transcript_keeps_the_two_speakers_apart() -> None:
    block = transcript_block(request().exchange)
    assert block.count("<asked>") == 2
    assert block.count("<answer>") == 2


async def test_the_prompt_omits_the_blocks_it_has_nothing_for() -> None:
    evaluator, llm = service([reading(), reading()])
    await evaluator.evaluate(request(context=None, ideal_points=[]))
    assert "<context>" not in llm.calls[0]["user"]
    assert "What a strong answer covers" not in llm.calls[0]["user"]

    await evaluator.evaluate(request(context="function f() {}", ideal_points=["Counts queries."]))
    assert "<context>" in llm.calls[1]["user"]
    assert "What a strong answer covers" in llm.calls[1]["user"]


async def test_a_single_answer_with_no_follow_up_is_scored_the_same_way() -> None:
    evaluator, _ = service([reading()])
    response = await evaluator.evaluate(
        request(exchange=[default_exchange()[0], turn(1, "candidate", ANSWER)])
    )
    assert response.error is None


def test_every_prompt_in_the_family_has_its_own_version() -> None:
    assert set(PROMPT_VERSIONS) == {"evaluate_answer", "evaluate_answer_input"}
    assert all(version >= 1 for version in PROMPT_VERSIONS.values())


async def test_a_criterion_with_a_single_rung_is_still_numbered_from_its_position() -> None:
    """Positions are the rubric's, not the list's: a rubric starting at 2 must not be renumbered."""
    evaluator, llm = service(
        [
            reading(
                criteria=[
                    CriterionReading(
                        criterion=2, reasoning="a", evidence=["I go check the logs oh"], score=1
                    ),
                    CriterionReading(criterion=5, reasoning="b", evidence=[], score=0),
                ]
            )
        ]
    )
    response = await evaluator.evaluate(
        request(
            criteria=[criterion(2, "Two"), criterion(5, "Five")],
            exchange=[turn(0, "candidate", "I go check the logs oh, that is where I go start")],
        )
    )
    assert "2. Two" in llm.calls[0]["user"]
    assert response.evaluation is not None
    assert [c.criterion for c in response.evaluation.criteria] == [2, 5]
