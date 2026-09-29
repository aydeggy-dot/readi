"""Speech prices as integer micro-USD, in the units the vendors publish (ADR-0007).

Separate from `llm/pricing.py` because nothing about it carries over: recognition is billed per
minute of audio and synthesis per thousand characters, neither has an input/output split, and
neither caches, so there are no multipliers.

**The figures are stored in the vendors' own units** — micro-USD per audio-minute, micro-USD per
thousand characters — rather than converted to something tidier. Checking this table against a
pricing page should be reading one number off each, because the alternative is what happened to the
Voyage rate: an estimate nobody could check at a glance, still marked unverified three milestones
later.

A rate here is only as good as the page it came from, so each entry carries the date it was checked.

**An unpriced provider cannot start.** `Settings` refuses a configuration whose STT or TTS provider
and model have no entry here (owner's instruction, 2026-09-29): a per-minute vendor bills monthly,
so an unpriced one is not a zero in a column — it is a cost nobody sees until the invoice. The `cost
0` fallback below therefore only fires for a pair that was priced at startup and changed underneath,
and it stays as a backstop rather than as the normal path.
"""

import logging

logger = logging.getLogger(__name__)

#: (provider, model) -> micro-USD per **audio-minute**.
STT_PRICES_PER_MINUTE: dict[tuple[str, str], int] = {
    # No network, no key, no cost. Priced so that `fake` needs no special case anywhere.
    ("fake", "fake"): 0,
}

#: (provider, model) -> micro-USD per **thousand characters**.
TTS_PRICES_PER_1K_CHARACTERS: dict[tuple[str, str], int] = {
    ("fake", "fake"): 0,
}


def has_stt_price(provider: str, model: str) -> bool:
    return (provider, model) in STT_PRICES_PER_MINUTE


def has_tts_price(provider: str, model: str) -> bool:
    return (provider, model) in TTS_PRICES_PER_1K_CHARACTERS


def stt_cost_micro_usd(provider: str, model: str, audio_seconds: float) -> int:
    """Cost of transcribing `audio_seconds`, rounded to the nearest micro-USD.

    Seconds rather than minutes because that is what a provider reports and what a turn is measured
    in; the division is done here so the rate above can stay in the vendor's units.
    """
    price = STT_PRICES_PER_MINUTE.get((provider, model))
    if price is None:
        logger.warning("no speech-to-text price for %s/%s; recording cost 0", provider, model)
        return 0
    return round(audio_seconds / 60 * price)


def tts_cost_micro_usd(provider: str, model: str, characters: int) -> int:
    """Cost of synthesizing `characters`, rounded to the nearest micro-USD."""
    price = TTS_PRICES_PER_1K_CHARACTERS.get((provider, model))
    if price is None:
        logger.warning("no text-to-speech price for %s/%s; recording cost 0", provider, model)
        return 0
    return round(characters / 1_000 * price)
