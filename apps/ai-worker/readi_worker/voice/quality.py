"""What the connection was like, and when to stop pretending this is a voice interview.

Two jobs, and the second is the product decision. The **summary** is what `VoiceQuality` carries
home: a few numbers to explain a fallback afterwards and to tell one Nigerian carrier from another
in phase 8, kept as a summary rather than a series because nothing draws a graph from it. The
**rule** is how long the connection has to stay bad before the leg gives up — and that is sustained
rather than instantaneous, because a single bad second on a mobile network here is ordinary and
dropping a candidate out of voice for it would be worse than the stutter
(`VOICE_LIMITS.fallbackAfterPoorMs`).

What counts as "poor" is the transport's to say — it is LiveKit's own connection quality, and the
adapter reads it. How long it may last is this module's, because it is the same number the browser
is told in `VoiceTokenResponse.fallback_after_poor_ms` and a threshold with two homes drifts.
"""

import math

from readi_worker.contracts import VoiceQuality
from readi_worker.voice.transport import Clock

#: Mirrors `VOICE_LIMITS.fallbackAfterPoorMs` in @readi/shared-types.
FALLBACK_AFTER_POOR_MS = 20_000

#: Round-trip samples kept. A leg is at most half an hour and the adapter samples every couple of
#: seconds, so this is the whole leg with room to spare; the bound is there so an agent that runs
#: for hours cannot grow a list nobody is watching.
MAX_SAMPLES = 2_000


class QualityMonitor:
    """Connection samples, reconnects, and the sustained-poor rule."""

    def __init__(
        self, clock: Clock, *, fallback_after_poor_ms: int = FALLBACK_AFTER_POOR_MS
    ) -> None:
        self._clock = clock
        self._fallback_after_ms = fallback_after_poor_ms
        self._rtts: list[int] = []
        self._losses: list[float] = []
        self._reconnects = 0
        self._poor_since: float | None = None

    def note(
        self,
        *,
        rtt_ms: int | None = None,
        packet_loss_percent: float | None = None,
        poor: bool = False,
    ) -> None:
        """One sample of how the connection is doing."""
        if rtt_ms is not None and len(self._rtts) < MAX_SAMPLES:
            self._rtts.append(max(0, rtt_ms))
        if packet_loss_percent is not None and len(self._losses) < MAX_SAMPLES:
            self._losses.append(min(100.0, max(0.0, packet_loss_percent)))
        if poor:
            # The clock starts on the first poor sample and is not restarted by the next one: the
            # rule is about how long it has been bad, not how many samples said so.
            self._poor_since = (
                self._poor_since if self._poor_since is not None else (self._clock.monotonic())
            )
        else:
            self._poor_since = None

    def note_reconnect(self) -> None:
        """The room reconnected. Counted rather than acted on: LiveKit recovers a dropped
        connection by itself, and a candidate who heard a second of silence has not lost their
        interview — but a leg with six of them explains a bad latency table."""
        self._reconnects += 1
        self._poor_since = None

    @property
    def should_fall_back(self) -> bool:
        if self._poor_since is None:
            return False
        return (self._clock.monotonic() - self._poor_since) * 1_000 >= self._fallback_after_ms

    def summary(self) -> VoiceQuality:
        """`VoiceQuality` as it is pushed. Nullable throughout: a leg that failed in its first
        second has no p95, and reporting a zero there would put it in somebody's average."""
        return VoiceQuality.model_validate(
            {
                "rtt_ms_p50": _percentile(self._rtts, 50),
                "rtt_ms_p95": _percentile(self._rtts, 95),
                "packet_loss_percent": _mean(self._losses),
                "reconnects": self._reconnects,
            }
        )


def _percentile(values: list[int], percentile: int) -> int | None:
    """The nearest-rank percentile: the smallest value at or above that share of the samples.

    Not interpolated. These are milliseconds off a sampled gauge, and an interpolated p95 of nine
    samples is precision the measurement has not got. `ceil` rather than `round`, because `round`
    is banker's rounding in Python and would make the median of five samples the second of them.
    """
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(percentile / 100 * len(ordered)) - 1))
    return ordered[index]


def _mean(values: list[float]) -> float | None:
    return None if not values else round(sum(values) / len(values), 3)
