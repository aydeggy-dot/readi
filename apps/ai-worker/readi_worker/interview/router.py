"""`POST /interview/advance` (API → worker only, service token required).

One route for the whole engine. The API drives every turn in text mode, so there is nothing else to
expose; M5 adds the push direction, when the LiveKit agent drives turns itself (ADR-0004).
"""

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Depends

from readi_worker.contracts import InterviewAdvanceRequest, InterviewAdvanceResponse
from readi_worker.interview.service import InterviewService


def build_interview_router(
    service: InterviewService, auth: Callable[..., Coroutine[Any, Any, None]]
) -> APIRouter:
    router = APIRouter(dependencies=[Depends(auth)])

    @router.post("/interview/advance", response_model=InterviewAdvanceResponse)
    async def advance(request: InterviewAdvanceRequest) -> InterviewAdvanceResponse:
        return await service.advance(request)

    return router
