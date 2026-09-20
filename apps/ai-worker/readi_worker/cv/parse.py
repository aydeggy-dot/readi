"""CV parsing: extract text → LLM structured output → normalise to ParsedCv (ADR-0010)."""

import asyncio
import base64
import binascii
import logging
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict

from readi_worker.contracts import AiCallRecord, CvParseRequest, CvParseResponse, ParsedCv
from readi_worker.cv.extract import extract_text
from readi_worker.llm.base import LLMClient, LLMError, LLMResult
from readi_worker.llm.pricing import token_cost_micro_usd
from readi_worker.logging_config import scrub
from readi_worker.prompts import as_data, render

logger = logging.getLogger(__name__)

PROMPT_VERSION = 1
MAX_ATTEMPTS = 3  # one call plus up to two retries on invalid output (CLAUDE.md "Evaluation")
MAX_OUTPUT_TOKENS = 8_000
EXTRACT_TIMEOUT_S = 20.0

# Limits mirror PARSED_CV_LIMITS in @readi/shared-types; the contract validates the result.
LIMITS = {
    "skills": 60,
    "skill_length": 60,
    "projects": 15,
    "experience": 20,
    "gaps": 10,
    "title_length": 120,
    "text_length": 600,
    "gap_length": 300,
    "technologies": 15,
}

# Readable forms of the shared enums for the prompt. A value added to TARGET_ROLES or
# EXPERIENCE_LEVELS widens the generated Literal, so `test_labels_cover_every_enum_value` fails
# here rather than the parse raising KeyError at runtime for every candidate with that role.
ROLE_LABELS = {"frontend": "frontend engineer", "backend": "backend engineer", "qa": "QA engineer"}
LEVEL_LABELS = {"intern_junior": "intern or junior", "mid": "mid"}


