import json
from pathlib import Path

from readi_worker.cv.parse import LIMITS
from readi_worker.llm.pricing import TOKEN_PRICES, token_cost_micro_usd

CONTRACTS = Path(__file__).parents[3] / "packages/shared-types/generated/json-schema/contracts.json"


def test_token_cost_in_micro_usd() -> None:
    # Sonnet 5: $2 / $10 per million tokens → 3,000 in + 1,000 out = $0.006 + $0.01 = 16,000 µUSD.
    assert token_cost_micro_usd("anthropic", "claude-sonnet-5", 3_000, 1_000) == 16_000
    # Haiku 4.5: $1 / $5 → 1 input token = 1 µUSD.
    assert token_cost_micro_usd("anthropic", "claude-haiku-4-5", 1, 0) == 1


def test_cache_writes_and_reads_are_priced_off_the_input_rate() -> None:
    """Opus 5 input is $5/MTok, so 1,700 prefix tokens are 8,500 uUSD at full price - 10,625 written
    (1.25x) and 850 read (0.1x). The multiples are what make caching pay from the second call and
    **cost more** when N calls write the same prefix concurrently."""
    assert token_cost_micro_usd("anthropic", "claude-opus-5", 0, 0, 1_700, 0) == 10_625
    assert token_cost_micro_usd("anthropic", "claude-opus-5", 0, 0, 0, 1_700) == 850
    # Two calls sharing a prefix: 1.25 + 0.1 against the 2.00 of not caching.
    write = token_cost_micro_usd("anthropic", "claude-opus-5", 0, 0, 1_700, 0)
    read = token_cost_micro_usd("anthropic", "claude-opus-5", 0, 0, 0, 1_700)
    plain = token_cost_micro_usd("anthropic", "claude-opus-5", 1_700, 0)
    assert write + read < plain * 2
    # Four concurrent cold writes, which is what the unmodified fan-out would have done.
    assert write * 4 > plain * 4


def test_a_whole_cached_call_is_the_sum_of_its_own_units() -> None:
    """The only reason `ai_call_log` has the two columns: a cost that cannot be re-derived from the
    row it sits on is a number taken on trust, not a measurement."""
    cost = token_cost_micro_usd("anthropic", "claude-opus-5", 2_600, 1_000, 0, 1_700)
    assert cost == 2_600 * 5 + 1_000 * 25 + round(1_700 * 0.5)


def test_omitting_the_cache_counts_prices_a_call_exactly_as_before() -> None:
    assert token_cost_micro_usd("anthropic", "claude-sonnet-5", 3_000, 1_000, 0, 0) == 16_000


def test_unknown_models_cost_zero() -> None:
    assert token_cost_micro_usd("anthropic", "claude-unknown", 1_000, 1_000) == 0


def test_prices_are_integers() -> None:
    assert all(isinstance(p, int) and p >= 0 for pair in TOKEN_PRICES.values() for p in pair)


def test_parser_limits_match_the_contract() -> None:
    defs = json.loads(CONTRACTS.read_text())["$defs"]
    cv = defs["ParsedCv"]["properties"]
    assert cv["skills"]["maxItems"] == LIMITS["skills"]
    assert cv["projects"]["maxItems"] == LIMITS["projects"]
    assert cv["experience"]["maxItems"] == LIMITS["experience"]
    assert cv["gaps"]["maxItems"] == LIMITS["gaps"]
    assert cv["skills"]["items"]["maxLength"] == LIMITS["skill_length"]
    assert defs["CvExperience"]["properties"]["summary"]["maxLength"] == LIMITS["text_length"]
