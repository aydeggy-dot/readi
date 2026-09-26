"""The line that moves the interview from one question to the next.

**Why this is code and not an instruction to the model.** Every phrasing call is independent: it is
given one question and told to say it, and it is never given the turns that came before. So a model
asked to vary its transitions cannot — it has nothing to vary *from*, and it reaches for the most
obvious phrase every time. The first paid run (2026-09-25) opened three of four questions with
"Let's move to the next one", "Let's move on" and "Let's move to the last question", which is not
the model being careless; it is the model being consistent, with no way to know it was repeating
itself.

Two ways out. Send it the openings it has already used, as data — a contract change, more tokens on
every turn, and it is still free to repeat. Or have the engine choose, which is what this does: one
connective per turn, picked deterministically from the session id and the position, so it varies
within a session, varies between sessions, and is reproducible for M4. The prompt then gets one line
to open with and is told not to invent another.

The pool is small, plain and deliberately says nothing about the question that follows: a connective
that previewed the topic would be the model's one chance to add an ask, which is exactly what
`asks.py` exists to stop. The first question gets none — the intro has just said "here is the first
one", and anything else would be the second thing said about the same moment.
"""

from hashlib import blake2b

#: Moving on, mid-interview. Plain and short: this is the least interesting thing the interviewer
#: says, and a connective that draws attention to itself is worse than a repeated one.
NEXT_QUESTION = (
    "Let's move on.",
    "Next one.",
    "On to the next one.",
    "Here's the next one.",
    "Let's keep going.",
)

#: The last question is worth marking — a candidate pacing themselves is owed the warning.
LAST_QUESTION = (
    "Last one.",
    "One more and we're done.",
    "This is the last question.",
)


def connective(session_id: str, position: int, total: int) -> str:
    """The line to open this question with — empty for the first, which needs none."""
    if position <= 0:
        return ""
    pool = LAST_QUESTION if position == total - 1 else NEXT_QUESTION
    return pool[(_rotation(session_id) + position) % len(pool)]


def _rotation(session_id: str) -> int:
    """A stable offset per session. Not `hash()`, which is salted per process and would make a
    replayed exchange say something different from the one it is replaying."""
    return int.from_bytes(blake2b(session_id.encode(), digest_size=2).digest(), "big")
