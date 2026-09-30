"""The interviewer's own words, rendered once (latency lever 1, ADR-0019 §5).

**What this buys is the whole of the first latency target.** The acknowledgement is what the
candidate hears within 250 ms of stopping, and it can only be that fast if nothing is decided and
nothing is synthesized when the moment comes: the lines are pinned, staff-written and few
(`acknowledgements.py`), so they are synthesized at the top of the leg and played from memory. No
model call, no synthesis round trip, first byte in tens of milliseconds.

The same cache holds what latency lever 2 prefetches: the opening the engine will certainly ask
next, phrased while the candidate is still answering and synthesized straight away. It is keyed by
the **exact text**, which is what makes a hit safe — a turn is served pre-rendered audio only if the
audio is of the words the engine is actually about to say.

**A failed render is not a failed interview.** Anything missing from the cache is synthesized the
ordinary way on the turn it is needed; the only cost is the round trip the cache exists to avoid.
The synthesizer's failures are recorded as `AiCallRecord`s like every other provider call
(`speech/calls.py`) so the bill and the failure rate stay re-derivable, and so a leg that ran with
an unreachable synthesizer says so afterwards.

**What is *not* pre-rendered, and why.** The connectives (`interview/transitions.py`) are engine
words too, but they arrive inside the phrasing call's output — the model is told to open with that
line — so they cannot be split off the turn reliably. Lever 2 covers the same ground better by
prefetching the whole opening. The intro is rendered per session (it states the length and the
question count), so it is not shared between sessions and is synthesized when the leg opens.
"""

import asyncio
import logging

from readi_worker.contracts import AiCallRecord
from readi_worker.speech.base import TextToSpeech, TtsError
from readi_worker.speech.calls import tts_error_record, tts_record
from readi_worker.voice.acknowledgements import pinned_lines
from readi_worker.voice.transport import Clip

logger = logging.getLogger(__name__)

#: How long one line may take to render at the top of a leg. Short: the candidate is waiting to be
#: greeted, and a slow synthesizer must cost them the cache rather than the interview.
RENDER_TIMEOUT_S = 8.0


class PinnedAudio:
    """Rendered lines, keyed by the exact text that was rendered."""

    def __init__(self, tts: TextToSpeech, *, model: str, voice: str) -> None:
        self._tts = tts
        self._model = model
        self._voice = voice
        self._clips: dict[str, Clip] = {}
        #: Every render, for the exchange that is open when it finishes. Drained by the driver.
        self.calls: list[AiCallRecord] = []

    def get(self, text: str) -> Clip | None:
        """The rendered audio of exactly these words, or None — then speak them the ordinary way."""
        return self._clips.get(_key(text))

    def has(self, text: str) -> bool:
        return _key(text) in self._clips

    async def warm(self) -> None:
        """Render every pinned line. Called once when the leg opens, before the intro is spoken.

        Lines are rendered together: they are a handful of two-word clips, and rendering them in
        series would put a synthesis round trip each in front of the greeting.
        """
        await asyncio.gather(*(self.render(line) for line in pinned_lines()))

    async def render(self, text: str) -> Clip | None:
        """Render one line into the cache and return it, or None if the synthesizer would not.

        Idempotent: a line already rendered costs nothing, which is what lets the prefetch call it
        without checking first.
        """
        key = _key(text)
        if key in self._clips:
            return self._clips[key]
        if not key:
            return None
        try:
            async with asyncio.timeout(RENDER_TIMEOUT_S):
                result = await self._tts.synthesize(
                    model=self._model, voice=self._voice, text=text, timeout_s=RENDER_TIMEOUT_S
                )
        except TtsError as exc:
            self.calls.append(tts_error_record(exc))
            logger.warning("pinned audio not rendered: %s", exc.code)
            return None
        except (TimeoutError, OSError) as exc:
            # A shape `TtsError` does not cover (a hung socket, a DNS failure inside a client that
            # does not wrap it). No record, because there is no provider answer to record.
            logger.warning("pinned audio not rendered: %s", type(exc).__name__)
            return None
        self.calls.append(tts_record(result))
        clip = Clip(
            audio=result.audio, content_type=result.content_type, seconds=result.audio_seconds
        )
        self._clips[key] = clip
        return clip

    def drain_calls(self) -> list[AiCallRecord]:
        """Take the records of every render since the last drain, to ride home with an exchange.

        A render is a provider call the session caused, so it belongs in `ai_call_log` whichever
        turn it happens to be attached to — and attaching it to the open exchange is how it gets
        there without a second route (ADR-0007).
        """
        calls = self.calls
        self.calls = []
        return calls


def _key(text: str) -> str:
    """Exact words, with only surrounding whitespace forgiven.

    Deliberately not normalised further: two texts that differ by a comma are two different things
    to say, and serving one as the other would put words in the interviewer's mouth.
    """
    return text.strip()
