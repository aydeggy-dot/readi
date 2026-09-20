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
