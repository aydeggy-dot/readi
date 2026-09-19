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
