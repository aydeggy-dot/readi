# GENERATED from packages/shared-types (Zod) by `pnpm gen:contracts` (ADR-0003). Do not edit.

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, RootModel


class ReadiContracts(RootModel[Any]):
    root: Any = Field(..., title="ReadiContracts")


class HealthCheckResult(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    status: Literal["ok", "error"]
    latency_ms: int = Field(..., ge=0, le=9007199254740991)
    error: Literal["unreachable", "timeout", "not_migrated"] | None = None


class HealthResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    status: Literal["ok", "error"]
    service: Literal["api", "ai-worker"]
    checks: dict[str, HealthCheckResult]
