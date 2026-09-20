"""`EmbeddingProvider` backed by Voyage AI's REST API (ADR-0006).

Voyage has a Python SDK, but its embeddings endpoint is one POST with one JSON body: httpx2 (which
the Anthropic SDK already brings in, and which the worker now pins directly) keeps the adapter
readable and lets the tests drive it through a mock transport, with no key and no network.
"""

import logging
import time
from collections.abc import Sequence

import httpx2

from readi_worker.embeddings.base import EmbeddingError, EmbeddingResult

logger = logging.getLogger(__name__)

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"

#: Retried by us, because one request embeds a whole batch and losing it wastes the whole run.
RETRY_STATUSES = frozenset({408, 429, 500, 502, 503, 504})
MAX_ATTEMPTS = 3


class VoyageEmbeddingProvider:
    provider = "voyage"

    def __init__(
        self,
        api_key: str,
        *,
        timeout_s: float,
        dimensions: int,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        # `transport` is for tests (a mock transport); production uses httpx2's default.
        self._client = httpx2.AsyncClient(timeout=timeout_s, transport=transport)
        self._api_key = api_key
        self._dimensions = dimensions

    async def aclose(self) -> None:
        await self._client.aclose()

    async def embed(self, *, model: str, texts: Sequence[str]) -> EmbeddingResult:
        start = time.perf_counter()
        body = {
            "model": model,
            "input": list(texts),
            # Questions are the documents we search; a candidate's text would be a "query".
            "input_type": "document",
            "output_dimension": self._dimensions,
        }
        last: tuple[str, int] | None = None
        for attempt in range(MAX_ATTEMPTS):
            try:
                response = await self._client.post(
                    VOYAGE_URL,
                    json=body,
                    headers={"authorization": f"Bearer {self._api_key}"},
                )
            except httpx2.HTTPError as exc:
                last = (type(exc).__name__, self._elapsed(start))
            else:
                if response.status_code == httpx2.codes.OK:
                    return self._result(response.json(), model, self._elapsed(start), texts)
                # Status only: an error body can echo the text we sent.
                last = (f"HTTP {response.status_code}", self._elapsed(start))
                if response.status_code not in RETRY_STATUSES:
                    break
            if attempt + 1 < MAX_ATTEMPTS:
                logger.warning("voyage embed attempt %d failed: %s", attempt + 1, last[0])
        raise self._error(last[0] if last else "unknown", model, last[1] if last else 0)

    def _result(
        self, payload: object, model: str, latency_ms: int, texts: Sequence[str]
    ) -> EmbeddingResult:
        if not isinstance(payload, dict):
            raise self._error("invalid_response", model, latency_ms)
        data = payload.get("data")
        if not isinstance(data, list) or len(data) != len(texts):
            raise self._error("invalid_response", model, latency_ms)
        vectors: list[list[float]] = []
        # Voyage documents the order, but `index` is authoritative: sort by it rather than trust it.
        for item in sorted(data, key=lambda entry: entry.get("index", 0)):
            embedding = item.get("embedding")
            if not isinstance(embedding, list) or len(embedding) != self._dimensions:
                raise self._error("wrong_dimensions", model, latency_ms)
            vectors.append([float(value) for value in embedding])
        usage = payload.get("usage") or {}
        return EmbeddingResult(
            vectors=vectors,
            provider=self.provider,
            model=payload.get("model") or model,
            input_tokens=int(usage.get("total_tokens", 0)),
            latency_ms=latency_ms,
        )

    def _error(self, code: str, model: str, latency_ms: int) -> EmbeddingError:
        return EmbeddingError(code[:60], provider=self.provider, model=model, latency_ms=latency_ms)

    @staticmethod
    def _elapsed(start: float) -> int:
        return round((time.perf_counter() - start) * 1000)
