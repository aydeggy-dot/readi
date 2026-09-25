"""The interview-aware stand-in for the interviewer model (`LLM_PROVIDER=fake`).

It exists so that the whole engine — the API, the SSE route, the screen, the e2e suite — can be
built and run with no provider key, no network and no cost. `Settings` forbids `fake` in production.

It is deliberately dull. Asked to phrase a question it returns the pinned prompt; asked to phrase a
follow-up it returns the probe. That is exactly what the real prompts tell the model it may not
depart from, so a session run on the fake is a correct interview in a flat voice — which makes it a
useful thing to read in e2e output rather than a stream of lorem ipsum.

**Coverage is driven from the answer text**: a probe comes back already answered when the answer
contains `covered:<n>`. That is how an e2e test drives the "this answer covered everything, so no
follow-up" path and the ordinary one from the same code, deterministically. Nothing in the real
provider path looks at it.

The prompt sniffing below is the one fragile thing here, so `test_interview_fake.py` renders every
template and asserts each one is still recognised — the failure then arrives the moment a prompt is
reworded, rather than as a strange line in somebody's dev session.
"""

import re

from pydantic import BaseModel

from readi_worker.interview.calls import CoverageJudgement, ProbeVerdict, Speech
from readi_worker.llm.base import LLMClient, LLMResult

#: A marker in the candidate's own answer, read only by this stand-in.
COVERED = re.compile(r"covered:(\d+)", re.IGNORECASE)

FAKE_CANDIDATE_ANSWER = (
    "There is no real company behind this practice interview, so I cannot speak for one. "
    "Is there anything else you would like to ask?"
)
FAKE_INVITE = "Before we finish, is there anything you would like to ask me?"
FAKE_WRAP_UP = "That is everything from me. Thank you for your time, and all the best."


class FakeInterviewerLLMClient:
    """Answers the engine's two call shapes; anything else goes to `fallback` (the CV stand-in)."""

    provider = "fake"

    def __init__(self, fallback: LLMClient) -> None:
        self._fallback = fallback

    async def parse[T: BaseModel](
        self,
        *,
        model: str,
        system: str,
        user: str,
        output_type: type[T],
        max_tokens: int,
        timeout_s: float | None = None,
    ) -> LLMResult[T]:
        built: BaseModel | None = None
        if output_type is Speech:
            built = speak(user)
        elif output_type is CoverageJudgement:
            built = judge(user)
        if built is None:
            return await self._fallback.parse(
                model=model,
                system=system,
                user=user,
                output_type=output_type,
                max_tokens=max_tokens,
                timeout_s=timeout_s,
            )
        return LLMResult(
            output=output_type.model_validate(built.model_dump()),
            provider=self.provider,
            model="fake",
            input_tokens=0,
            output_tokens=0,
            latency_ms=0,
        )


def speak(user: str) -> Speech:
    """What the stand-in says, from whichever prompt it was given."""
    # `<follow_up>` is checked before `<question>`: the follow-up prompt carries both, because it
    # shows the model the question it is following up on.
    probe = tag(user, "follow_up")
    if probe is not None:
        return Speech(speech=probe)
    if tag(user, "candidate_question") is not None:
        return Speech(speech=FAKE_CANDIDATE_ANSWER)
    prompt = tag(user, "question")
    if prompt is not None:
        return Speech(speech=prompt)
    if "Invite the candidate" in user:
        return Speech(speech=FAKE_INVITE)
    return Speech(speech=FAKE_WRAP_UP)


def judge(user: str) -> CoverageJudgement:
    """Every probe the prompt lists, answered from `covered:<n>` markers in the candidate's text."""
    answer = tag(user, "answer") or ""
    covered = {int(match) for match in COVERED.findall(answer)}
    listed = re.findall(r"^\s*(\d+)\.", tag(user, "follow_ups") or "", re.MULTILINE)
    return CoverageJudgement(
        probes=[
            ProbeVerdict(
                probe=int(index),
                reason="development stand-in (LLM_PROVIDER=fake)",
                already_answered=int(index) in covered,
            )
            for index in listed
        ]
    )


def tag(text: str, name: str) -> str | None:
    """The contents of one `as_data(...)` block, or None when the prompt has no such block."""
    match = re.search(rf"<{name}>\n(.*?)\n</{name}>", text, re.DOTALL)
    return match.group(1).strip() if match else None
