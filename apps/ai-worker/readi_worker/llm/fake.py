"""Deterministic `LLMClient`s: scripted outputs for tests, and a keyword-based stand-in for local
development without an API key (`LLM_PROVIDER=fake`)."""

from collections.abc import Callable, Sequence

from pydantic import BaseModel

from readi_worker.llm.base import LLMError, LLMResult

#: A scripted step: an output, a failure reason (str), an exception, or a function of the prompt.
Step = BaseModel | str | Exception | Callable[[str, str], BaseModel]


class ScriptedLLMClient:
    """Returns the scripted steps in order and records every call (tests)."""

    provider = "fake"

    def __init__(self, steps: Sequence[Step]) -> None:
        self._steps = list(steps)
        self.calls: list[dict[str, str]] = []

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
        self.calls.append({"model": model, "system": system, "user": user})
        step = self._steps.pop(0)
        if isinstance(step, Exception):
            raise step
        if isinstance(step, str):
            return self._result(None, model, failure=step)
        value = step(system, user) if callable(step) and not isinstance(step, BaseModel) else step
        return self._result(output_type.model_validate(value.model_dump()), model)

    def _result[T: BaseModel](
        self, output: T | None, model: str, failure: str | None = None
    ) -> LLMResult[T]:
        return LLMResult(
            output=output,
            provider=self.provider,
            model=model,
            input_tokens=1000,
            output_tokens=200,
            latency_ms=5,
            failure=failure,
        )


class FakeLLMError(LLMError):
    def __init__(self, code: str = "APIConnectionError") -> None:
        super().__init__(code, provider="fake", model="fake", latency_ms=5)


class FunctionLLMClient:
    """Answers every call with `build(system, user)` (local development without a provider key)."""

    provider = "fake"

    def __init__(self, build: Callable[[str, str], BaseModel]) -> None:
        self._build = build

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
        output = output_type.model_validate(self._build(system, user).model_dump())
        return LLMResult(
            output=output,
            provider=self.provider,
            model="fake",
            input_tokens=0,
            output_tokens=0,
            latency_ms=0,
        )
