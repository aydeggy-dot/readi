"""Worker configuration, validated at startup; invalid configuration fails fast and readably."""

from typing import Literal

from pydantic import Field, RedisDsn, ValidationError, field_validator
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

    @field_validator("sentry_dsn", mode="before")
    @classmethod
    def _empty_is_none(cls, value: object) -> object:
        return None if value == "" else value


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
