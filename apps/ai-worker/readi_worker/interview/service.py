"""One exchange: what the candidate did, what the interviewer says back, and what it cost.

The shape of this file is the plan's "events ride the response". In text mode every worker call is
initiated by the API, so a whole exchange — the candidate's turn, the interviewer's reply, the new
engine state and every `AiCallRecord` — comes back in one response body, and the API persists the
turns idempotently by `(session_id, seq)`.

**An exchange is all-or-nothing.** Nothing is stored until it completes, so a retry replays it
rather than resuming half of it, and the seqs the engine allocates make the replay idempotent. That
is why the machine decides its bookkeeping up front and there is no outcome to fold back.

The division of labour is strict: `machine.py` decides *what happens*, this file *performs* it, and
the model is asked only to phrase what was decided and to judge whether an answer already reached a
probe. Nothing here consults a model about the interview.
"""

import logging
from dataclasses import dataclass
from datetime import datetime

from readi_worker.contracts import (
    AiCallRecord,
    BundleQuestion,
    InterviewAdvanceRequest,
    InterviewAdvanceResponse,
    InterviewSessionBundle,
    InterviewTurn,
)
from readi_worker.interview import machine
from readi_worker.interview.calls import Interviewer, ProbeVerdict, normalise_speech
from readi_worker.interview.machine import (
    AnswerCandidateQuestion,
    AskFollowUp,
    AskQuestion,
    AwaitCandidate,
    EngineError,
    EngineState,
    Finished,
    InviteCandidateQuestions,
    SpeakIntro,
    SpeakWrapUp,
    Step,
)
from readi_worker.interview.probes import coverage_log, covered_by
from readi_worker.interview.state_store import CachedSession, InterviewStateStore
from readi_worker.prompts import as_data, render

logger = logging.getLogger(__name__)

VERSION = 1

#: The interviewer's own words, for when the model cannot supply them. They are in the same register
#: as the prompts and English-only for the same reason the model's output is: this is the
#: interviewer speaking, not product copy, and it never passes through the web app's i18n.
FALLBACK_INVITE = (
    "Before we finish — is there anything you would like to ask me? It is fine if not."
)
FALLBACK_WRAP_UP = "That is everything from me. Thank you for your time today, and all the best."


class UnanswerableError(Exception):
    """The one call with no honest fallback: answering a question the candidate asked."""


@dataclass(slots=True)
class _PendingAnswer:
    """What the candidate just said, held back until the exchange knows what it led to."""

    seq: int
    state: machine.StateName
    question: int | None
    judged: tuple[int, ...]
    answered: tuple[int, ...]
    text: str


