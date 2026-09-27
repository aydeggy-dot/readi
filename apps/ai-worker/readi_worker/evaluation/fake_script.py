"""The stand-in evaluator for `LLM_PROVIDER=fake`: no key, no network, no cost.

Without it, CI and the e2e run would call a real model to score an answer — which is money per run
and a different score every time, so neither could assert anything. `Settings` forbids `fake` in
production.

It is deliberately dull and deliberately **honest**, because the thing it must not do is make the
real checks look satisfied when they are not. So it does what the real evaluator is required to do:

- one entry per criterion the prompt actually lists, read out of the prompt rather than assumed;
- evidence taken **verbatim from the candidate's own words** in the transcript, so `evidence.py`
  verifies it for the same reason it would verify a real model's quote;
- nothing copied out of the rubric, so the descriptor-echo guard has nothing to catch;
- and where the candidate said too little to quote, a score of 0 with no evidence — which is exactly
  what spec §6.2 permits and what a real evaluator should do with an answer that said nothing.

That last case is why this is a stand-in and not a stub: an e2e test that skips a question gets a
report which honestly says the answer was empty, rather than one that invented a mark for it.
"""

import re

from pydantic import BaseModel

from readi_worker.evaluation.calls import AnswerReading, CriterionReading
from readi_worker.evaluation.evidence import MIN_QUOTE_CHARS
from readi_worker.llm.base import LLMClient, LLMResult

#: `0. <dimension>` at the start of a line in the criteria block: the numbering the prompt hands
#: the model, and the one it must answer with.
_CRITERION = re.compile(r"^(\d+)\. ", re.MULTILINE)
_ANSWER = re.compile(r"<answer>\n(.*?)\n</answer>", re.DOTALL)

#: Long enough to be evidence, short enough to read as a quotation rather than the whole answer.
QUOTE_CHARS = 90


class FakeEvaluatorLLMClient:
    """Answers the evaluator's call shape; anything else goes to `fallback`."""

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
        if output_type is not AnswerReading:
            return await self._fallback.parse(
                model=model,
                system=system,
                user=user,
                output_type=output_type,
                max_tokens=max_tokens,
                timeout_s=timeout_s,
            )
        built = read(user)
        return LLMResult(
            output=output_type.model_validate(built.model_dump()),
            provider=self.provider,
            model="fake",
            input_tokens=0,
            output_tokens=0,
            latency_ms=0,
        )


def read(user: str) -> AnswerReading:
    """A bland reading of whatever the prompt describes."""
    positions = [int(match) for match in _CRITERION.findall(user)]
    said = "\n".join(block.strip() for block in _ANSWER.findall(user)).strip()
    quote = _quotable(said)
    # "Because" is the cheapest signal that somebody explained rather than named. It is not a
    # judgement about the answer; it is a way for the stand-in to produce a report with more than
    # one number in it, so a screenshot of one shows what a real spread looks like.
    explained = "because" in said.casefold()
    return AnswerReading(
        criteria=[
            CriterionReading(
                criterion=position,
                reasoning=(
                    "Development stand-in (LLM_PROVIDER=fake): no model read this answer."
                    if quote
                    else "Development stand-in: there was nothing in the answer to score."
                ),
                evidence=[quote] if quote else [],
                score=(3 if explained else 2) if quote else 0,
            )
            for position in positions
        ],
        covered_points=["Answered in their own words"] if quote else [],
        missing_points=[] if quote else ["Nothing to assess"],
        strengths=["Engaged with the question"] if quote else [],
        improvement_tip="Set LLM_PROVIDER=anthropic to see real feedback here.",
        red_flags=[],
        confidence="low",
    )


def _quotable(said: str) -> str | None:
    """An exact run of the candidate's words, cut on a word boundary. None if they said too little.

    It has to be exact: the whole point of the stand-in is that `evidence.py` treats it no
    differently from a real model's quote, so a paraphrase here would hide a broken verifier.
    """
    if len(said) < MIN_QUOTE_CHARS:
        return None
    if len(said) <= QUOTE_CHARS:
        return said
    cut = said.rfind(" ", 0, QUOTE_CHARS)
    return said[: cut if cut >= MIN_QUOTE_CHARS else QUOTE_CHARS]
