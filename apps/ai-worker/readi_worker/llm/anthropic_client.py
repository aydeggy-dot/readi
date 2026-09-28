"""`LLMClient` backed by the Anthropic SDK (structured outputs via `messages.parse`)."""

import logging
import time
from typing import Literal

import anthropic
from anthropic.types import MessageParam, OutputConfigParam, TextBlockParam
from pydantic import BaseModel, ValidationError

from readi_worker.llm.base import LLMError, LLMResult

logger = logging.getLogger(__name__)

# Current Claude models reject sampling parameters (no temperature); consistency comes from
# schema-constrained output. `effort` is set where supported (not on Haiku 4.5): extraction needs
# little reasoning, and low effort keeps latency and thinking tokens down.
MODEL_EFFORT: dict[str, Literal["low", "medium", "high"]] = {
    "claude-sonnet-5": "low",
    "claude-opus-5": "low",
}

#: The shortest prefix each model will cache at all. Below it the provider silently declines — no
#: error, `cache_creation_input_tokens: 0` — so a prompt that shrinks under its model's minimum
#: stops caching and nothing says so. Recorded here in tokens; `test_anthropic_client.py` holds the
#: evaluator's system prompt above the larger of the two, because phase 7 may switch models.
#: Source: platform.claude.com/docs/en/build-with-claude/prompt-caching (checked 2026-09-28).
MIN_CACHEABLE_PREFIX_TOKENS: dict[str, int] = {
    "claude-opus-5": 512,
    "claude-sonnet-5": 1_024,
    "claude-haiku-4-5": 4_096,
}


class AnthropicLLMClient:
    provider = "anthropic"

    def __init__(
        self,
        api_key: str,
        *,
        timeout_s: float,
        max_retries: int = 2,
        http_client: anthropic.DefaultAsyncHttpxClient | None = None,
    ) -> None:
        # The SDK retries connection errors, 408, 409, 429 and 5xx with backoff.
        # `http_client` is for tests (a mock transport); production uses the SDK default.
        self._client = anthropic.AsyncAnthropic(
            api_key=api_key, timeout=timeout_s, max_retries=max_retries, http_client=http_client
        )

    async def aclose(self) -> None:
        await self._client.close()

    async def count_input_tokens(self, *, model: str, system: str, user: str) -> int:
        """Exactly how many input tokens this prompt is, straight from the provider.

        The token-counting endpoint costs nothing, which is the whole reason this exists: an eval
        run's cost estimate is a number the owner says yes or no to before any money is spent, and
        `chars / 3.7` is a guess dressed as one. The **output** schema's own tokens are not
        included — `count_tokens` takes no `output_config` — so a caller adding up a whole call's
        input should add the constant for it rather than assume this is the lot.
        """
        counted = await self._client.messages.count_tokens(
            model=model, system=system, messages=[{"role": "user", "content": user}]
        )
        return counted.input_tokens

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
        start = time.perf_counter()
        # Structured output via the documented `output_config.format` with the SDK's public schema
        # transform. Not `messages.parse`: it raises on truncated or refused output before the
        # stop reason can be read, and those cases must not be retried like invalid output.
        output_config: OutputConfigParam = {
            "format": {"type": "json_schema", "schema": anthropic.transform_schema(output_type)}
        }
        if effort := MODEL_EFFORT.get(model):
            output_config["effort"] = effort
        messages: list[MessageParam] = [{"role": "user", "content": user}]
        # The cacheable prefix is the system prompt and **nothing else**: render order is
        # `tools → system → messages`, and the user message diverges at its first interpolation two
        # lines in. So the breakpoint goes on the system block explicitly rather than through
        # top-level automatic caching, which would place it after the per-call tail and write an
        # entry no later call could read (a pure surcharge).
        system_param: str | list[TextBlockParam] = system
        if cache_system:
            system_param = [
                {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
            ]
        # A shallow copy of the client with its own deadline; the connection pool is shared.
        client = self._client if timeout_s is None else self._client.with_options(timeout=timeout_s)
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system_param,
                messages=messages,
                output_config=output_config,
            )
        except anthropic.APIError as exc:
            # Error type only: messages may echo request content.
            logger.warning("anthropic call failed: %s", type(exc).__name__)
            raise LLMError(
                type(exc).__name__, provider=self.provider, model=model, latency_ms=_ms(start)
            ) from None

        output: T | None = None
        failure: str | None = None
        if response.stop_reason == "refusal":
            failure = "refusal"
        elif response.stop_reason == "max_tokens":
            failure = "max_tokens"
        else:
            text = next((block.text for block in response.content if block.type == "text"), None)
            try:
                output = output_type.model_validate_json(text or "")
            except ValidationError:
                failure = "invalid_output"
        return LLMResult(
            output=output,
            provider=self.provider,
            model=model,
            # The uncached remainder, which is what the provider means by `input_tokens`: the whole
            # prompt is this plus the two cache counts. Reading only this field on a cached call is
            # how a bill stops reconciling.
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            latency_ms=_ms(start),
            failure=failure,
            cache_write_tokens=response.usage.cache_creation_input_tokens or 0,
            cache_read_tokens=response.usage.cache_read_input_tokens or 0,
        )


def _ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)
