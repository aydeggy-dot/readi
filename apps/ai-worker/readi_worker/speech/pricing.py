"""Speech prices as integer micro-USD, in the units the vendors publish (ADR-0007).

Separate from `llm/pricing.py` because nothing about it carries over: recognition is billed per
minute and synthesis per thousand characters, neither has an input/output split, and neither caches,
so there are no multipliers.

**The figures are stored in the vendors' own units** rather than converted to something tidier, so
that checking this table against a pricing page is reading one number off each. The alternative is
what happened to the Voyage rate: an estimate nobody could check at a glance, still marked
unverified three milestones later. Each rate carries the date it was read and the page it came from.

**A rate belongs to a (provider, model, path).** The same model name costs different amounts
streaming and batch — Deepgram's nova-3 is $0.0077/min live and $0.0043/min pre-recorded — so the
path is part of the key rather than a footnote.

**The basis matters as much as the rate.** Deepgram bills minutes of audio; AssemblyAI's streaming
product bills minutes the socket was open. An interview is mostly silence while the candidate
thinks, so reading one as the other overstates one vendor and understates the other by roughly three
times. `stt_cost_micro_usd` refuses to guess: a session-billed vendor must be given the session
length.

**Where a promotional rate exists, the regular rate is what is stored.** Deepgram's streaming nova-3
is $0.0048/min on a promotion with no published end date, against a regular $0.0077. We record
$0.0077, for the same reason `_billable_seconds` rounds up: an estimate should never come in under
the invoice.

**An unpriced provider cannot start.** `Settings` refuses a configuration whose STT or TTS provider
and model have no entry here (owner's instruction, 2026-09-29): a per-minute vendor bills monthly,
in arrears, so an unpriced one is not a zero in a column — it is a cost nobody sees until the
invoice. The `cost 0` fallback below therefore only fires for a pair priced at startup and changed
underneath, and it stays as a backstop rather than as the normal path.
"""

import logging
from dataclasses import dataclass

from readi_worker.speech.providers import BillingBasis, CallPath

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SttRate:
    """What one minute of recognition costs, and what the minute is a minute *of*."""

    micro_usd_per_minute: int
    basis: BillingBasis
    checked: str
    source: str


@dataclass(frozen=True)
class TtsRate:
    micro_usd_per_1k_characters: int
    checked: str
    source: str


DEEPGRAM_PRICING = "https://deepgram.com/pricing"
ASSEMBLYAI_PRICING = "https://www.assemblyai.com/pricing"
ELEVENLABS_PRICING = "https://elevenlabs.io/pricing/api"

#: (provider, model, path) -> the rate.
STT_RATES: dict[tuple[str, str, CallPath], SttRate] = {
    ("fake", "fake", "streaming"): SttRate(0, "audio", "2026-09-29", "no provider"),
    ("fake", "fake", "batch"): SttRate(0, "audio", "2026-09-29", "no provider"),
    # $0.0077/min regular; a "limited-time promotional" $0.0048/min was in force on the date
    # checked, with no published end date. The regular rate is stored (see the module docstring).
    ("deepgram", "nova-3", "streaming"): SttRate(7_700, "audio", "2026-09-29", DEEPGRAM_PRICING),
    ("deepgram", "nova-3", "batch"): SttRate(4_300, "audio", "2026-09-29", DEEPGRAM_PRICING),
    # Deepgram's conversational model, the only one their language table calls "English (all
    # accents)" — a marketing claim the benchmark exists to check.
    ("deepgram", "flux-general-en", "streaming"): SttRate(
        7_700, "audio", "2026-09-29", DEEPGRAM_PRICING
    ),
    # $0.15/hour, **billed on session duration**: "A WebSocket open for 60 minutes with 30 minutes
    # of audio sent is billed for 60 minutes."
    ("assemblyai", "universal-streaming-en", "streaming"): SttRate(
        2_500, "session", "2026-09-29", ASSEMBLYAI_PRICING
    ),
    # $0.45/hour, also session-billed.
    ("assemblyai", "universal-3-6-pro", "streaming"): SttRate(
        7_500, "session", "2026-09-29", ASSEMBLYAI_PRICING
    ),
    # $0.21/hour of audio.
    ("assemblyai", "universal-3-5-pro", "batch"): SttRate(
        3_500, "audio", "2026-09-29", ASSEMBLYAI_PRICING
    ),
    # $0.15/hour of audio.
    ("assemblyai", "universal-2", "batch"): SttRate(
        2_500, "audio", "2026-09-29", ASSEMBLYAI_PRICING
    ),
    # Intron/Sahara publishes **no pricing anywhere** — not a rate, not a "contact sales" page. It
    # is therefore absent from this table on purpose, which means it cannot be configured as a
    # running provider until somebody asks them. The benchmark must refuse it too, or record its
    # cost as unknown rather than as zero.
}

