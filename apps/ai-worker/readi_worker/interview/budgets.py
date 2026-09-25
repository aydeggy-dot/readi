"""The two budgets, and the reserves that stop the engine starting something it cannot finish.

The **time budget is the authoritative one** (CLAUDE.md §5): `ends_at` is a wall-clock deadline and
the question count is a cap, not a target. Everything here is a pure function of `ends_at` and the
`now` the API sent, so a session's pace is decided by one clock rather than by whichever machine
happened to answer.

The reserves are the interesting part. Without them the engine asks a fourth question with ninety
seconds left, cuts the candidate off mid-answer, and the transcript carries a stub nobody can score
— worse for the candidate than three questions and a proper close. Each reserve says how much time
the thing it guards is worth starting for.
"""

from datetime import datetime, timedelta

#: Do not open a new question with less than this left. A question plus its follow-ups is the
#: better part of a pace unit (225 s in a 15-minute session, 225 s in a 30-minute one), so two
#: minutes is roughly "enough for the answer, if not for the probing".
SECONDS_FOR_A_QUESTION = 120

#: A follow-up is one sentence and one answer, so it needs far less than a question does. Below
#: this the engine moves on rather than asking something the deadline will interrupt.
SECONDS_FOR_A_FOLLOW_UP = 45

#: Spec §4.3 gives the candidate their own questions at the end. Skipped when there is no room —
#: the plan's "out of time jumps to WRAP_UP, skipping CANDIDATE_QUESTIONS if there is no room".
SECONDS_FOR_CANDIDATE_QUESTIONS = 90


def seconds_left(ends_at: datetime, now: datetime) -> float:
    """Wall-clock seconds to the deadline; negative once it has passed."""
    return (ends_at - now).total_seconds()


def out_of_time(ends_at: datetime, now: datetime) -> bool:
    return seconds_left(ends_at, now) <= 0


def has_time_for(seconds: int, ends_at: datetime, now: datetime) -> bool:
    """Whether `seconds` of interview still fit before the deadline."""
    return seconds_left(ends_at, now) >= seconds


def deadline_after(minutes: int, started_at: datetime) -> datetime:
    """The deadline a session of `minutes` started at `started_at` runs to (for tests and tools)."""
    return started_at + timedelta(minutes=minutes)
