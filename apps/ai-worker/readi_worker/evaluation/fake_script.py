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

It also reads the **NOT ASKED** label off the criteria block and scores that criterion 0 with no
evidence, which is the same thing said about a criterion nobody put to the candidate: the stand-in
has not read the answer, so it has nothing to say a point was covered. It matters because that is
what makes the score's not-assessed exclusion reachable without a paid model — the e2e report for an
interview that ran out of time shows the honest "we did not get to ask" rather than a 3 out of 4 the
stand-in invented.
"""

import re

from pydantic import BaseModel

from readi_worker.evaluation.calls import AnswerReading, CriterionReading
from readi_worker.evaluation.evidence import MIN_QUOTE_CHARS
from readi_worker.llm.base import LLMClient, LLMResult

#: `0. <dimension>` at the start of a line in the criteria block: the numbering the prompt hands
#: the model, and the one it must answer with. The optional group is the `NOT ASKED` label, which
#: `criteria_block` writes on the line underneath when the interview never put that criterion to the
#: candidate — matched here rather than assumed, like the numbering itself.
_CRITERION = re.compile(r"^(\d+)\. .*\n(   NOT ASKED)?", re.MULTILINE)
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
        cache_system: bool = False,
    ) -> LLMResult[T]:
        if output_type is not AnswerReading:
            return await self._fallback.parse(
                model=model,
                system=system,
                user=user,
                output_type=output_type,
                max_tokens=max_tokens,
                timeout_s=timeout_s,
                cache_system=cache_system,
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
    criteria = [(int(position), bool(label)) for position, label in _CRITERION.findall(user)]
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
                    "Development stand-in: the interview did not get to ask about this."
                    if not_asked
                    else "Development stand-in (LLM_PROVIDER=fake): no model read this answer."
                    if quote
                    else "Development stand-in: there was nothing in the answer to score."
                ),
                # A criterion nobody asked about gets the same reading as an answer that said
                # nothing: 0, with nothing to quote. The stand-in did not read the answer, so it
                # cannot claim the candidate volunteered a point they were never asked for.
                evidence=[] if not_asked or not quote else [quote],
                score=0 if not_asked or not quote else (3 if explained else 2),
            )
            for position, not_asked in criteria
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