#: (provider, model) -> the rate. Synthesis has one path: characters go in, audio comes out.
TTS_RATES: dict[tuple[str, str], TtsRate] = {
    ("fake", "fake"): TtsRate(0, "2026-09-29", "no provider"),
    # "$0.08 per 1,000 characters (multilingual models) or $0.04 (Flash/Turbo)". The rate is the
    # same on every self-serve plan — a plan buys a dollar balance, not a discount — so Starter and
    # Scale pay identically per character and only Enterprise is stated to be discounted.
    ("elevenlabs", "eleven_flash_v2_5"): TtsRate(40_000, "2026-09-29", ELEVENLABS_PRICING),
    ("elevenlabs", "eleven_v3_conversational"): TtsRate(40_000, "2026-09-29", ELEVENLABS_PRICING),
    ("elevenlabs", "eleven_multilingual_v2"): TtsRate(80_000, "2026-09-29", ELEVENLABS_PRICING),
    ("elevenlabs", "eleven_v3"): TtsRate(80_000, "2026-09-29", ELEVENLABS_PRICING),
}


def has_stt_price(provider: str, model: str, path: CallPath) -> bool:
    return (provider, model, path) in STT_RATES


def has_tts_price(provider: str, model: str) -> bool:
    return (provider, model) in TTS_RATES


def stt_billing_basis(provider: str, model: str, path: CallPath) -> BillingBasis | None:
    rate = STT_RATES.get((provider, model, path))
    return rate.basis if rate else None


def stt_cost_micro_usd(
    provider: str,
    model: str,
    path: CallPath,
    *,
    audio_seconds: float,
    session_seconds: float | None = None,
) -> int:
    """Cost of one transcription, rounded to the nearest micro-USD.

    `session_seconds` is how long the connection was open, and is **required** for a vendor that
    bills on it: passing only the audio length would understate an interview — where the candidate
    is silent for much of it — by roughly three times. Raising is deliberate; a plausible wrong
    number here becomes a cost report nobody can check.
    """
    rate = STT_RATES.get((provider, model, path))
    if rate is None:
        logger.warning(
            "no speech-to-text price for %s/%s (%s); recording cost 0", provider, model, path
        )
        return 0
    if rate.basis == "session":
        if session_seconds is None:
            raise ValueError(
                f"{provider}/{model} bills on session duration, not audio: pass session_seconds"
            )
        billed = session_seconds
    else:
        billed = audio_seconds
    return round(billed / 60 * rate.micro_usd_per_minute)


def tts_cost_micro_usd(provider: str, model: str, characters: int) -> int:
    """Cost of synthesizing `characters`, rounded to the nearest micro-USD."""
    rate = TTS_RATES.get((provider, model))
    if rate is None:
        logger.warning("no text-to-speech price for %s/%s; recording cost 0", provider, model)
        return 0
    return round(characters / 1_000 * rate.micro_usd_per_1k_characters)
