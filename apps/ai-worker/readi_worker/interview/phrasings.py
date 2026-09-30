"""Phrasings computed before they were needed (voice latency lever 2, ADR-0019 §5).

In text mode a phrasing call happens while the candidate watches a spinner and there is nothing to
overlap it with. In voice there is: the candidate is speaking, which takes tens of seconds, and the
opening the engine will ask next is sometimes already decided (`machine.settled_next_step`). So the
call is made then, and the turn it belongs to spends nothing.

**Keyed on the rendered user prompt, which is the identity of the call.** The prompt carries the
question, the position, the connective and the session's own framing, so a hit means "this exact
call has already been made" rather than "something like it has". That is what makes the seam in
`service._say` safe to leave in the shared path: a phrasing is served only to the call that would
otherwise have made it, and text mode, which never fills the cache, can never hit it.

**An entry is taken once.** A phrasing is a turn, and serving one twice would say the same thing in
two places. The records ride with it, so the bill is complete wherever the call actually happened —
and it happened during the *previous* exchange, which is why `VoiceTurnLatency.phrasing_ms` is null
on a prefetched turn rather than claiming a second the candidate never waited (`voice/latency.py`).
"""

from dataclasses import dataclass, field
from hashlib import blake2b

from readi_worker.contracts import AiCallRecord

#: Entries held at once. One is the normal case — the next opening — and a handful is a leg that
#: prefetched, was interrupted, and prefetched again. A bound rather than a policy: an unbounded
#: dict of prompt-sized keys in a long-lived agent is a leak nobody would notice.
MAX_ENTRIES = 8


@dataclass(frozen=True, slots=True)
class Phrased:
    """One phrasing, and what it cost."""

    text: str
    calls: list[AiCallRecord] = field(default_factory=list)


class PhrasingCache:
    """Phrasings waiting for the turn that will say them."""

    def __init__(self) -> None:
        self._entries: dict[str, Phrased] = {}

    def put(self, user_prompt: str, phrased: Phrased) -> None:
        if len(self._entries) >= MAX_ENTRIES:
            # Oldest first: insertion order is the order they will be needed in.
            self._entries.pop(next(iter(self._entries)))
        self._entries[_key(user_prompt)] = phrased

    def take(self, user_prompt: str) -> Phrased | None:
        """The phrasing for exactly this call, removed from the cache."""
        return self._entries.pop(_key(user_prompt), None)

    def has(self, user_prompt: str) -> bool:
        return _key(user_prompt) in self._entries

    def clear(self) -> None:
        self._entries.clear()

    def __len__(self) -> int:
        return len(self._entries)


def _key(user_prompt: str) -> str:
    """A digest rather than the prompt itself: the prompt holds the question text, and one copy of
    that per cached entry in a process that runs for hours is memory nobody is watching."""
    return blake2b(user_prompt.encode(), digest_size=16).hexdigest()
