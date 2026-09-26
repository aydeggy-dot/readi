"""`POST /traces/delete` (API → worker only, service token required).

Deleting a personal-data store's contents is the API's decision and the worker's action: the API
knows whose account was erased and when the retention sweep runs, and the worker is the only thing
holding the Langfuse credentials (ADR-0004, ADR-0008).

A worker with no keys answers `{"enabled": false, "deleted": 0}` — a success, because nothing was
ever traced. That is what lets account erasure call this unconditionally in development, CI and
e2e without either a second configuration switch on the API side or a swallowed failure.
"""

import logging
from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from readi_worker.contracts import TraceDeleteRequest, TraceDeleteResponse
from readi_worker.tracing.tracer import Tracer

logger = logging.getLogger(__name__)


def build_tracing_router(
    tracer: Tracer, auth: Callable[..., Coroutine[Any, Any, None]]
) -> APIRouter:
    router = APIRouter(dependencies=[Depends(auth)])

    @router.post("/traces/delete", response_model=TraceDeleteResponse)
    async def delete_traces(request: TraceDeleteRequest) -> TraceDeleteResponse:
        if request.user_id is None and not request.expired:
            # A no-op would look like a working sweep for ever; say what is wrong instead.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="one of user_id or expired is required",
            )
        if not tracer.enabled:
            return TraceDeleteResponse(enabled=False, deleted=0)
        deleted = 0
        if request.user_id is not None:
            deleted += await tracer.delete_for_user(str(request.user_id))
        if request.expired:
            deleted += await tracer.delete_expired()
        return TraceDeleteResponse(enabled=True, deleted=deleted)

    return router
