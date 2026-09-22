"""VoyageEmbeddingProvider against a mocked REST API (no network, no key)."""

import json
from typing import Any

import httpx2
import pytest

from readi_worker.embeddings.base import EmbeddingError
from readi_worker.embeddings.voyage import VoyageEmbeddingProvider

DIMENSIONS = 4


def vector(seed: float) -> list[float]:
    return [seed] * DIMENSIONS


def provider_returning(
    responses: list[httpx2.Response | Exception], seen: list[dict[str, Any]]
) -> VoyageEmbeddingProvider:
    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(json.loads(request.content))
        answer = responses.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    return VoyageEmbeddingProvider(
        "voyage-test-key",
        timeout_s=5,
        dimensions=DIMENSIONS,
        transport=httpx2.MockTransport(handler),
    )


def ok(*vectors: list[float], model: str = "voyage-4", tokens: int = 42) -> httpx2.Response:
    return httpx2.Response(
        200,
        json={
            "data": [{"index": index, "embedding": values} for index, values in enumerate(vectors)],
            "model": model,
            "usage": {"total_tokens": tokens},
        },
    )


@pytest.mark.asyncio
async def test_embeds_a_batch_and_reports_the_tokens_it_cost() -> None:
    seen: list[dict[str, Any]] = []
    provider = provider_returning([ok(vector(0.1), vector(0.2))], seen)

    result = await provider.embed(model="voyage-4", texts=["one", "two"])

    assert result.vectors == [vector(0.1), vector(0.2)]
    assert result.provider == "voyage"
    assert result.model == "voyage-4"
    assert result.input_tokens == 42
    assert result.latency_ms >= 0
    assert seen[0]["input"] == ["one", "two"]
    assert seen[0]["output_dimension"] == DIMENSIONS
    assert seen[0]["input_type"] == "document"


@pytest.mark.asyncio
async def test_orders_vectors_by_index_rather_than_by_arrival() -> None:
    seen: list[dict[str, Any]] = []
    shuffled = httpx2.Response(
        200,
        json={
            "data": [
                {"index": 1, "embedding": vector(0.2)},
                {"index": 0, "embedding": vector(0.1)},
            ],
            "model": "voyage-4",
            "usage": {"total_tokens": 4},
        },
    )
    provider = provider_returning([shuffled], seen)

    result = await provider.embed(model="voyage-4", texts=["one", "two"])

    assert result.vectors == [vector(0.1), vector(0.2)]


@pytest.mark.asyncio
async def test_retries_a_rate_limit_and_then_succeeds() -> None:
    seen: list[dict[str, Any]] = []
    provider = provider_returning([httpx2.Response(429), ok(vector(0.1))], seen)

    result = await provider.embed(model="voyage-4", texts=["one"])

    assert result.vectors == [vector(0.1)]
    assert len(seen) == 2


@pytest.mark.asyncio
async def test_does_not_retry_a_rejected_key() -> None:
    seen: list[dict[str, Any]] = []
    provider = provider_returning([httpx2.Response(401), ok(vector(0.1))], seen)

    with pytest.raises(EmbeddingError) as info:
        await provider.embed(model="voyage-4", texts=["one"])

    assert info.value.code == "HTTP 401"
    assert info.value.provider == "voyage"
    assert len(seen) == 1  # no retry


@pytest.mark.asyncio
async def test_refuses_a_vector_of_the_wrong_length() -> None:
    seen: list[dict[str, Any]] = []
    provider = provider_returning([ok([0.1, 0.2])], seen)

    with pytest.raises(EmbeddingError) as info:
        await provider.embed(model="voyage-4", texts=["one"])

    assert info.value.code == "wrong_dimensions"


@pytest.mark.asyncio
async def test_reports_a_connection_failure_after_its_retries() -> None:
    seen: list[dict[str, Any]] = []
    failures: list[httpx2.Response | Exception] = [httpx2.ConnectError("refused")] * 3
    provider = provider_returning(failures, seen)

    with pytest.raises(EmbeddingError) as info:
        await provider.embed(model="voyage-4", texts=["one"])

    assert info.value.code == "ConnectError"
    assert len(seen) == 3


@pytest.mark.asyncio
async def test_a_short_answer_is_not_silently_padded() -> None:
    seen: list[dict[str, Any]] = []
    provider = provider_returning([ok(vector(0.1))], seen)

    with pytest.raises(EmbeddingError) as info:
        await provider.embed(model="voyage-4", texts=["one", "two"])

    assert info.value.code == "invalid_response"
