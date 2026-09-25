"""LLM adapter interface (CLAUDE.md "AI provider adapters", ADR-0010).

Business logic depends on `LLMClient`; provider SDKs appear only in their implementations.
"""

from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel


@dataclass(frozen=True)
class LLMResult[T: BaseModel]:
    """One model call. `output` is None when the model gave no valid structured output."""

    output: T | None
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    #: Why `output` is missing: "refusal", "max_tokens", "invalid_output".
    failure: str | None = None


class LLMError(Exception):
    """The provider could not be reached or rejected the request (after the SDK's own retries)."""

    def __init__(self, code: str, *, provider: str, model: str, latency_ms: int) -> None:
        super().__init__(code)
        self.code = code
        self.provider = provider
        self.model = model
        self.latency_ms = latency_ms


class LLMClient(Protocol):
    provider: str

    async def parse[T: BaseModel](
        self,
        *,
        model: str,
        system: str,
        user: str,
        output_type: type[T],
        max_tokens: int,
        timeout_s: float | None = None,
    ) -> LLMResult[T]:
        """Ask for structured output validated as `output_type`.

        `timeout_s` overrides the client's own timeout for this call. It exists because the two
        kinds of call have nothing in common in how long they may take: a CV is parsed in a
        background job and 90 s is fine, while an interview turn has a candidate watching a spinner
        and a minute and a half of that is a broken product, not a slow one.
        """
        ...
