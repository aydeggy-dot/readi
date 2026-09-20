# GENERATED from packages/shared-types (Zod) by `pnpm gen:contracts` (ADR-0003). Do not edit.

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, RootModel
from uuid import UUID


class ReadiContracts(RootModel[Any]):
    root: Any = Field(..., title="ReadiContracts")


class ErrorCode(RootModel[str]):
    root: str = Field(..., max_length=60, min_length=1)


class Technology(RootModel[str]):
    root: str = Field(..., max_length=60, min_length=1)


class CvProject(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: str = Field(..., max_length=120, min_length=1)
    description: str = Field(..., max_length=600)
    technologies: list[Technology] = Field(..., max_length=15)


class Skill(RootModel[str]):
    root: str = Field(..., max_length=60, min_length=1)


class Gap(RootModel[str]):
    root: str = Field(..., max_length=300, min_length=1)


class YearMonth(RootModel[str]):
    root: str = Field(..., pattern="^\\d{4}-(0[1-9]|1[0-2])$")


class AiCallRecord(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    purpose: Literal[
        "interviewer",
        "follow_up",
        "evaluator",
        "cv_parse",
        "plan_summary",
        "embedding",
        "stt",
        "tts",
        "avatar",
    ]
    provider: str = Field(..., max_length=40, min_length=1)
    model: str = Field(..., max_length=80, min_length=1)
    status: Literal["ok", "error"]
    error_code: ErrorCode | None
    latency_ms: int = Field(..., ge=0, le=9007199254740991)
    input_units: int = Field(..., ge=0, le=9007199254740991)
    output_units: int = Field(..., ge=0, le=9007199254740991)
    unit_kind: Literal["tokens", "characters", "seconds"]
    cost_micro_usd: int = Field(..., ge=0, le=9007199254740991)


class CvExperience(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    title: str = Field(..., max_length=120, min_length=1)
    organisation: str = Field(..., max_length=120)
    start: YearMonth | None
    end: YearMonth | None
    current: bool
    summary: str = Field(..., max_length=600)


class CvParseRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    request_id: UUID
    content_type: Literal[
        "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]
    file_base64: str = Field(
        ...,
        json_schema_extra={"contentEncoding": "base64"},
        max_length=6990508,
        min_length=1,
        pattern="^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$",
    )
    target_role: Literal["frontend", "backend", "qa"]
    level: Literal["intern_junior", "mid"]


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


class ParsedCv(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    skills: list[Skill] = Field(..., max_length=60)
    projects: list[CvProject] = Field(..., max_length=15)
    experience: list[CvExperience] = Field(..., max_length=20)
    gaps: list[Gap] = Field(..., max_length=10)


class CvParseResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    request_id: UUID
    status: Literal["parsed", "unreadable", "failed"]
    parsed: ParsedCv | None
    error: (
        Literal[
            "no_text",
            "encrypted",
            "invalid_file",
            "too_large",
            "llm_error",
            "invalid_output",
            "worker_unavailable",
        ]
        | None
    )
    ai_calls: list[AiCallRecord]
