"""An output schema that makes the wrong set of criteria impossible rather than discouraged.

`rejected_criteria` was the only recorded cause of a thrown-away opus reading, and the 2026-09-28
v3 prompts — which stated the rule plainly, said what breaking it costs, and printed the expected
numbers — measured **no fall**. The shape of what was left is the lead: every one of the eleven
retried answers was a `weak`, a `fluent-but-wrong` or a `correct-poorly-explained`, the three kinds
where a rubric's *lower* descriptors do the work. That points at a model leaving out the criteria
an answer did not reach rather than scoring them 0 — a thing wording has now twice failed to
prevent, and which a schema can simply forbid.

So the reading model is built **per request** from that rubric's own criterion positions, and
`criteria` becomes an **object keyed by position** rather than a list:

    "criteria": {"0": {...}, "1": {...}, "2": {...}}

with all three keys `required` and `additionalProperties: false`. A criterion cannot be left out,
because its key is required; one cannot be invented, because no other key is allowed. The position
is the key rather than a field, so there is no second place for it to disagree with itself.

**The obvious shape does not work, and that is the reason to write it down.** The first attempt
kept the list and made it a fixed-length tuple of per-position models — `prefixItems` with a `const`
per entry, the natural JSON Schema for "entry *n* is criterion *n*".
`anthropic.transform_schema` **drops it into prose**: `prefixItems`, `minItems` and `maxItems` are
folded into the schema's *description* string, so the provider would have received a plain
unconstrained array with a sentence about tuples in its docs. It would have looked exactly like a
working guarantee and enforced nothing. `required` and `additionalProperties` survive the
transform, which is why the shape is an object.

The price is that this is no longer an `AnswerReading`, so `as_answer_reading()` turns it back into
one and every gate downstream goes on seeing what it has always seen.

**It is off by default and has never been sent to a real provider**
(`EVALUATOR_STRICT_CRITERIA_SCHEMA`). Everything M4 measured — the fairness band, both separations,
the run-to-run stability — was measured without it, so turning it on is a change to the evaluator
that must be measured before it reaches a candidate, exactly as v3 was. What a paid run must check
first is that the provider **accepts** this schema at all; a 400 on the first call answers that for
a fraction of a cent.
"""

from functools import lru_cache
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, create_model

from readi_worker.evaluation.calls import MAX_CRITERION_SCORE, AnswerReading, CriterionReading

#: Set on a generated model, so the stand-in evaluator can recognise one and answer in its shape.
STRICT_POSITIONS = "__readi_strict_positions__"


class CriterionBody(BaseModel):
    """One criterion's reading **without** its position, which the key carries.

    Field order is the ordering argument `CriterionReading` makes, minus the field that moved: the
    reason, then the quotes, and the **score last**, so a model states its evidence before it
    commits to a number. `test_evaluation_strict_schema.py` holds this to `CriterionReading` minus
    `criterion`, because two declarations of one shape is exactly how a constraint goes missing from
    one of them.
    """

    model_config = ConfigDict(extra="ignore")
    reasoning: str
    evidence: list[str]
    score: int = Field(ge=0, le=MAX_CRITERION_SCORE)


@lru_cache(maxsize=256)
def strict_reading_model(positions: tuple[int, ...]) -> type[BaseModel]:
    """The reading model for a rubric with exactly these criterion positions.

    Cached because a session's answers share a handful of rubrics and building a model is not free.
    """
    if not positions:
        return AnswerReading
    fields: dict[str, Any] = {str(position): (CriterionBody, ...) for position in positions}
    criteria = create_model(  # the field names are the rubric's own positions
        "StrictCriteria",
        __config__=ConfigDict(extra="forbid"),
        **fields,
    )
    model = create_model("StrictAnswerReading", __base__=AnswerReading, criteria=(criteria, ...))
    setattr(model, STRICT_POSITIONS, positions)
    return model


def as_answer_reading(strict: BaseModel) -> AnswerReading:
    """Back to the shape every gate downstream already takes.

    The key becomes the `criterion` again. Nothing else moves, and a reading that reached here has
    the right set of them by construction.
    """
    if isinstance(strict, AnswerReading) and isinstance(strict.criteria, list):
        return strict
    data: dict[str, Any] = strict.model_dump()
    criteria = data.pop("criteria")
    return AnswerReading.model_validate(
        {
            **data,
            "criteria": [
                CriterionReading(criterion=int(position), **body)
                for position, body in sorted(criteria.items(), key=lambda item: int(item[0]))
            ],
        }
    )


def as_payload(reading: AnswerReading, output_type: type[BaseModel]) -> dict[str, Any]:
    """A reading, in whichever shape `output_type` wants — for the two stand-in clients.

    Both fakes hand back a reading they built themselves, and in strict mode it has to satisfy the
    same schema a real model would. Written once, because a second copy of this keying would be a
    second place for the two shapes to disagree, and the disagreement would look like a fake being
    broken rather than a schema being wrong.
    """
    payload: dict[str, Any] = reading.model_dump()
    if getattr(output_type, STRICT_POSITIONS, None) is None:
        return payload
    payload["criteria"] = {
        str(entry["criterion"]): {key: value for key, value in entry.items() if key != "criterion"}
        for entry in payload["criteria"]
    }
    return payload
