"""EmbeddingProvider interface (CLAUDE.md "AI provider adapters", ADR-0006).

Mirrors `llm/base.py`: business logic depends on the Protocol, provider SDKs and HTTP live in the
implementations, and latency is measured inside the adapter so every provider reports it alike.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class EmbeddingResult:
    """One embedding call: one unit-length vector per input text, in the order they were sent."""

    vectors: list[list[float]]
    provider: str
    model: str
    input_tokens: int
    latency_ms: int

    @property
    def dimensions(self) -> int:
        return len(self.vectors[0]) if self.vectors else 0


class EmbeddingError(Exception):
    """The provider could not be reached, or rejected the request."""

    def __init__(self, code: str, *, provider: str, model: str, latency_ms: int) -> None:
        super().__init__(code)
        self.code = code
        self.provider = provider
        self.model = model
        self.latency_ms = latency_ms


class EmbeddingProvider(Protocol):
    provider: str

    async def embed(self, *, model: str, texts: Sequence[str]) -> EmbeddingResult:
        """Embed each text. Raises `EmbeddingError` if the provider could not answer."""
        ...
