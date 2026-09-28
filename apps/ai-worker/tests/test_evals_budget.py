"""The spending cap, at the two levels it has to hold.

The arithmetic below is the whole guarantee, so it is worked out in each assertion rather than
copied from a run: a cap the owner approved is a promise, and a guard that is only approximately
right is the overrun conversation with extra steps.
"""

from readi_worker.evals.budget import SEED_ANSWER_MICRO_USD, Budget
from readi_worker.evals.results import Usage
from readi_worker.evaluation.calls import MAX_ATTEMPTS


def answer(cost_micro_usd: int, calls: int = 1) -> Usage:
    return Usage(calls=calls, cost_micro_usd=cost_micro_usd)


def test_the_first_answer_is_judged_against_the_seed() -> None:
    """Nothing has been measured yet, so the dearest figure anyone has measured is the bound."""
    assert Budget(SEED_ANSWER_MICRO_USD).may_start_another() is True
    assert Budget(SEED_ANSWER_MICRO_USD - 1).may_start_another() is False


def test_after_one_answer_the_bound_is_what_this_run_measured() -> None:
    budget = Budget(1_000_000)
    budget.record(answer(40_000, calls=2))
    # 2¢ a call, and an answer may use its whole retry budget.
    assert budget.next_answer_micro_usd == MAX_ATTEMPTS * 20_000
    assert budget.spent_micro_usd == 40_000


def test_the_bound_dominates_every_answer_the_run_has_already_scored() -> None:
    """The one way a per-answer average is beaten: an answer dearer than its predecessors.

    `MAX_ATTEMPTS times the dearest call` cannot be beaten that way, because an answer costs
    `calls times its own mean` and the evaluator cannot make more than `MAX_ATTEMPTS` calls.
    """
    budget = Budget(10_000_000)
    for usage in (answer(50_000), answer(30_000, calls=2), answer(90_000, calls=3)):
        budget.record(usage)
        assert budget.next_answer_micro_usd >= usage.cost_micro_usd


def test_it_stops_before_the_answer_that_could_cross_the_cap_not_after() -> None:
    budget = Budget(100_000)
    budget.record(answer(40_000))  # bound is now 3 times 4¢ = 12¢
    assert budget.spent_micro_usd + budget.next_answer_micro_usd == 160_000 > 100_000
    assert budget.may_start_another() is False
    # And the margin it stopped on is real money left unspent, not an overrun: 4¢ under the cap.
    assert budget.cap_micro_usd - budget.spent_micro_usd == 60_000


def test_exactly_at_the_cap_is_allowed_and_a_penny_over_is_not() -> None:
    budget = Budget(160_000)
    budget.record(answer(40_000))
    assert budget.may_start_another() is True, "40,000 + 120,000 is the cap, not past it"
    budget.record(answer(1))
    assert budget.may_start_another() is False


def test_a_free_run_is_never_stopped_after_its_first_answer() -> None:
    """The stand-in costs nothing, and a guard that stopped it would be a guard testing itself."""
    budget = Budget(SEED_ANSWER_MICRO_USD)
    budget.record(answer(0))
    assert budget.next_answer_micro_usd == 0
    for _ in range(50):
        assert budget.may_start_another() is True
        budget.record(answer(0))


def test_what_it_says_when_it_stops() -> None:
    budget = Budget(1_600_000)
    budget.record(answer(1_500_000, calls=1))
    reason = budget.why_it_stopped(remaining=8)
    assert "$1.50 spent of $1.60" in reason
    assert "up to $4.50" in reason
    assert "8 answer(s) not scored" in reason
    assert "--retry-unscored" in reason
