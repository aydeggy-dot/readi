"""Embedding requests: call the provider, report the call, answer with the vectors (ADR-0006)."""

import logging

from readi_worker.contracts import AiCallRecord, EmbedRequest, EmbedResponse
from readi_worker.embeddings.base import EmbeddingError, EmbeddingProvider, EmbeddingResult
from readi_worker.llm.pricing import token_cost_micro_usd

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self, provider: EmbeddingProvider, model: str, dimensions: int) -> None:
        self._provider = provider
        self._model = model
        self._dimensions = dimensions

    async def embed(self, request: EmbedRequest) -> EmbedResponse:
        # The contract generator wraps a length-constrained string in a RootModel, so the items of
        # `texts` are not `str` (ADR-0003). If a future generator collapses them, this line stops
        # typechecking and is deleted — which is the right way to find out.
        texts = [text.root for text in request.texts]
        try:
            result = await self._provider.embed(model=self._model, texts=texts)
        except EmbeddingError as exc:
            logger.info("embed %s failed: %s", request.request_id, exc.code)
            return self._respond(request, error=exc.code, calls=[_error_record(exc)])

        if result.dimensions != self._dimensions:
            # A model whose vector length is not the one the database column was built for would
            # be stored as a silently unsearchable row, so refuse it here (ADR-0006).
            logger.error(
                "embed %s: %s returned %d dimensions, expected %d",
                request.request_id,
                result.model,
                result.dimensions,
                self._dimensions,
            )
            return self._respond(request, error="wrong_dimensions", calls=[_record(result)])

        return EmbedResponse.model_validate(
            {
                "request_id": str(request.request_id),
                "status": "ok",
                "error": None,
                "model": result.model,
                "dimensions": result.dimensions,
                "embeddings": result.vectors,
                "ai_calls": [_record(result)],
            }
        )

    def _respond(
        self, request: EmbedRequest, *, error: str, calls: list[AiCallRecord]
    ) -> EmbedResponse:
        return EmbedResponse.model_validate(
            {
                "request_id": str(request.request_id),
                "status": "failed",
                "error": error,
                "model": self._model,
                "dimensions": 0,
                "embeddings": [],
                "ai_calls": calls,
            }
        )


def _record(result: EmbeddingResult) -> AiCallRecord:
    return AiCallRecord.model_validate(
        {
            "purpose": "embedding",
            "provider": result.provider,
            "model": result.model,
            "status": "ok",
            "error_code": None,
            "latency_ms": result.latency_ms,
            "input_units": result.input_tokens,
            # Embeddings have no output tokens; the ledger keeps the shape of every other call.
            "output_units": 0,
            "unit_kind": "tokens",
            "cost_micro_usd": token_cost_micro_usd(
                result.provider, result.model, result.input_tokens, 0
            ),
        }
    )


def _error_record(exc: EmbeddingError) -> AiCallRecord:
    return AiCallRecord.model_validate(
        {
            "purpose": "embedding",
            "provider": exc.provider,
            "model": exc.model,
            "status": "error",
            "error_code": exc.code[:60],
            "latency_ms": exc.latency_ms,
            "input_units": 0,
            "output_units": 0,
            "unit_kind": "tokens",
            "cost_micro_usd": 0,
        }
    )
