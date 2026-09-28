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
    #: Tokens processed at the full input rate — the **uncached remainder**, which is what the
    #: provider reports. The whole prompt is this plus the two cache counts below.
    input_tokens: int
    output_tokens: int
    latency_ms: int
    #: Why `output` is missing: "refusal", "max_tokens", "invalid_output".
    failure: str | None = None
    #: Tokens written to the prompt cache by this call, billed at 1.25x the input rate.
    cache_write_tokens: int = 0
    #: Tokens served from the prompt cache, billed at 0.1x the input rate. Zero on a provider or a
    #: call that does not cache, which is every call with `cache_system=False`.
    cache_read_tokens: int = 0


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
        cache_system: bool = False,
    ) -> LLMResult[T]:
        """Ask for structured output validated as `output_type`.

        `timeout_s` overrides the client's own timeout for this call. It exists because the two
        kinds of call have nothing in common in how long they may take: a CV is parsed in a
        background job and 90 s is fine, while an interview turn has a candidate watching a spinner
        and a minute and a half of that is a broken product, not a slow one.

        `cache_system` asks the provider to cache the **system prompt** and nothing else. It is a
        flag rather than the default because it only pays where the same system prompt is sent
        repeatedly and the prompt clears the provider's minimum cacheable prefix; where it does not,
        it is a 1.25x surcharge on bytes nothing reads back. The evaluator sets it (one system
        prompt, every answer of every session); see `evaluation/calls.py`.
        """
        ...
