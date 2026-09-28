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

#: A follow-up is one sentence and one answer, so it needs less than a question does. Below this the
#: engine moves on rather than asking something the deadline will interrupt.
#:
#: **75, provisionally, on a sample of eight** (owner's decision, 2026-09-29). It was 45, a guess
#: made before anybody had typed an answer into this, and the first measurement said the guess was
#: wrong in the direction that costs the candidate: over the sessions
#: `pnpm --filter @readi/api interviews:pace` could read, the median follow-up answer took **61 s
#: and five of eight ran past 45**, so the engine was starting probes the clock could not finish.
#: 75 sits above that median with room, and deliberately not at the p90 (224 s) — one slow answer
#: in eight should not buy every candidate a shorter interview.
#:
#: **What makes it safe to be wrong about.** Reserving too much ends a session with a probe unasked,
#: and since the owner's decision of 2026-09-27 an unasked criterion is **not assessed** and leaves
#: the denominator (`scoring.ts`) — so the cost of over-reserving is a slightly shorter interview,
#: not a lower score. Reserving too little is the failure this fixes: a probe asked and cut off.
#:
#: **Provisional, and the way to revisit it is written down.** n=8 is a shape, not a number.
#: `interviews:pace` says NOT ENOUGH TO SET A CONSTANT FROM under 40 answers, and the figure to
#: re-read after the pilot is "follow-up answers that ran past it" on that report.
SECONDS_FOR_A_FOLLOW_UP = 75

#: Do not open a new question unless there is room for the answer **and** one probe after it
#: (the owner's decision, 2026-09-27).
#:
#: `SECONDS_FOR_A_QUESTION` on its own knowingly admitted a question it might not be able to probe —
#: "enough for the answer, if not for the probing" — and the first paid run showed what that costs.
#: It opened a fourth question with 127 seconds left, the answer took 99, and at submission 25
#: seconds remained against `SECONDS_FOR_A_FOLLOW_UP`: so `probes_to_judge` correctly returned
#: nothing, two probes went unasked, and the candidate had put to them one third of a rubric they
#: were scored on (`docs/progress/2026-09-27-m4-first-paid-evaluation.md` §1).
#:
#: The scoring fix of the same day means an unasked criterion no longer costs them anything, so this
#: is not what makes the interview fair — it is what makes it *whole*. A question whose probes
#: cannot be asked is a question the candidate answers once and is scored on one criterion of,
#: which is a worse interview than three proper questions and their own questions at the end. The
#: reserve now means what its neighbour's comment always claimed.
SECONDS_TO_OPEN_A_QUESTION = SECONDS_FOR_A_QUESTION + SECONDS_FOR_A_FOLLOW_UP

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
