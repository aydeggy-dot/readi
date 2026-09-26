"""Bundles to interview against.

The probe shapes here are the ones the real corpus has, not invented ones. Across the 104 seeded
questions: 88 carry exactly two probes (the budget), 15 carry three, one carries four, and 16 have a
single criterion carrying two probes. Exactly one criterion per question has no probe at all — the
one the opening prompt asks for (the pilot rule, 2026-09-23) — so `criteria=3, probes on 1 and 2` is
the ordinary question and `TWO_ON_ONE` is the sixteen.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from readi_worker.contracts import InterviewSessionBundle

SESSION_ID = "11111111-2222-4333-8444-555555555555"
#: Whose session it is. Opaque, and on the bundle only so the worker can put it on a Langfuse
#: trace (ADR-0008); nothing renders it.
USER_ID = "99999999-8888-4777-8666-555555555555"
STARTED_AT = datetime(2026, 9, 25, 9, 0, tzinfo=UTC)

#: Three criteria, one probe each for criteria 1 and 2. The opening asks criterion 0.
ORDINARY = ((1, "How did you decide what to test first?"), (2, "What did that cost the team?"))

#: Criterion 1 carries two separable probes, criterion 2 one. Sixteen questions look like this.
TWO_ON_ONE = (
    (1, "How would you check that it actually works?"),
    (1, "And what would you do when that check fails?"),
    (2, "Who else would you bring into that decision?"),
)


def question(
    position: int,
    *,
    criteria: int = 3,
    probes: tuple[tuple[int, str], ...] = ORDINARY,
    context: str | None = None,
    prompt: str | None = None,
) -> dict[str, Any]:
    return {
        "position": position,
        "type": "technical",
        "topic_label": "Testing",
        "prompt": prompt or f"Question {position}: tell me about a system you have tested.",
        "context": context,
        "criterion_count": criteria,
        "planned_follow_ups": [{"criterion": c, "probe": p} for c, p in probes],
    }


def bundle(
    *,
    questions: list[dict[str, Any]] | None = None,
    minutes: int = 15,
    question_budget: int = 4,
    max_follow_ups: int = 2,
    ends_at: datetime | None = None,
    stack: str | None = "React",
    is_diagnostic: bool = False,
) -> InterviewSessionBundle:
    return InterviewSessionBundle.model_validate(
        {
            "session_id": SESSION_ID,
            "user_id": USER_ID,
            "mode": "text",
            "persona": "friendly",
            "is_diagnostic": is_diagnostic,
            "planned_minutes": minutes,
            "ends_at": (ends_at or STARTED_AT + timedelta(minutes=minutes)).isoformat(),
            "question_budget": question_budget,
            "max_follow_ups": max_follow_ups,
            "candidate": {
                "role_label": "Frontend engineer",
                "level_label": "Mid-level",
                "stack_label": stack,
                "weak_topics": [],
            },
            "questions": questions or [question(index) for index in range(4)],
        }
    )


def at(minute: float) -> datetime:
    """A `now` this many minutes into the session."""
    return STARTED_AT + timedelta(minutes=minute)
