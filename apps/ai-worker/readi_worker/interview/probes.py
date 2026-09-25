"""Choosing the next probe, and writing down what the answer covered.

Two rules from the owner's decision of 2026-09-23 (`docs/progress/2026-09-23-planned-follow-ups.md`)
live here and nowhere else:

**The planned follow-ups are a menu, not a script.** The engine asks a probe only for something the
answer has not already reached. A candidate whose first answer covers everything gets no follow-up
and moves on; asking the planned questions anyway would punish a complete answer with two redundant
ones.

**Prefer a criterion nothing has probed yet.** A criterion may carry two probes, so a question can
offer more probes than `max_follow_ups` allows — one QA question offers four. Reach a second probe
on the same criterion only when no other criterion is still open, and within a criterion ask them in
the order the question lists them: the first is the primary one and the banks are written that way.
Sixteen of the 104 seeded questions have a criterion carrying two probes, so this is a path with
real fixtures behind it rather than a defensive branch.

Both are decided **per probe**, never per criterion. Two probes on one criterion ask separable
things, so an answer can reach one and not the other; per-criterion bookkeeping would either re-ask
what was answered or drop what was not. Per criterion is how the *log* reads, because that is what a
rubric is — and `coverage_log` is where the two views meet.
"""

from collections.abc import Iterable, Sequence

from readi_worker.contracts import BundleQuestion, CriterionCoverage, PlannedFollowUp


def probes_in_play(
    question: BundleQuestion, asked: Iterable[int], covered: Iterable[int]
) -> tuple[int, ...]:
    """Probe indexes still worth asking: neither put to the candidate nor already answered."""
    spent = set(asked) | set(covered)
    return tuple(index for index in range(len(question.planned_follow_ups)) if index not in spent)


def choose_probe(
    question: BundleQuestion, asked: Sequence[int], covered: Iterable[int], max_follow_ups: int
) -> int | None:
    """The next probe to put to the candidate, or None when the menu is exhausted or capped.

    Capped in code whatever the model says (CLAUDE.md §5), and every follow-up comes from the menu:
    the engine keeps no slot for a probe it invented, which is the thing the planned-follow-up
    decision removed.
    """
    if len(asked) >= max_follow_ups:
        return None
    candidates = probes_in_play(question, asked, covered)
    if not candidates:
        return None
    probed_criteria = {question.planned_follow_ups[index].criterion for index in asked}
    fresh = [
        index
        for index in candidates
        if question.planned_follow_ups[index].criterion not in probed_criteria
    ]
    # `candidates` and `fresh` are in list order, so the primary probe of a criterion wins.
    return fresh[0] if fresh else candidates[0]


def covered_by(question: BundleQuestion, answered: Iterable[int]) -> tuple[int, ...]:
    """The probe indexes a judgement found already answered, bounded to ones this question has."""
    count = len(question.planned_follow_ups)
    return tuple(sorted({index for index in answered if 0 <= index < count}))


def coverage_log(
    question: BundleQuestion,
    *,
    judged: Iterable[int],
    answered: Iterable[int],
    chosen: int | None,
) -> list[CriterionCoverage]:
    """The per-criterion coverage log for one candidate turn (`session_turns.criteria_covered`).

    One entry per rubric criterion, which the worker can produce without ever being told what a
    criterion *is*: `criterion_count` crosses in the bundle and the probes carry their positions.

    - `has_probe` — whether any planned follow-up asks for this criterion. Exactly one criterion per
      question has none: the one the opening prompt asks for (the pilot rule, 2026-09-23). "No
      probe" is therefore the ordinary state, not an anomaly.
    - `covered` — `covered` when every probe of this criterion that was judged came back answered,
      `not_covered` when at least one did not, and `not_judged` when nothing judged it. A criterion
      is only *fully* covered when all of its probes are, because two probes on one criterion ask
      two separable things.
    - `not_judged` also covers the turn where the coverage call was skipped entirely, which is the
      honest record of it: nothing judged this, so nothing is claimed about it.
    """
    judged_set = set(judged)
    answered_set = set(answered)
    chosen_criterion = question.planned_follow_ups[chosen].criterion if chosen is not None else None
    log: list[CriterionCoverage] = []
    for criterion in range(question.criterion_count):
        probes = _probes_for(question.planned_follow_ups, criterion)
        judged_here = [index for index in probes if index in judged_set]
        if not judged_here:
            verdict = "not_judged"
        elif all(index in answered_set for index in judged_here):
            verdict = "covered"
        else:
            verdict = "not_covered"
        log.append(
            CriterionCoverage.model_validate(
                {
                    "criterion": criterion,
                    "has_probe": bool(probes),
                    "covered": verdict,
                    "follow_up_index": chosen if criterion == chosen_criterion else None,
                }
            )
        )
    return log


def _probes_for(planned: Sequence[PlannedFollowUp], criterion: int) -> list[int]:
    """Every probe for one criterion — a list, never a map keyed by criterion.

    `review-doc.ts` keyed a Map on `criterion` and silently dropped the second probe the day the cap
    moved to two (M3 planning item 9). The engine builds per-criterion views in three places and
    none of them may lose one.
    """
    return [index for index, probe in enumerate(planned) if probe.criterion == criterion]
