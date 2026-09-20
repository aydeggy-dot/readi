"""Model prices as integer micro-USD per million tokens (ADR-0007). Configuration, not logic.

Source: https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-09-19).
Update this table when providers change prices; a test keeps it consistent.
"""

import logging

logger = logging.getLogger(__name__)

# (provider, model) -> (input, output) micro-USD per million tokens.
TOKEN_PRICES: dict[tuple[str, str], tuple[int, int]] = {
    ("anthropic", "claude-opus-5"): (5_000_000, 25_000_000),
    ("anthropic", "claude-sonnet-5"): (2_000_000, 10_000_000),
    ("anthropic", "claude-haiku-4-5"): (1_000_000, 5_000_000),
    ("fake", "fake"): (0, 0),
}


def has_price(provider: str, model: str) -> bool:
    return (provider, model) in TOKEN_PRICES


def token_cost_micro_usd(provider: str, model: str, input_tokens: int, output_tokens: int) -> int:
    """Cost of one call, rounded to the nearest micro-USD. Unknown models cost 0 (and warn)."""
    prices = TOKEN_PRICES.get((provider, model))
    if prices is None:
        logger.warning("no price configured for %s/%s; recording cost 0", provider, model)
        return 0
    input_price, output_price = prices
    return round((input_tokens * input_price + output_tokens * output_price) / 1_000_000)
