"""The interviewer's immediate acknowledgement, and the one thing it says into a long silence.

**Why these are the engine's own words and not a model's** (owner's decision, 2026-09-29;
ADR-0019 §6). The first audio the candidate hears after they stop speaking is the only part of the
budget we can make instant: it is a handful of short, staff-written lines, so it is synthesized once
and played from a cache with no model call and no synthesis round trip (latency lever 1). A model
asked for "a short acknowledgement" would cost the whole ladder it exists to short-circuit, and
would occasionally say something evaluative.

**A rotated set, not one line.** One fixed line is a machine by the third question. The rotation is
`transitions.py`'s, for the same reasons: deterministic from the session id and the turn, so it
varies within a session, varies between sessions, and replays identically for M4.

**Nothing in the set may sound like approval.** A candidate who has just answered badly must not
hear praise that their report then contradicts; praise is the evaluator's to give, and it is given
from a rubric. `tests/test_voice_acknowledgements.py` asserts that no line contains an evaluative
word — and the word list is the test's, not this module's, so adding a line cannot quietly widen
what counts as neutral.
"""

from hashlib import blake2b

#: What the interviewer says the moment the candidate stops speaking. A few words: it is there to
#: fill the gap before the real reply, and a long one delays what the candidate is waiting for.
#: Mirrors `VOICE_LIMITS.acknowledgementMaxLength` (40) in @readi/shared-types.
#:
#: "Alright." earns its place and is worth a note, because it reads as praise to a word filter and
#: not to an ear: it is a discourse marker ("alright, next"), the whole-word test for `right` does
#: not match inside it, and nothing in it says the answer was correct. "Right." on its own is the
#: line that was left out, because a candidate who has just been wrong would hear it as agreement.
ACKNOWLEDGEMENTS = (
    "Okay.",
    "Mm-hm.",
    "Got it.",
    "Thanks.",
    "Okay, thanks.",
    "Mm-hm, got it.",
    "Alright.",
    "Thank you.",
)

#: Said once while the candidate is thinking, after `VOICE_LIMITS.takeYourTimeAfterMs`. Its job is
#: to reassure a candidate who thinks the line has dropped, so it says the interviewer is still
#: there — and it does not ask anything, because a second ask while somebody is gathering a thought
#: is the interviewer talking over them.
TAKE_YOUR_TIME = "Take your time — I'm still here."

#: How long a silence is, before that line. Mirrors `VOICE_LIMITS.takeYourTimeAfterMs`.
TAKE_YOUR_TIME_AFTER_MS = 20_000

#: Answering a question the **candidate** asked is the one call with no honest fallback
#: (`interview/calls.py`), and in text mode the API simply reports the error. In voice the
#: alternative to saying something is silence, which reads as a dropped call — so the interviewer
#: says the true thing and the candidate can ask something else. It promises nothing and asks
#: nothing, because a session that has reached this state is nearly over.
CANNOT_ANSWER = "Sorry — I can't answer that one."


def acknowledgement(session_id: str, turn: int) -> str:
    """The line to acknowledge this answer with.

    `turn` is the candidate turn this answers — any integer that advances once per answer does, and
    the caller's own seq is the obvious one.
    """
    return ACKNOWLEDGEMENTS[(_rotation(session_id) + max(0, turn)) % len(ACKNOWLEDGEMENTS)]


def pinned_lines() -> tuple[str, ...]:
    """Every line this deployment can speak without a model call, for `pinned_audio.py` to render.

    One function rather than a list each caller assembles, so a line added above is pre-rendered by
    construction. A line that is not in here is not a bug — it just costs a synthesis round trip.
    """
    return (*ACKNOWLEDGEMENTS, TAKE_YOUR_TIME, CANNOT_ANSWER)


def _rotation(session_id: str) -> int:
    """A stable offset per session — `transitions.py`'s, and not `hash()`, which is salted per
    process and would make a replayed leg acknowledge differently from the one it replays."""
    return int.from_bytes(blake2b(session_id.encode(), digest_size=2).digest(), "big")