# What the model is asked to produce: the ParsedCv shape without length limits (limits are
# applied in code, so a slightly long answer is trimmed rather than rejected and retried).
class _Project(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    description: str
    technologies: list[str]


class _Experience(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    organisation: str
    start: str | None
    end: str | None
    current: bool
    summary: str


class CvExtraction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    skills: list[str]
    projects: list[_Project]
    experience: list[_Experience]
    gaps: list[str]


class CvParser:
    def __init__(self, llm: LLMClient, model: str) -> None:
        self._llm = llm
        self._model = model

    async def parse(self, request: CvParseRequest) -> CvParseResponse:
        calls: list[AiCallRecord] = []

        def respond(
            status: Literal["parsed", "unreadable", "failed"],
            parsed: ParsedCv | None = None,
            error: str | None = None,
        ) -> CvParseResponse:
            # Ids and outcomes only: never CV content.
            logger.info("cv parse %s: %s %s", request.request_id, status, error or "")
            return CvParseResponse.model_validate(
                {
                    "request_id": request.request_id,
                    "status": status,
                    "parsed": parsed,
                    "error": error,
                    "ai_calls": calls,
                }
            )

        try:
            data = base64.b64decode(request.file_base64, validate=True)
        except binascii.Error:
            return respond("unreadable", error="invalid_file")

        try:
            extracted = await asyncio.wait_for(
                asyncio.to_thread(extract_text, data, request.content_type), EXTRACT_TIMEOUT_S
            )
        except TimeoutError:
            return respond("unreadable", error="too_large")
        if extracted.text is None:
            return respond("unreadable", error=extracted.error)

        system = render(
            "cv_parse",
            PROMPT_VERSION,
            target_role_label=ROLE_LABELS.get(request.target_role, request.target_role),
            level_label=LEVEL_LABELS.get(request.level, request.level),
        )
        user = render(
            "cv_parse_input", PROMPT_VERSION, cv_text_block=as_data(extracted.text, "cv_text")
        )

        for _attempt in range(MAX_ATTEMPTS):
            try:
                result = await self._llm.parse(
                    model=self._model,
                    system=system,
                    user=user,
                    output_type=CvExtraction,
                    max_tokens=MAX_OUTPUT_TOKENS,
                )
            except LLMError as exc:
                calls.append(_error_record(exc))
                return respond("failed", error="llm_error")
            calls.append(_record(result))
            if result.output is not None:
                return respond("parsed", parsed=normalise(result.output))
            if result.failure == "refusal":
                return respond("failed", error="llm_error")
        return respond("failed", error="invalid_output")


def _record(result: LLMResult[CvExtraction]) -> AiCallRecord:
    return AiCallRecord.model_validate(
        {
            "purpose": "cv_parse",
            "provider": result.provider,
            "model": result.model,
            "status": "ok" if result.output is not None else "error",
            "error_code": result.failure,
            "latency_ms": result.latency_ms,
            "input_units": result.input_tokens,
            "output_units": result.output_tokens,
            "unit_kind": "tokens",
            "cost_micro_usd": token_cost_micro_usd(
                result.provider, result.model, result.input_tokens, result.output_tokens
            ),
        }
    )


def _error_record(exc: LLMError) -> AiCallRecord:
    return AiCallRecord.model_validate(
        {
            "purpose": "cv_parse",
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


# ---- Normalisation: trim, de-duplicate, apply limits, strip contact details.

_URL = re.compile(r"(?:https?://|www\.)\S+|\b(?:linkedin|github|twitter|x)\.com/\S*", re.IGNORECASE)
_REDACTION = re.compile(r"\[redacted-(?:email|phone)\]")
_YEAR_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_SPACE = re.compile(r"\s+")


def _clean(text: str, limit: int) -> str:
    """Removes links, emails and phone numbers (defence in depth: the prompt forbids them)."""
    text = _REDACTION.sub("", scrub(_URL.sub("", text)))
    return _SPACE.sub(" ", text).strip()[:limit].strip()


def _clean_list(items: list[str], limit: int, max_items: int) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        cleaned = _clean(item, limit)
        if cleaned and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            result.append(cleaned)
    return result[:max_items]


def _month(value: str | None) -> str | None:
    return value if value and _YEAR_MONTH.match(value.strip()) else None


def normalise(raw: CvExtraction) -> ParsedCv:
    projects = []
    for project in raw.projects:
        name = _clean(project.name, LIMITS["title_length"])
        if name:
            projects.append(
                {
                    "name": name,
                    "description": _clean(project.description, LIMITS["text_length"]),
                    "technologies": _clean_list(
                        project.technologies, LIMITS["skill_length"], LIMITS["technologies"]
                    ),
                }
            )
    experience = []
    for role in raw.experience:
        title = _clean(role.title, LIMITS["title_length"])
        if title:
            experience.append(
                {
                    "title": title,
                    "organisation": _clean(role.organisation, LIMITS["title_length"]),
                    "start": _month(role.start),
                    "end": None if role.current else _month(role.end),
                    "current": role.current,
                    "summary": _clean(role.summary, LIMITS["text_length"]),
                }
            )
    return ParsedCv.model_validate(
        {
            "skills": _clean_list(raw.skills, LIMITS["skill_length"], LIMITS["skills"]),
            "projects": projects[: LIMITS["projects"]],
            "experience": experience[: LIMITS["experience"]],
            "gaps": _clean_list(raw.gaps, LIMITS["gap_length"], LIMITS["gaps"]),
        }
    )


# ---- Local development without a provider key (LLM_PROVIDER=fake).

_KEYWORDS = [
    "JavaScript", "TypeScript", "React", "Next.js", "Vue", "Angular", "HTML", "CSS", "Tailwind",
    "Node.js", "Express", "NestJS", "Python", "Django", "Flask", "FastAPI", "Java", "Spring", "Go",
    "PHP", "Laravel", "C#", ".NET", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker",
    "Kubernetes", "AWS", "Git", "Selenium", "Cypress", "Playwright", "Postman", "Jest", "JUnit",
]  # fmt: skip


def keyword_extraction(_system: str, user: str) -> CvExtraction:
    """Deterministic stand-in for the model: finds well-known tool names in the CV text."""
    lowered = user.lower()
    skills = [
        k for k in _KEYWORDS if re.search(rf"(?<![\w.]){re.escape(k.lower())}(?!\w)", lowered)
    ]
    return CvExtraction(
        skills=skills,
        projects=[],
        experience=[],
        gaps=["Parsed by the development stand-in (LLM_PROVIDER=fake); results are approximate."],
    )
