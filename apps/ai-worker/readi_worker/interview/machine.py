"""The interview state machine: pure, no I/O, `now` passed in (CLAUDE.md §5, the plan's §"The
state machine").

```
  START ─► INTRO ─► QUESTION ◄──────────────┐
                      │                     │
                      ▼                     │
                  FOLLOW_UP ──(0..cap 2)────┤
                      │                     │
                      └─► next question ────┘  while the question and time budgets allow
                      │
                      ▼
             CANDIDATE_QUESTIONS ─► WRAP_UP ─► ENDED
                      ▲                ▲
                      │                │
        (skipped when out of time)   (time exhausted, or the candidate ends early)
```

**The LLM is never consulted about any of this.** It phrases what a state decided to say, and it
judges whether an answer already reached a probe; it does not choose the next state, the length of
the session, which questions are asked or what to probe. That is why everything in this module is a
function of `(state, bundle, now)` and returns a new state — the tests are a transition table, not a
mocked conversation.

The division of labour with `service.py`: the machine decides *what should be said next* and hands
back a `Step`; the service performs the step, which is the only part that talks to a model. There is
no `apply(outcome)` because there is nothing about a spoken turn the engine needs to learn: the
bookkeeping is decided when the step is, and an exchange that fails is discarded whole.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Literal

from readi_worker.contracts import InterviewEngineSnapshot, InterviewSessionBundle
from readi_worker.interview import budgets
from readi_worker.interview.probes import choose_probe, probes_in_play

StateName = Literal["intro", "question", "follow_up", "candidate_questions", "wrap_up", "ended"]
EndReason = Literal["questions_done", "out_of_time", "candidate_ended"]

#: `ENGINE_SNAPSHOT_VERSION` in @readi/shared-types. The contract pins it as a literal, so a
#: snapshot from an engine that does not know this shape is refused at the boundary, loudly.
SNAPSHOT_VERSION = 1


class EngineError(Exception):
    """The request cannot be carried out: it does not fit the state, or the state does not fit the
    bundle. Carries the `error` code the response reports."""

    def __init__(self, code: Literal["bad_request", "engine_error"], reason: str) -> None:
        super().__init__(reason)
        self.code = code


# -------------------------------------------------------------------------------------------------
# The state.


@dataclass(frozen=True, slots=True)
class QuestionProgress:
    """Where one question stands. Both tuples index `planned_follow_ups`, never criteria — see
    `probes.py` for why that distinction is load-bearing."""

    position: int
    asked: bool = False
    probes_asked: tuple[int, ...] = ()
    probes_covered: tuple[int, ...] = ()

    @property
    def follow_ups_asked(self) -> int:
        return len(self.probes_asked)


@dataclass(frozen=True, slots=True)
class EngineState:
    """Everything the engine knows.

    `awaiting` and `pending_text` are **not** in the snapshot and are always at their resting values
    when one is written: an exchange runs until the engine is waiting for the candidate or the
    session has ended, and a failed exchange is discarded rather than stored. So `awaiting` restores
    as "waiting unless ended", and there is no half-spoken state to describe.
    """

    state: StateName
    current_question: int | None
    next_seq: int
    questions_asked: int
    progress: tuple[QuestionProgress, ...]
    end_reason: EndReason | None = None
    awaiting: bool = False
    pending_text: str | None = None

    def at(self, position: int) -> QuestionProgress:
        return self.progress[position]


# -------------------------------------------------------------------------------------------------
# What the service must do next.


@dataclass(frozen=True, slots=True)
class SpeakIntro:
    seq: int


@dataclass(frozen=True, slots=True)
class AskQuestion:
    seq: int
    question: int


@dataclass(frozen=True, slots=True)
class AskFollowUp:
    seq: int
    question: int
    probe: int


@dataclass(frozen=True, slots=True)
class InviteCandidateQuestions:
    seq: int


@dataclass(frozen=True, slots=True)
class AnswerCandidateQuestion:
    seq: int
    text: str


@dataclass(frozen=True, slots=True)
class SpeakWrapUp:
    seq: int


@dataclass(frozen=True, slots=True)
class AwaitCandidate:
    """Nothing more to say until the candidate answers."""


@dataclass(frozen=True, slots=True)
class Finished:
    """The session is over."""


Step = (
    SpeakIntro
    | AskQuestion
    | AskFollowUp
    | InviteCandidateQuestions
    | AnswerCandidateQuestion
    | SpeakWrapUp
    | AwaitCandidate
    | Finished
)

#: Which state a step is spoken in — the `state` the turn is recorded under.
STEP_STATE: dict[type, StateName] = {
    SpeakIntro: "intro",
    AskQuestion: "question",
    AskFollowUp: "follow_up",
    InviteCandidateQuestions: "candidate_questions",
    AnswerCandidateQuestion: "candidate_questions",
    SpeakWrapUp: "wrap_up",
}


# -------------------------------------------------------------------------------------------------
# Starting, restoring, storing.


def begin(bundle: InterviewSessionBundle) -> EngineState:
    """A session nobody has started yet: exactly what `interview_sessions` defaults to."""
    return EngineState(
        state="intro",
        current_question=None,
        next_seq=0,
        questions_asked=0,
        progress=tuple(QuestionProgress(position=index) for index in range(len(bundle.questions))),
        awaiting=True,
    )


def from_snapshot(snapshot: InterviewEngineSnapshot, bundle: InterviewSessionBundle) -> EngineState:
    """Restore the engine from what the API stored.

    Raises rather than repairing when the snapshot does not describe this bundle: a session resumed
    against a different set of questions would produce a transcript that quietly means something
    else, and `interview_session_questions` is pinned precisely so that cannot happen.
    """
    if len(snapshot.progress) != len(bundle.questions):
        raise EngineError(
            "engine_error",
            f"snapshot describes {len(snapshot.progress)} questions, "
            f"bundle carries {len(bundle.questions)}",
        )
    current = _unwrap(snapshot.current_question)
    if current is not None and not 0 <= current < len(bundle.questions):
        raise EngineError("engine_error", "snapshot points at a question the bundle does not have")
    return EngineState(
        state=snapshot.state,
        current_question=current,
        next_seq=snapshot.next_seq,
        questions_asked=snapshot.questions_asked,
        progress=tuple(
            QuestionProgress(
                position=entry.position,
                asked=entry.asked,
                probes_asked=tuple(_ints(entry.probes_asked)),
                probes_covered=tuple(_ints(entry.probes_covered)),
            )
            for entry in sorted(snapshot.progress, key=lambda entry: entry.position)
        ),
        end_reason=snapshot.end_reason,
        awaiting=snapshot.state != "ended",
    )


def to_snapshot(state: EngineState) -> InterviewEngineSnapshot:
    return InterviewEngineSnapshot.model_validate(
        {
            "version": SNAPSHOT_VERSION,
            "state": state.state,
            "current_question": state.current_question,
            "next_seq": state.next_seq,
            "questions_asked": state.questions_asked,
            "progress": [
                {
                    "position": entry.position,
                    "asked": entry.asked,
                    "probes_asked": list(entry.probes_asked),
                    "probes_covered": list(entry.probes_covered),
                }
                for entry in state.progress
            ],
            "end_reason": state.end_reason,
        }
    )


# -------------------------------------------------------------------------------------------------
# Folding in what the candidate did.


def start(state: EngineState) -> EngineState:
    if state.state != "intro":
        raise EngineError("bad_request", f"cannot start a session already in {state.state}")
    return replace(state, awaiting=False)


def probes_to_judge(
    state: EngineState, bundle: InterviewSessionBundle, now: datetime
) -> tuple[int, ...]:
    """Which probes a coverage call would have to be about — empty when there is no call to make.

    This is the one place the "skip the coverage call" rule lives, and it is free rather than a
    trade: every case here is one where the verdict could not change what happens next.

    - the follow-up budget for this question is spent, so nothing more will be asked;
    - every probe has been asked or already covered, so there is nothing left to choose from;
    - the deadline leaves no room for a follow-up, so the engine is moving on regardless.

    The turn is still logged, as `not_judged` for every criterion — which is exactly what happened.
    """
    if state.state not in ("question", "follow_up") or state.current_question is None:
        return ()
    if not budgets.has_time_for(budgets.SECONDS_FOR_A_FOLLOW_UP, bundle.ends_at, now):
        return ()
    progress = state.at(state.current_question)
    if progress.follow_ups_asked >= bundle.max_follow_ups:
        return ()
    question = bundle.questions[state.current_question]
    return probes_in_play(question, progress.probes_asked, progress.probes_covered)


def take_answer(
    state: EngineState, text: str, covered: Iterable[int] = ()
) -> tuple[EngineState, int]:
    """Record that the candidate said something, and which probes it already covered.

    Returns the new state and the seq the candidate's turn takes; the interviewer's reply, if any,
    comes from `plan`.
    """
    if state.state in ("intro", "wrap_up", "ended"):
        raise EngineError("bad_request", f"nothing to answer in {state.state}")
    if not state.awaiting:
        raise EngineError("bad_request", "the engine is not waiting for an answer")
    seq = state.next_seq
    progress = state.progress
    if state.state in ("question", "follow_up") and state.current_question is not None:
        entry = state.at(state.current_question)
        merged = tuple(sorted(set(entry.probes_covered) | set(covered)))
        progress = _with(progress, replace(entry, probes_covered=merged))
    # `pending_text` is only for a question the CANDIDATE asked, which is the one utterance the
    # engine has to hold on to in order to answer it. An answer to an interview question is not
    # held here: the service already has it for the follow-up prompt, and leaving it set made the
    # engine answer the candidate's *answer* as though it had been a question to them.
    pending = text if state.state == "candidate_questions" else None
    return (
        replace(state, next_seq=seq + 1, progress=progress, awaiting=False, pending_text=pending),
        seq,
    )


def skip(state: EngineState, bundle: InterviewSessionBundle, now: datetime) -> EngineState:
    """Pass on the current question, or on asking one of their own.

    No candidate turn is written. A question with an `asked_at` and no answer beneath it already
    reads as "they skipped this", and inventing a `(skipped)` line would put words the candidate
    never said into a transcript M4 scores.
    """
    if not state.awaiting:
        raise EngineError("bad_request", "the engine is not waiting for the candidate")
    if state.state in ("question", "follow_up"):
        return _past_current_question(replace(state, awaiting=False), bundle, now)
    if state.state == "candidate_questions":
        return _to_wrap_up(replace(state, awaiting=False), "questions_done")
    raise EngineError("bad_request", f"nothing to skip in {state.state}")


def end_early(state: EngineState) -> EngineState:
    """The candidate ended the interview. Their words so far stand; the close is still spoken."""
    if state.state == "ended":
        raise EngineError("bad_request", "the session has already ended")
    return _to_wrap_up(replace(state, awaiting=False), "candidate_ended")


# -------------------------------------------------------------------------------------------------
# What happens next.


def plan(
    state: EngineState, bundle: InterviewSessionBundle, now: datetime
) -> tuple[EngineState, Step]:
    """The next thing to say, and the state it leaves behind.

    Bookkeeping that does not depend on how the model answers — which question we are on, that it
    has been asked, which probe was chosen, the turn's seq — is decided here rather than folded back
    afterwards. That is sound because a failed exchange stores nothing: either the whole response is
    persisted or the engine is exactly where it was.
    """
    if state.state == "ended":
        return state, Finished()
    if state.awaiting:
        return state, AwaitCandidate()

    seq = state.next_seq
    spoken = replace(state, next_seq=seq + 1)

    if state.state == "intro":
        return _opening(spoken, bundle, now), SpeakIntro(seq=seq)

    if state.state == "question":
        current = _current(state)
        progress = state.at(current)
        if not progress.asked:
            asked = replace(
                spoken,
                questions_asked=state.questions_asked + 1,
                progress=_with(state.progress, replace(progress, asked=True)),
                awaiting=True,
            )
            return asked, AskQuestion(seq=seq, question=current)
        return _after_an_answer(state, bundle, now)

    if state.state == "follow_up":
        return _after_an_answer(state, bundle, now)

    if state.state == "candidate_questions":
        if state.pending_text is None:
            return replace(spoken, awaiting=True), InviteCandidateQuestions(seq=seq)
        if budgets.out_of_time(bundle.ends_at, now):
            # Their question arrived after the deadline. The close ends warmly rather than the
            # engine starting an answer the session has no room for.
            return plan(
                _to_wrap_up(replace(state, pending_text=None), _natural_reason(state, bundle)),
                bundle,
                now,
            )
        answering = replace(spoken, awaiting=True, pending_text=None)
        return answering, AnswerCandidateQuestion(seq=seq, text=state.pending_text)

    if state.state == "wrap_up":
        ended = replace(
            spoken,
            state="ended",
            current_question=None,
            end_reason=state.end_reason or _natural_reason(state, bundle),
            awaiting=False,
        )
        return ended, SpeakWrapUp(seq=seq)

    raise EngineError("engine_error", f"no step for {state.state}")


def _after_an_answer(
    state: EngineState, bundle: InterviewSessionBundle, now: datetime
) -> tuple[EngineState, Step]:
    """A question has been answered: probe what is still open, or move on.

    Out of time means no probe at all — the second half of the free latency saving, of which
    `probes_to_judge` is the first: with the deadline past there is nothing a follow-up could be
    part of, so neither the coverage call nor the phrasing call is made.
    """
    current = _current(state)
    progress = state.at(current)
    probe: int | None = None
    if budgets.has_time_for(budgets.SECONDS_FOR_A_FOLLOW_UP, bundle.ends_at, now):
        probe = choose_probe(
            bundle.questions[current],
            progress.probes_asked,
            progress.probes_covered,
            bundle.max_follow_ups,
        )
    if probe is None:
        return plan(_past_current_question(state, bundle, now), bundle, now)
    seq = state.next_seq
    asking = replace(
        state,
        state="follow_up",
        next_seq=seq + 1,
        progress=_with(
            state.progress, replace(progress, probes_asked=(*progress.probes_asked, probe))
        ),
        awaiting=True,
    )
    return asking, AskFollowUp(seq=seq, question=current, probe=probe)


def _opening(state: EngineState, bundle: InterviewSessionBundle, now: datetime) -> EngineState:
    """Where the engine stands once the greeting has been spoken: on the first question."""
    if not bundle.questions:
        return _to_wrap_up(state, "questions_done")
    if budgets.out_of_time(bundle.ends_at, now):
        return _to_wrap_up(state, "out_of_time")
    return replace(state, state="question", current_question=0, awaiting=False)


def _past_current_question(
    state: EngineState, bundle: InterviewSessionBundle, now: datetime
) -> EngineState:
    """Close the current question and decide what the budgets allow next.

    The time budget is the authoritative one (CLAUDE.md §5), so it is consulted first: a session
    whose deadline has passed goes to the close whatever the question count says.
    """
    if budgets.out_of_time(bundle.ends_at, now):
        return _to_wrap_up(state, "out_of_time")
    following = _current(state) + 1
    if _room_in_the_count(state, bundle, following) and budgets.has_time_for(
        budgets.SECONDS_FOR_A_QUESTION, bundle.ends_at, now
    ):
        return replace(state, state="question", current_question=following, awaiting=False)
    if not budgets.has_time_for(budgets.SECONDS_FOR_CANDIDATE_QUESTIONS, bundle.ends_at, now):
        return _to_wrap_up(state, _natural_reason(state, bundle))
    return replace(state, state="candidate_questions", current_question=None, awaiting=False)


def _to_wrap_up(state: EngineState, reason: EndReason) -> EngineState:
    return replace(
        state,
        state="wrap_up",
        current_question=None,
        # Ending early is the candidate's act and outranks whatever the budgets would have said.
        end_reason="candidate_ended" if state.end_reason == "candidate_ended" else reason,
        awaiting=False,
    )


def _room_in_the_count(state: EngineState, bundle: InterviewSessionBundle, following: int) -> bool:
    return state.questions_asked < bundle.question_budget and following < len(bundle.questions)


def _natural_reason(state: EngineState, bundle: InterviewSessionBundle) -> EndReason:
    """Why the questioning stopped, when nothing has already said. Derived rather than stored, so
    that a snapshot taken during `candidate_questions` does not read as a session that has ended."""
    if state.end_reason is not None:
        return state.end_reason
    used_them_all = state.questions_asked >= len(bundle.questions)
    return (
        "questions_done"
        if state.questions_asked >= bundle.question_budget or used_them_all
        else "out_of_time"
    )


def _current(state: EngineState) -> int:
    if state.current_question is None:
        raise EngineError("engine_error", f"{state.state} with no current question")
    return state.current_question


def _with(
    progress: tuple[QuestionProgress, ...], entry: QuestionProgress
) -> tuple[QuestionProgress, ...]:
    return tuple(entry if item.position == entry.position else item for item in progress)


def _unwrap(value: object) -> int | None:
    """Generated contracts wrap a *nullable* constrained int in a Pydantic RootModel."""
    return None if value is None else _int(value)


def _ints(values: Sequence[object]) -> list[int]:
    return [_int(value) for value in values]


def _int(value: object) -> int:
    root: object = getattr(value, "root", value)
    if not isinstance(root, int):
        raise EngineError("engine_error", f"expected an integer, got {type(root).__name__}")
    return root
