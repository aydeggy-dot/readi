"""AnthropicLLMClient against a mocked Messages API (no network, no key)."""

import json
from typing import Any

import anthropic
import httpx2
import pytest

from readi_worker.cv.parse import CvExtraction
from readi_worker.llm.anthropic_client import AnthropicLLMClient
from readi_worker.llm.base import LLMError

EXTRACTION = {"skills": ["React"], "projects": [], "experience": [], "gaps": ["No tests shown"]}


def message(text: str, stop_reason: str = "end_turn") -> dict[str, Any]:
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": "claude-sonnet-5",
        "content": [{"type": "text", "text": text}],
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": 1200, "output_tokens": 300},
    }


def client_returning(
    status: int, body: dict[str, Any], seen: list[dict[str, Any]]
) -> AnthropicLLMClient:
    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(json.loads(request.content))
        return httpx2.Response(status, json=body)

    http = anthropic.DefaultAsyncHttpxClient(transport=httpx2.MockTransport(handler))
    return AnthropicLLMClient("sk-ant-test", timeout_s=5, max_retries=0, http_client=http)


async def parse(client: AnthropicLLMClient, model: str = "claude-sonnet-5") -> Any:
    return await client.parse(
        model=model, system="sys", user="cv", output_type=CvExtraction, max_tokens=8000
    )


async def test_sends_structured_output_request_and_reads_usage() -> None:
    seen: list[dict[str, Any]] = []
    client = client_returning(200, message(json.dumps(EXTRACTION)), seen)

    result = await parse(client)

    assert result.output == CvExtraction.model_validate(EXTRACTION)
    assert (result.input_tokens, result.output_tokens, result.failure) == (1200, 300, None)
    [body] = seen
    assert body["model"] == "claude-sonnet-5"
    assert body["system"] == "sys"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["output_config"]["effort"] == "low"
    assert "temperature" not in body  # rejected by current models


async def test_haiku_gets_no_effort_parameter() -> None:
    seen: list[dict[str, Any]] = []
    client = client_returning(200, message(json.dumps(EXTRACTION)), seen)
    await parse(client, model="claude-haiku-4-5")
    assert "effort" not in seen[0].get("output_config", {})


@pytest.mark.parametrize(
    ("stop_reason", "failure"), [("refusal", "refusal"), ("max_tokens", "max_tokens")]
)
async def test_refusal_and_truncation_give_no_output(stop_reason: str, failure: str) -> None:
    client = client_returning(200, message('{"skills": [', stop_reason), [])
    result = await parse(client)
    assert (result.output, result.failure) == (None, failure)
    assert result.output_tokens == 300  # still billed


async def test_output_that_does_not_match_the_schema_is_invalid_output() -> None:
    client = client_returning(200, message('{"skills": "not a list"}'), [])
    result = await parse(client)
    assert (result.output, result.failure) == (None, "invalid_output")


async def test_api_errors_raise_llm_error_without_echoing_content() -> None:
    error = {
        "type": "error",
        "error": {"type": "overloaded_error", "message": "Overloaded: cv text"},
    }
    client = client_returning(529, error, [])
    with pytest.raises(LLMError) as info:
        await parse(client)
    assert info.value.code == "OverloadedError"
    assert "cv text" not in str(info.value)


# ---- Prompt caching (2026-09-28). The system prompt is the only cacheable prefix this worker has.


async def test_cache_system_marks_the_system_prompt_and_nothing_else() -> None:
    """One breakpoint, on the system block. Not top-level automatic caching, which would place it
    after the per-call tail and write an entry no later call could ever read."""
    seen: list[dict[str, Any]] = []
    client = client_returning(200, message(json.dumps(EXTRACTION)), seen)

    await client.parse(
        model="claude-sonnet-5",
        system="sys",
        user="cv",
        output_type=CvExtraction,
        max_tokens=8000,
        cache_system=True,
    )

    [body] = seen
    assert body["system"] == [
        {"type": "text", "text": "sys", "cache_control": {"type": "ephemeral"}}
    ]
    assert "cache_control" not in body
    assert body["messages"] == [{"role": "user", "content": "cv"}]


async def test_without_the_flag_the_system_prompt_is_a_plain_string() -> None:
    seen: list[dict[str, Any]] = []
    client = client_returning(200, message(json.dumps(EXTRACTION)), seen)
    await parse(client)
    assert seen[0]["system"] == "sys"


async def test_the_two_cache_counts_are_read_back_and_kept_apart_from_input() -> None:
    """`input_tokens` is the uncached remainder; folding the reads into it is how a bill stops
    reconciling and a cached call looks four times cheaper than it was."""
    body = message(json.dumps(EXTRACTION))
    body["usage"] = {
        "input_tokens": 2600,
        "output_tokens": 300,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 1700,
    }
    result = await parse(client_returning(200, body, []))
    assert (result.input_tokens, result.cache_write_tokens, result.cache_read_tokens) == (
        2600,
        0,
        1700,
    )
    assert result.input_tokens + result.cache_read_tokens == 4300  # the whole prompt


async def test_a_provider_that_reports_no_cache_fields_counts_zero() -> None:
    result = await parse(client_returning(200, message(json.dumps(EXTRACTION)), []))
    assert (result.cache_write_tokens, result.cache_read_tokens) == (0, 0)


async def test_counting_input_tokens_asks_the_free_endpoint_and_returns_its_number() -> None:
    """The dry run's cost figure is what the owner says yes or no to, so it is counted rather than
    estimated. Counting is free; guessing at 3.7 chars a token is not a number to approve a bill
    on."""
    seen: list[dict[str, Any]] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(json.loads(request.content))
        assert request.url.path.endswith("/count_tokens")
        return httpx2.Response(200, json={"input_tokens": 4_352})

    http = anthropic.DefaultAsyncHttpxClient(transport=httpx2.MockTransport(handler))
    client = AnthropicLLMClient("sk-ant-test", timeout_s=5, max_retries=0, http_client=http)

    counted = await client.count_input_tokens(model="claude-opus-5", system="sys", user="answer")

    assert counted == 4_352
    assert seen[0]["system"] == "sys"
    assert seen[0]["messages"] == [{"role": "user", "content": "answer"}]


async def test_the_evaluator_system_prompt_clears_every_models_minimum_prefix() -> None:
    """A prompt below its model's minimum caches **silently not at all** — no error, no warning,
    just
    a bill. `evaluate_answer` is the one prompt we cache, and phase 7 may switch which model reads
    it,
    so it is held above the largest minimum of the models we would plausibly use."""
    from readi_worker.evals.dataset import load_dataset, repo_root
    from readi_worker.evals.requests import evaluation_request
    from readi_worker.evaluation.service import render_prompts
    from readi_worker.llm.anthropic_client import MIN_CACHEABLE_PREFIX_TOKENS

    case = load_dataset(repo_root()).cases[0]
    system, _ = render_prompts(evaluation_request(case))
    # A conservative 4 characters per token: over-counting tokens here would let a short prompt
    # pass.
    tokens = len(system) / 4
    assert tokens > max(
        MIN_CACHEABLE_PREFIX_TOKENS["claude-opus-5"], MIN_CACHEABLE_PREFIX_TOKENS["claude-sonnet-5"]
    )
