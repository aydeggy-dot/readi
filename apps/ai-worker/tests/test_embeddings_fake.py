"""The deterministic stand-in: same text, same vector; unit length; nothing else alike."""

import math

import pytest

from readi_worker.embeddings.fake import FakeEmbeddingProvider, deterministic_vector

DIMENSIONS = 64


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


def test_the_same_text_always_gives_the_same_vector() -> None:
    assert deterministic_vector("a question", DIMENSIONS) == deterministic_vector(
        "a question", DIMENSIONS
    )


def test_vectors_are_unit_length_so_cosine_is_a_dot_product() -> None:
    vector = deterministic_vector("a question", DIMENSIONS)
    assert len(vector) == DIMENSIONS
    assert math.isclose(math.sqrt(sum(value * value for value in vector)), 1.0, rel_tol=1e-9)


def test_identical_text_scores_one_and_different_text_does_not() -> None:
    same = cosine(
        deterministic_vector("what is a closure?", 1024),
        deterministic_vector("what is a closure?", 1024),
    )
    assert math.isclose(same, 1.0, rel_tol=1e-9)

    # Not a model: even a near-identical rewording is unrelated here. That is the point of the
    # note in fake.py — duplicate *detection* needs the real provider; this proves the plumbing.
    other = cosine(
        deterministic_vector("what is a closure?", 1024),
        deterministic_vector("what is a closure ?", 1024),
    )
    assert abs(other) < 0.2


@pytest.mark.asyncio
async def test_embeds_a_batch_in_order_and_reports_no_cost() -> None:
    provider = FakeEmbeddingProvider(DIMENSIONS)
    result = await provider.embed(model="fake", texts=["one", "two", "three"])

    assert [len(vector) for vector in result.vectors] == [DIMENSIONS] * 3
    assert result.vectors[0] == deterministic_vector("one", DIMENSIONS)
    assert result.dimensions == DIMENSIONS
    assert result.provider == "fake"
    assert result.latency_ms == 0