class InterviewService:
    def __init__(self, interviewer: Interviewer, store: InterviewStateStore) -> None:
        self._interviewer = interviewer
        self._store = store

    async def advance(self, request: InterviewAdvanceRequest) -> InterviewAdvanceResponse:
        session_id = str(request.session_id)
        cached = await self._store.load(session_id)

        bundle = request.bundle or (cached.bundle if cached else None)
        if bundle is None:
            # The Redis-miss signal: the API cannot see a miss, so this is how it is told.
            return _refused(request, "bundle_required", [])
        if bundle.session_id != request.session_id:
            return _refused(request, "bad_request", [])

        calls: list[AiCallRecord] = []
        turns: list[InterviewTurn] = []
        prompts: dict[str, int] = {}
        pending: _PendingAnswer | None = None
        try:
            state = self._restore(request, cached, bundle)
            state, pending = await self._receive(state, bundle, request, calls, prompts)
            state = await self._speak_until_waiting(
                state, bundle, request.now, turns, calls, prompts, pending
            )
        except EngineError as exc:
            logger.info("interview %s refused: %s", session_id, exc)
            return _refused(request, exc.code, calls)
        except UnanswerableError:
            logger.info("interview %s could not answer the candidate's question", session_id)
            return _refused(request, "llm_error", calls)

        if pending is not None:
            turns.append(_candidate_turn(pending, bundle, turns))
        turns.sort(key=lambda turn: turn.seq)

        snapshot = machine.to_snapshot(state)
        await self._store.save(session_id, bundle, snapshot)
        return InterviewAdvanceResponse.model_validate(
            {
                "session_id": session_id,
                "state": state.state,
                "ended": state.state == "ended",
                "end_reason": state.end_reason if state.state == "ended" else None,
                "turns": [turn.model_dump(mode="json") for turn in turns],
                "engine_snapshot": snapshot.model_dump(mode="json"),
                "prompt_versions": prompts,
                "ai_calls": [call.model_dump(mode="json") for call in calls],
                "error": None,
            }
        )

    # ---- Where the engine starts from.

    def _restore(
        self,
        request: InterviewAdvanceRequest,
        cached: CachedSession | None,
        bundle: InterviewSessionBundle,
    ) -> EngineState:
        """The request's snapshot wins over Redis; see `state_store.py` for why."""
        if request.engine_snapshot is not None:
            return machine.from_snapshot(request.engine_snapshot, bundle)
        if cached is not None:
            return machine.from_snapshot(cached.snapshot, bundle)
        return machine.begin(bundle)

    # ---- What the candidate did.

    async def _receive(
        self,
        state: EngineState,
        bundle: InterviewSessionBundle,
        request: InterviewAdvanceRequest,
        calls: list[AiCallRecord],
        prompts: dict[str, int],
    ) -> tuple[EngineState, _PendingAnswer | None]:
        if request.action == "start":
            return machine.start(state), None
        if request.action == "end":
            return machine.end_early(state), None
        if request.action == "skip":
            return machine.skip(state, bundle, request.now), None

        text = request.text.root.strip() if request.text is not None else ""
        if not text:
            raise EngineError("bad_request", "an answer needs words")

        answering = state.state
        question_index = state.current_question if answering in ("question", "follow_up") else None
        judged: tuple[int, ...] = ()
        answered: tuple[int, ...] = ()
        if question_index is not None:
            judged = machine.probes_to_judge(state, bundle, request.now)
            if judged:
                verdicts = await self._judge(
                    bundle.questions[question_index], state, text, judged, calls, prompts
                )
                answered = covered_by(
                    bundle.questions[question_index],
                    [verdict.probe for verdict in verdicts if verdict.already_answered],
                )
                # Only what was really judged: a call that failed, or came back about two of the
                # three probes, leaves the rest `not_judged` rather than silently `not_covered`.
                judged = tuple(verdict.probe for verdict in verdicts)

        moved, seq = machine.take_answer(state, text, answered)
        return moved, _PendingAnswer(
            seq=seq,
            state=answering,
            question=question_index,
            judged=judged,
            answered=answered,
            text=text,
        )

    async def _judge(
        self,
        question: BundleQuestion,
        state: EngineState,
        answer: str,
        probes: tuple[int, ...],
        calls: list[AiCallRecord],
        prompts: dict[str, int],
    ) -> list[ProbeVerdict]:
        asked_before = state.at(question.position).probes_asked
        user = render(
            "interview_coverage_input",
            VERSION,
            question_block=as_data(question.prompt, "question"),
            answer_block=as_data(answer, "answer"),
            probed_before=(
                as_data(
                    "\n".join(question.planned_follow_ups[index].probe for index in asked_before),
                    "already_asked",
                )
                if asked_before
                else ""
            ),
            probes_block=as_data(
                "\n".join(
                    f"{index}. {question.planned_follow_ups[index].probe}" for index in probes
                ),
                "follow_ups",
            ),
        )
        prompts["interview_coverage"] = VERSION
        verdicts, records = await self._interviewer.judge_coverage(
            system=render("interview_coverage", VERSION), user=user, probes=probes
        )
        calls.extend(records)
        return verdicts or []

    # ---- What the interviewer says back.

    async def _speak_until_waiting(
        self,
        state: EngineState,
        bundle: InterviewSessionBundle,
        now: datetime,
        turns: list[InterviewTurn],
        calls: list[AiCallRecord],
        prompts: dict[str, int],
        pending: _PendingAnswer | None,
    ) -> EngineState:
        while True:
            state, step = machine.plan(state, bundle, now)
            if isinstance(step, AwaitCandidate | Finished):
                return state
            turns.append(await self._perform(step, state, bundle, calls, prompts, pending))

    async def _perform(
        self,
        step: Step,
        state: EngineState,
        bundle: InterviewSessionBundle,
        calls: list[AiCallRecord],
        prompts: dict[str, int],
        pending: _PendingAnswer | None,
    ) -> InterviewTurn:
        system = self._system(bundle)
        planned_total = min(bundle.question_budget, len(bundle.questions))

        if isinstance(step, SpeakIntro):
            prompts["interview_intro"] = VERSION
            text = normalise_speech(
                render(
                    "interview_intro",
                    VERSION,
                    is_diagnostic=bundle.is_diagnostic,
                    question_budget=planned_total,
                    planned_minutes=bundle.planned_minutes,
                )
            )
            return _turn(step.seq, "intro", text)

        if isinstance(step, AskQuestion):
            question = bundle.questions[step.question]
            user = render(
                "interview_question",
                VERSION,
                position=step.question,
                total=planned_total,
                question_block=as_data(question.prompt, "question"),
                has_context=question.context is not None,
            )
            text = await self._say(
                "interviewer", system, user, question.prompt, calls, prompts, "interview_question"
            )
            return _turn(step.seq, "question", text, question=step.question)

        if isinstance(step, AskFollowUp):
            question = bundle.questions[step.question]
            probe = question.planned_follow_ups[step.probe].probe
            user = render(
                "interview_followup",
                VERSION,
                question_block=as_data(question.prompt, "question"),
                answer_block=as_data(pending.text if pending else "", "answer"),
                probe_block=as_data(probe, "follow_up"),
            )
            text = await self._say(
                "follow_up", system, user, probe, calls, prompts, "interview_followup"
            )
            return _turn(step.seq, "follow_up", text, question=step.question, probe=step.probe)

        if isinstance(step, InviteCandidateQuestions):
            user = render("interview_candidate_questions", VERSION, candidate_question_block="")
            text = await self._say(
                "interviewer",
                system,
                user,
                FALLBACK_INVITE,
                calls,
                prompts,
                "interview_candidate_questions",
            )
            return _turn(step.seq, "candidate_questions", text)

        if isinstance(step, AnswerCandidateQuestion):
            user = render(
                "interview_candidate_questions",
                VERSION,
                candidate_question_block=as_data(step.text, "candidate_question"),
            )
            text = await self._say(
                "interviewer", system, user, None, calls, prompts, "interview_candidate_questions"
            )
            return _turn(step.seq, "candidate_questions", text)

        if isinstance(step, SpeakWrapUp):
            user = render(
                "interview_wrapup", VERSION, end_reason=state.end_reason or "questions_done"
            )
            text = await self._say(
                "interviewer", system, user, FALLBACK_WRAP_UP, calls, prompts, "interview_wrapup"
            )
            return _turn(step.seq, "wrap_up", text)

        raise EngineError("engine_error", f"cannot perform {type(step).__name__}")

    async def _say(
        self,
        purpose: str,
        system: str,
        user: str,
        fallback: str | None,
        calls: list[AiCallRecord],
        prompts: dict[str, int],
        prompt_name: str,
    ) -> str:
        prompts["interview_system"] = VERSION
        prompts[prompt_name] = VERSION
        spoken, records = await self._interviewer.speak(
            purpose=purpose,  # type: ignore[arg-type]  # one of the three Purpose literals
            system=system,
            user=user,
            fallback=fallback,
        )
        calls.extend(records)
        if spoken is None:
            raise UnanswerableError
        return spoken.text

    def _system(self, bundle: InterviewSessionBundle) -> str:
        """The shared system prompt. Catalogue names are staff-written content that lands in a
        *system* prompt, so they are wrapped as data like everything else (the `cv_parse` rule)."""
        stack = bundle.candidate.stack_label
        return render(
            "interview_system",
            VERSION,
            role_block=as_data(bundle.candidate.role_label, "role"),
            level_block=as_data(bundle.candidate.level_label, "level"),
            stack_block=as_data(stack.root, "stack") if stack is not None else "",
        )


