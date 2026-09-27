"""`POST /evaluate/answer` (API → worker only, service token required).

One answer per request, not one session. Each is independently retryable, independently
idempotent on the API's side (`answer_evaluations` is unique per pinned question) and
independently paid for, so one unscoreable answer cannot cost a whole report. The API decides how
many to run at once, which is where the "report within 60 s" budget is actually spent (spec §8).
"""

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Depends

from readi_worker.contracts import EvaluateAnswerRequest, EvaluateAnswerResponse
from readi_worker.evaluation.service import EvaluationService


def build_evaluation_router(
    service: EvaluationService, auth: Callable[..., Coroutine[Any, Any, None]]
) -> APIRouter:
    router = APIRouter(dependencies=[Depends(auth)])

    @router.post("/evaluate/answer", response_model=EvaluateAnswerResponse)
    async def evaluate(request: EvaluateAnswerRequest) -> EvaluateAnswerResponse:
        return await service.evaluate(request)

    return router
