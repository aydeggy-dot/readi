"""`POST /cv/parse` (API → worker only, service token required)."""

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Depends

from readi_worker.contracts import CvParseRequest, CvParseResponse
from readi_worker.cv.parse import CvParser


def build_cv_router(parser: CvParser, auth: Callable[..., Coroutine[Any, Any, None]]) -> APIRouter:
    router = APIRouter(dependencies=[Depends(auth)])

    @router.post("/cv/parse", response_model=CvParseResponse)
    async def parse_cv(request: CvParseRequest) -> CvParseResponse:
        return await parser.parse(request)

    return router