# ---- Turns.


def _turn(
    seq: int,
    state: machine.StateName,
    text: str,
    *,
    question: int | None = None,
    probe: int | None = None,
) -> InterviewTurn:
    return InterviewTurn.model_validate(
        {
            "seq": seq,
            "speaker": "interviewer",
            "state": state,
            "question_position": question,
            "follow_up_index": probe,
            "text": text,
            "criteria_covered": None,
        }
    )


def _candidate_turn(
    pending: _PendingAnswer, bundle: InterviewSessionBundle, turns: list[InterviewTurn]
) -> InterviewTurn:
    """The candidate's own words, written once the exchange knows what they led to.

    Held back so that `criteria_covered.follow_up_index` can name the probe the engine really chose
    rather than one this code chose again alongside it — the selection rule lives in `probes.py` and
    running it twice is how two answers to one question start to disagree. The seq was allocated
    when the answer was taken, so the transcript still reads in order.
    """
    covered = None
    if pending.question is not None:
        chosen = next(
            (
                turn.follow_up_index.root
                for turn in turns
                if turn.state == "follow_up"
                and turn.follow_up_index is not None
                and turn.question_position is not None
                and turn.question_position.root == pending.question
            ),
            None,
        )
        covered = [
            entry.model_dump(mode="json")
            for entry in coverage_log(
                bundle.questions[pending.question],
                judged=pending.judged,
                answered=pending.answered,
                chosen=chosen,
            )
        ]
    return InterviewTurn.model_validate(
        {
            "seq": pending.seq,
            "speaker": "candidate",
            "state": pending.state,
            "question_position": pending.question,
            "follow_up_index": None,
            "text": pending.text,
            # `candidate_questions` turns carry no coverage log: nothing there is assessed
            # (owner's decision, 2026-09-25), so there is no criterion to cover.
            "criteria_covered": covered,
        }
    )


def _refused(
    request: InterviewAdvanceRequest, error: str, calls: list[AiCallRecord]
) -> InterviewAdvanceResponse:
    """Nothing happened. No turns, no snapshot, and whatever the attempt already cost."""
    return InterviewAdvanceResponse.model_validate(
        {
            "session_id": str(request.session_id),
            "state": request.engine_snapshot.state if request.engine_snapshot else "intro",
            "ended": False,
            "end_reason": None,
            "turns": [],
            "engine_snapshot": None,
            "prompt_versions": {},
            "ai_calls": [call.model_dump(mode="json") for call in calls],
            "error": error,
        }
    )
