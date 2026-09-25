"""Worker configuration, validated at startup; invalid configuration fails fast and readably."""

from typing import Literal

from pydantic import Field, RedisDsn, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", frozen=True)

    environment: Literal["development", "test", "production"] = "development"
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: Literal["debug", "info", "warning", "error"] = "info"
    redis_url: RedisDsn
    health_check_timeout_ms: int = Field(default=2000, ge=50, le=30_000)
    sentry_dsn: str | None = None

    # API → worker authentication (ADR-0004): the API sends `Authorization: Bearer <token>`.
    service_token: SecretStr = Field(min_length=32)

    # LLM adapter (ADR-0010). `fake` returns deterministic output without calling any provider.
    llm_provider: Literal["anthropic", "fake"] = "anthropic"
    anthropic_api_key: SecretStr | None = None
    llm_model_cv_parse: str = Field(default="claude-sonnet-5", min_length=1)
    #: The live interviewer (M3): phrasing and the coverage judgement. A fast model, because the
    #: candidate is waiting for it; the stronger evaluator model is a different call (M4).
    llm_model_interviewer: str = Field(default="claude-sonnet-5", min_length=1)
    llm_timeout_s: float = Field(default=90.0, gt=0, le=600)
    #: Per interview call, and deliberately much shorter than `llm_timeout_s`: a CV is parsed in a
    #: background job, an interview turn has a candidate waiting for it. Two of these chained is the
    #: worst case one exchange puts in front of them, which is what `AI_WORKER_TIMEOUT_MS` is sized
    #: from on the API side.
    interview_llm_timeout_s: float = Field(default=45.0, gt=0, le=600)

    # The interview engine (M3). Redis caches the session bundle and the live engine state so the
    # API need not resend the pinned questions on every turn; the snapshot the API sends is always
    # the authority, so losing this cache costs one round trip and never a session.
    interview_state_ttl_s: int = Field(default=7_200, ge=60, le=86_400)

    # Embedding adapter (ADR-0006). `fake` is a pure function of the text: no key, no network, no
    # cost. `embedding_dimensions` must match the `vector(N)` column in the migration — the worker
    # refuses a provider answer of any other length rather than store an unsearchable row.
    embedding_provider: Literal["voyage", "fake"] = "fake"
    voyage_api_key: SecretStr | None = None
    embedding_model: str = Field(default="voyage-4", min_length=1)
    embedding_dimensions: int = Field(default=1024, ge=1, le=4096)
    embedding_timeout_s: float = Field(default=30.0, gt=0, le=600)

    @field_validator("sentry_dsn", "anthropic_api_key", "voyage_api_key", mode="before")
    @classmethod
    def _empty_is_none(cls, value: object) -> object:
        return None if value == "" else value

    @model_validator(mode="after")
    def _llm_configured(self) -> "Settings":
        if self.llm_provider == "anthropic" and self.anthropic_api_key is None:
            raise ValueError(
                "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic "
                "(set LLM_PROVIDER=fake for local development without a key)"
            )
        if self.environment == "production" and self.llm_provider == "fake":
            raise ValueError("LLM_PROVIDER=fake is not allowed in production")
        return self

    @model_validator(mode="after")
    def _embedding_configured(self) -> "Settings":
        if self.embedding_provider == "voyage" and self.voyage_api_key is None:
            raise ValueError(
                "VOYAGE_API_KEY is required when EMBEDDING_PROVIDER=voyage "
                "(set EMBEDDING_PROVIDER=fake for local development without a key)"
            )
        if self.environment == "production" and self.embedding_provider == "fake":
            raise ValueError("EMBEDDING_PROVIDER=fake is not allowed in production")
        return self


class SettingsError(RuntimeError):
    """Raised when the environment does not satisfy `Settings`."""


def load_settings(env_file: str | None = ".env") -> Settings:
    """Load settings from the environment (and `env_file`), naming each invalid variable.

    Values are never echoed back: they may be secrets.
    """
    try:
        return Settings(_env_file=env_file)
    except ValidationError as exc:
        problems = "\n".join(
            f"  - {'.'.join(str(part) for part in error['loc']).upper()}: {error['msg']}"
            for error in exc.errors(include_input=False, include_url=False)
        )
        message = f"Invalid AI worker configuration (see apps/ai-worker/.env.example):\n{problems}"
        raise SettingsError(message) from None
