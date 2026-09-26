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
from readi_worker.interview.asks import count_asks
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
from readi_worker.interview.transitions import connective
from readi_worker.prompts import as_data, render

logger = logging.getLogger(__name__)

#: Which version of each interview prompt is in use. **A released version is never edited in place**
#: (CLAUDE.md "Prompts"): a change is a new `v<N+1>` and one line here, so every other prompt keeps
#: saying what it said and a session's `prompt_versions` stays a true record of what spoke. This was
#: one shared `VERSION = 1` until 2026-09-26, which made "bump one prompt" impossible to express.
PROMPT_VERSIONS: dict[str, int] = {
    "interview_system": 1,
    # v2, 2026-09-26: v1 told the candidate "nobody else is listening", which is not true.
    "interview_intro": 2,
    # v2, 2026-09-26: the engine supplies the connective, and "do not add an ask" is now enforced.
    "interview_question": 2,
    "interview_followup": 1,
    "interview_coverage": 1,
    "interview_coverage_input": 1,
    # v2, 2026-09-26: v1 was accurate and read like a form. v3 the same day: v2 said "there is no
    # real company behind this" in front of every answer, because each call is told to and no call
    # can know it has already been said. It is said once now, in the invitation.
    "interview_candidate_questions": 3,
    "interview_wrapup": 1,
}

#: The interviewer's own words, for when the model cannot supply them. They are in the same register
#: as the prompts and English-only for the same reason the model's output is: this is the
#: interviewer speaking, not product copy, and it never passes through the web app's i18n.
#: Said once, and before any answer: the state machine always speaks the invitation before it
#: answers a candidate's question, which is what lets `interview_candidate_questions.v3` tell the
#: reply that the disclaimer is already out of the way (v2 repeated it in front of every answer).
FALLBACK_INVITE = (
    "Before we finish — is there anything you would like to ask me? There is no real company behind"
    " this one, so I will answer in general terms, and it is fine if you have nothing."
)
FALLBACK_WRAP_UP = "That is everything from me. Thank you for your time today, and all the best."


def _render(prompts: dict[str, int], name: str, **variables: object) -> str:
    """Render a prompt and record the version that was rendered.

    The recording is not a separate step a caller can forget: `interview_coverage_input` was
    rendered
    on every judged answer and named in no session's `prompt_versions` until this existed.
    """
    version = PROMPT_VERSIONS[name]
    prompts[name] = version
    return render(name, version, **variables)


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
        user = _render(
            prompts,
            "interview_coverage_input",
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
        verdicts, records = await self._interviewer.judge_coverage(
            system=_render(prompts, "interview_coverage"), user=user, probes=probes
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
        system = self._system(bundle, prompts)
        planned_total = min(bundle.question_budget, len(bundle.questions))

        if isinstance(step, SpeakIntro):
            text = normalise_speech(
                _render(
                    prompts,
                    "interview_intro",
                    is_diagnostic=bundle.is_diagnostic,
                    question_budget=planned_total,
                    planned_minutes=bundle.planned_minutes,
                )
            )
            return _turn(step.seq, "intro", text)

        if isinstance(step, AskQuestion):
            question = bundle.questions[step.question]
            line = connective(str(bundle.session_id), step.question, planned_total)
            user = _render(
                prompts,
                "interview_question",
                position=step.question,
                total=planned_total,
                question_block=as_data(question.prompt, "question"),
                has_context=question.context is not None,
                connective=line,
            )
            text = await self._say(
                "interviewer",
                system,
                user,
                # The fallback carries the connective too. It is the engine's own words and adds no
                # ask, and without it a rejected phrasing makes the interview lurch: the second paid
                # run fell back twice, and those were exactly the two questions the owner noticed
                # arriving with no transition and no "last one".
                f"{line} {question.prompt}".strip(),
                calls,
                prompts,
                asks_in_pinned=count_asks(question.prompt),
            )
            return _turn(step.seq, "question", text, question=step.question)

        if isinstance(step, AskFollowUp):
            question = bundle.questions[step.question]
            probe = question.planned_follow_ups[step.probe].probe
            user = _render(
                prompts,
                "interview_followup",
                question_block=as_data(question.prompt, "question"),
                answer_block=as_data(pending.text if pending else "", "answer"),
                probe_block=as_data(probe, "follow_up"),
            )
            text = await self._say(
                "follow_up", system, user, probe, calls, prompts, asks_in_pinned=count_asks(probe)
            )
            return _turn(step.seq, "follow_up", text, question=step.question, probe=step.probe)

        if isinstance(step, InviteCandidateQuestions):
            user = _render(prompts, "interview_candidate_questions", candidate_question_block="")
            text = await self._say("interviewer", system, user, FALLBACK_INVITE, calls, prompts)
            return _turn(step.seq, "candidate_questions", text)

        if isinstance(step, AnswerCandidateQuestion):
            user = _render(
                prompts,
                "interview_candidate_questions",
                candidate_question_block=as_data(step.text, "candidate_question"),
            )
            text = await self._say("interviewer", system, user, None, calls, prompts)
            return _turn(step.seq, "candidate_questions", text)

        if isinstance(step, SpeakWrapUp):
            user = _render(
                prompts, "interview_wrapup", end_reason=state.end_reason or "questions_done"
            )
            text = await self._say("interviewer", system, user, FALLBACK_WRAP_UP, calls, prompts)
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
        asks_in_pinned: int | None = None,
    ) -> str:
        """Say one turn. The user prompt has already recorded its own version through `_render`.

        `asks_in_pinned` is passed only where there is staff-written wording the turn must not
        exceed
        — a question and a follow-up. See `calls.speak` and `asks.py`.
        """
        spoken, records = await self._interviewer.speak(
            purpose=purpose,  # type: ignore[arg-type]  # one of the three Purpose literals
            system=system,
            user=user,
            fallback=fallback,
            asks_in_pinned=asks_in_pinned,
        )
        calls.extend(records)
        if spoken is None:
            raise UnanswerableError
        return spoken.text

    def _system(self, bundle: InterviewSessionBundle, prompts: dict[str, int]) -> str:
        """The shared system prompt. Catalogue names are staff-written content that lands in a
        *system* prompt, so they are wrapped as data like everything else (the `cv_parse` rule)."""
        stack = bundle.candidate.stack_label
        return _render(
            prompts,
            "interview_system",
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
