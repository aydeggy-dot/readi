"""`LLMClient` backed by the Anthropic SDK (structured outputs via `messages.parse`)."""

import logging
import time
from typing import Literal

import anthropic
from anthropic.types import MessageParam, OutputConfigParam
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

    async def parse[T: BaseModel](
        self,
        *,
        model: str,
        system: str,
        user: str,
        output_type: type[T],
        max_tokens: int,
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
        try:
            response = await self._client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
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
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            latency_ms=_ms(start),
            failure=failure,
        )


def _ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)
