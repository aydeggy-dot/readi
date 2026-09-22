"""`POST /embeddings` (API → worker only, service token required)."""

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Depends

from readi_worker.contracts import EmbedRequest, EmbedResponse
from readi_worker.embeddings.service import EmbeddingService


def build_embeddings_router(
    service: EmbeddingService, auth: Callable[..., Coroutine[Any, Any, None]]
) -> APIRouter:
    router = APIRouter(dependencies=[Depends(auth)])

    @router.post("/embeddings", response_model=EmbedResponse)
    async def embed(request: EmbedRequest) -> EmbedResponse:
        return await service.embed(request)

    return router
