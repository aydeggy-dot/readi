"""Deterministic embeddings for local development (`EMBEDDING_PROVIDER=fake`) and tests.

The vector is a pure function of the text: the same text always gives the same vector, so cosine
similarity is exactly 1.0 for identical text, and near 0 for anything else. That is enough to test
the duplicate-detection *plumbing* end to end without a key — but it is not a model: it says
nothing about two questions that differ only in wording. Near-duplicate detection only becomes
meaningful with the real provider (see the M2 handover).
"""

import hashlib
import math
import random
from collections.abc import Callable, Sequence

from readi_worker.embeddings.base import EmbeddingError, EmbeddingResult

#: Roughly the tokens a text would cost, so cost reporting has a plausible shape without a key.
_CHARS_PER_TOKEN = 4


def deterministic_vector(text: str, dimensions: int) -> list[float]:
    """A unit-length vector seeded by the text itself."""
    seed = int.from_bytes(hashlib.blake2b(text.encode("utf-8"), digest_size=8).digest(), "big")
    rng = random.Random(seed)  # noqa: S311 - not cryptography: a reproducible stand-in vector
    raw = [rng.gauss(0.0, 1.0) for _ in range(dimensions)]
    norm = math.sqrt(sum(value * value for value in raw)) or 1.0
    return [value / norm for value in raw]


class FakeEmbeddingProvider:
    """Answers every call from the text itself. No network, no key, no cost."""

    provider = "fake"

    def __init__(self, dimensions: int) -> None:
        self._dimensions = dimensions

    async def embed(self, *, model: str, texts: Sequence[str]) -> EmbeddingResult:
        return EmbeddingResult(
            vectors=[deterministic_vector(text, self._dimensions) for text in texts],
            provider=self.provider,
            model=model,
            input_tokens=sum(len(text) // _CHARS_PER_TOKEN for text in texts),
            latency_ms=0,
        )


#: A scripted step: vectors to return, an exception to raise, or a function of the texts.
Step = list[list[float]] | Exception | Callable[[Sequence[str]], list[list[float]]]


class ScriptedEmbeddingProvider:
    """Returns the scripted steps in order and records every call (tests)."""

    provider = "fake"

    def __init__(self, steps: Sequence[Step]) -> None:
        self._steps = list(steps)
        self.calls: list[dict[str, object]] = []

    async def embed(self, *, model: str, texts: Sequence[str]) -> EmbeddingResult:
        self.calls.append({"model": model, "texts": list(texts)})
        step = self._steps.pop(0)
        if isinstance(step, Exception):
            raise step
        vectors = step(texts) if callable(step) else step
        return EmbeddingResult(
            vectors=vectors,
            provider=self.provider,
            model=model,
            input_tokens=len(texts),
            latency_ms=1,
        )


class FakeEmbeddingError(EmbeddingError):
    def __init__(self, code: str = "ConnectError") -> None:
        super().__init__(code, provider="fake", model="fake", latency_ms=1)
