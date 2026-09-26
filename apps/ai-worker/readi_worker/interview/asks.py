"""How many things a spoken turn asks for — and why the engine counts them at all.

**The rule this exists to enforce: the phrasing call may not add an ask.** The model is given a
question the bank wrote and asked to say it in the conversation's voice. It may adapt the connective
tissue and move a pointer to a snippet; it may not turn one question into two. A second ask that the
question did not make is a question nobody wrote, nobody reviewed and no rubric scores, and the
candidate who answers it spends their minutes on it.

That was a prompt instruction until 2026-09-26 and is now an invariant: `calls.speak` compares the
asks in what the model said with the asks in the pinned wording, and treats "more" as invalid output
— retried, then replaced by the pinned wording itself, which is the fallback that already existed.
The first paid run happened to hold (4 of 4 openings gained framing and no ask), but it tested the
easy case: every opening in that session already asked three or four things, so there was nothing
left to add. Against a one-ask opening the behaviour was untested, and a prompt rule that has never
been tested is a hope.

**The count is deliberately crude, and only ever used as a comparison.** It counts interrogatives,
directives and yes/no openings, which over-counts: relative pronouns ("accounts **where** money left
one") and existentials ("the check that **is there**") read as asks, so on the seed banks it reports
more than one ask for 56 of 104 openings that ask exactly one thing. That makes it useless as an
absolute ceiling — `check-bank.mjs` has a separate, narrower check for that — and perfectly good
here, because the two texts being compared are near-identical: a false positive present in the
pinned wording is present in the spoken one too, and cancels. What survives the subtraction is what
the model actually added.

The same counter lives in `.claude/skills/question-bank/scripts/check-bank.mjs`, where it is the
floor ("enough things are asked for to justify the criteria"). Two implementations of one rule
drift, so `packages/shared-types/src/ask-vectors.json` holds the cases both must agree on and both
sides assert against it.
"""

import re

#: An interrogative, or a directive to produce something. Two sharing one clause — "what and why" —
#: are two asks, which is right: they are two things to answer.
#:
#: **`whom` is here and `whether` is not** (2026-09-26, from the second paid run). Both were
#: asymmetries rather than opinions, and an asymmetry is what breaks the comparison this counter is
#: for. `whom` was missing, so a pinned "What is going wrong, and for whom?" counted one ask while
#: the model's "what's going wrong, and who it affects" counted two, and the guard rejected a
#: faithful rephrasing three times over. `whether` was present, and it is a subordinator far more
#: often than an interrogative — "whether that was at work or on your own", "tell me whether it
#: worked" — so a model reaching for it appeared to add an ask it had not added. Nothing spoken in
#: these banks opens on an interrogative `whether`, and where it follows a directive the directive
#: is already the ask.
_ASK = re.compile(
    r"\b(?:what|whom|why|how|where|when|which|who)\b"
    r"|\b(?:tell|walk|talk|take)\s+me\b"
    r"|\b(?:explain|describe|diagnose)\b",
    re.IGNORECASE,
)

#: A yes/no question is an ask too — "would you take it?" — but not where it already belongs to an
#: interrogative, or "what would you change" counts twice. JavaScript says that with a
#: variable-width lookbehind, which Python's `re` has not got, so the interrogative-led ones are
#: removed first (`_OWNED_MODAL`) and what is left is counted. Equivalent on real prose, and the
#: shared vectors are what proves it stays equivalent.
_YES_NO = re.compile(
    r"\b(?:would|should|could|do|does|did|is|are|can|will)\s+(?:you|it|that|they|there)\b",
    re.IGNORECASE,
)
_OWNED_MODAL = re.compile(
    r"\b(?:what|whom|why|how|where|when|which|who)\s+"
    r"(?:would|should|could|do|does|did|is|are|can|will)\s+(?:you|it|that|they|there)\b",
    re.IGNORECASE,
)

#: A house **depth cue** asks for nothing new (owner's decision, 2026-09-25): it restores the shape
#: of the answer a triple-barrelled prompt used to carry as a side effect of carrying its content. A
#: closed list, because that is what makes it a cue rather than a second ask.
_DEPTH_CUE = re.compile(
    r"\b(?:take|walk|talk)\s+me\s+through\s+(?:it|what\s+you\s+see)\b", re.IGNORECASE
)

#: "tell me what X" is one ask, not two: the directive owns the interrogative that follows it.
_DIRECTIVE_OWNS = re.compile(
    r"\b(tell|walk|talk|take)\s+me\s+(?:through\s+)?"
    r"(?:what|whom|why|how|where|when|which|who)\b",
    re.IGNORECASE,
)


def count_asks(text: str) -> int:
    """How many things this text asks the candidate for."""
    raw = text or ""
    without_cue = _count(_DEPTH_CUE.sub(" ", raw))
    # A prompt that is *nothing but* "Walk me through it." still asks one thing.
    return without_cue if without_cue > 0 else _count(raw)


def _count(text: str) -> int:
    owned = _DIRECTIVE_OWNS.sub(r" \1 me ", text)
    return len(_ASK.findall(owned)) + len(_YES_NO.findall(_OWNED_MODAL.sub(" ", owned)))
