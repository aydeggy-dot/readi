"""Worker configuration, validated at startup; invalid configuration fails fast and readably."""

from typing import Literal

from pydantic import Field, RedisDsn, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The modules rather than the names in them: a provider is added to `providers.py` and priced in
# `pricing.py`, and reading them through the module means this check sees that edit rather than a
# copy of it taken at import time.
from readi_worker.speech import pricing, providers


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
    #: The evaluator (M4): scoring one answer against its rubric. A **stronger** model than the
    #: interviewer, because this is the judgement the product is selling (product principle 1), and
    #: it is made once per answer rather than once per turn. It costs roughly three times as much
    #: per session; whether that buys better agreement with human scorers is what the `/evals`
    #: harness is for, and the owner asked for that comparison explicitly.
    llm_model_evaluator: str = Field(default="claude-opus-5", min_length=1)
    #: Per evaluator call. Nobody is watching a spinner — it runs in a queue once the session has
    #: ended — but the report is promised within 60 s of that (spec §8) and the API scores several
    #: answers at once, so a call slower than this has already lost the race and is better retried.
    evaluation_llm_timeout_s: float = Field(default=60.0, gt=0, le=600)
    #: Ask the evaluator for a **per-rubric** output schema in which a criterion cannot be left out
    #: or invented (`evaluation/strict_schema.py`). **On** since 2026-09-28, measured over 60
    #: answers and all twelve rubrics of the paid comparison: **0 rejected readings over 60 calls**
    #: against a matched v2 baseline of 74 over 297 (25%), nothing unscoreable, both separations 12
    #: of 12, fairness inside the band on all 36 criteria, and 3.40¢ an answer against 4.24¢
    #: (`docs/progress/2026-09-28-strict-criteria-run.md`). Turning it **off** goes back to an
    #: evaluator that threw away a quarter of its readings, so it is a diagnostic rather than a
    #: fallback.
    evaluator_strict_criteria_schema: bool = True

    # The interview engine (M3). Redis caches the session bundle and the live engine state so the
    # API need not resend the pinned questions on every turn; the snapshot the API sends is always
    # the authority, so losing this cache costs one round trip and never a session.
    interview_state_ttl_s: int = Field(default=7_200, ge=60, le=86_400)

    # LLM tracing (ADR-0008). Langfuse holds our prompts, and our prompts hold candidate answers and
    # CV text, so it is a personal-data store: EU region, opaque ids only, contact details masked on
    # the way out, and traces deleted on erasure and on a retention schedule.
    #
    # **Tracing is off unless both keys are present**, which is local development, CI and e2e. It is
    # two keys rather than one flag on purpose: there is no configuration in which tracing is "on"
    # and unable to reach Langfuse, and nothing to keep in step with a separate switch.
    langfuse_public_key: SecretStr | None = None
    langfuse_secret_key: SecretStr | None = None
    #: The EU region by default (ADR-0008). Change this and you have changed where traces live.
    langfuse_host: str = Field(default="https://cloud.langfuse.com", min_length=1)
    #: How long a trace lives. The same default as recordings will have in M5, and the same reason:
    #: long enough to debug a prompt, short enough that a transcript is not kept twice for ever.
    langfuse_retention_days: int = Field(default=30, ge=1, le=3650)
    langfuse_timeout_s: int = Field(default=10, ge=1, le=120)

    # Speech adapters (M5, ADR-0019/ADR-0020). `fake` is the resting state for the same reason
    # `LLM_PROVIDER=fake` is: a voice session bills by the minute and a dev stack runs for days.
    #
    # The providers are **names checked against a registry**, not a `Literal`: ADR-0020 chooses the
    # recogniser on real recordings in phase 6, and a type that had to be edited to try a candidate
    # would be a type doing procurement.
    #: Does this deployment serve voice interviews at all? False keeps the speech providers on the
    #: fakes without that being a misconfiguration — a text-only deployment (which is every
    #: deployment until M5 ships) needs no recogniser, and the voice agent refuses to start without
    #: this. It is the worker's switch; the API has its own, because it is the API that mints the
    #: tokens.
    voice_enabled: bool = False
    stt_provider: str = "fake"
    stt_model: str = Field(default="fake", min_length=1)
    #: The language tag sent to the recogniser. Nigerian English is `en` to most providers today;
    #: whether any of them offers something better is part of what phase 6 measures.
    stt_language: str = Field(default="en", min_length=2, max_length=16)
    stt_timeout_s: float = Field(default=20.0, gt=0, le=300)
    tts_provider: str = "fake"
    tts_model: str = Field(default="fake", min_length=1)
    #: Which voice speaks. One default Nigerian-accented voice is chosen by a blind panel in phase 7
    #: (`docs/plans/m5-voice.md` decision 10); until then this is the fake's placeholder.
    tts_voice: str = Field(default="fake", min_length=1)
    tts_timeout_s: float = Field(default=20.0, gt=0, le=300)
    #: Provider keys. A real provider without its key is refused at startup, naming the variable,
    #: the way `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` already are. `fake` needs none.
    deepgram_api_key: SecretStr | None = None
    assemblyai_api_key: SecretStr | None = None
    intron_api_key: SecretStr | None = None
    elevenlabs_api_key: SecretStr | None = None
    #: The technical vocabulary (`content/glossary/tech_terms.txt`), sent to the recogniser as
    #: custom vocabulary and scored as its own subset by the benchmark. Empty means "find it in the
    #: checkout"; a deployment that carries no repository sets the path explicitly.
    glossary_path: str | None = None

    # Embedding adapter (ADR-0006). `fake` is a pure function of the text: no key, no network, no
    # cost. `embedding_dimensions` must match the `vector(N)` column in the migration — the worker
    # refuses a provider answer of any other length rather than store an unsearchable row.
    embedding_provider: Literal["voyage", "fake"] = "fake"
    voyage_api_key: SecretStr | None = None
    embedding_model: str = Field(default="voyage-4", min_length=1)
    embedding_dimensions: int = Field(default=1024, ge=1, le=4096)
    embedding_timeout_s: float = Field(default=30.0, gt=0, le=600)

    @property
    def stt_key(self) -> SecretStr | None:
        """The key for the configured recogniser, or None when it needs none (`fake`)."""
        return {
            "deepgram": self.deepgram_api_key,
            "assemblyai": self.assemblyai_api_key,
            "intron": self.intron_api_key,
        }.get(self.stt_provider)

    @property
    def tts_key(self) -> SecretStr | None:
        return {"elevenlabs": self.elevenlabs_api_key}.get(self.tts_provider)

    @field_validator(
        "sentry_dsn",
        "anthropic_api_key",
        "voyage_api_key",
        "langfuse_public_key",
        "langfuse_secret_key",
        "deepgram_api_key",
        "assemblyai_api_key",
        "intron_api_key",
        "elevenlabs_api_key",
        mode="before",
    )
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

    @model_validator(mode="after")
    def _speech_configured(self) -> "Settings":
        """Refuse a speech provider this build cannot construct, or cannot price.

        **The price check is the unusual one, and it is deliberate** (owner's instruction,
        2026-09-29). A language model bills per call and an unpriced one shows up as a zero in a
        column somebody reads the same day. Recognition and synthesis bill per minute and per
        character, monthly, in arrears — so a provider `speech/pricing.py` has no rate for is not a
        zero in a column, it is a cost nobody sees until the invoice arrives. Both sides are checked
        even on `fake`, which is priced at zero precisely so that it needs no exception here.
        """
        if self.stt_provider not in providers.STT_PROVIDERS:
            raise ValueError(
                f"STT_PROVIDER={self.stt_provider!r} is not implemented; "
                f"available: {', '.join(sorted(providers.STT_PROVIDERS))}"
            )
        if self.tts_provider not in providers.TTS_PROVIDERS:
            raise ValueError(
                f"TTS_PROVIDER={self.tts_provider!r} is not implemented; "
                f"available: {', '.join(sorted(providers.TTS_PROVIDERS))}"
            )
        # **Streaming**, because that is the path a running worker takes: a voice interview is a
        # live conversation. The benchmark asks the same question of the batch path for itself.
        if not pricing.has_stt_price(self.stt_provider, self.stt_model, "streaming"):
            raise ValueError(_unpriced("STT", self.stt_provider, self.stt_model, " (streaming)"))
        if not pricing.has_tts_price(self.tts_provider, self.tts_model):
            raise ValueError(_unpriced("TTS", self.tts_provider, self.tts_model, ""))

        for side, provider, variables, key in (
            ("STT", self.stt_provider, providers.STT_KEY_VARIABLES, self.stt_key),
            ("TTS", self.tts_provider, providers.TTS_KEY_VARIABLES, self.tts_key),
        ):
            variable = variables.get(provider)
            if variable is not None and key is None:
                raise ValueError(
                    f"{variable} is required when {side}_PROVIDER={provider} "
                    f"(set {side}_PROVIDER=fake for local development without a key)"
                )
        if (
            self.environment == "production"
            and self.voice_enabled
            and (self.stt_provider == "fake" or self.tts_provider == "fake")
        ):
            raise ValueError(
                "STT_PROVIDER=fake and TTS_PROVIDER=fake are not allowed in production when "
                "VOICE_ENABLED=true (a text-only deployment leaves VOICE_ENABLED=false)"
            )
        return self

    @model_validator(mode="after")
    def _tracing_configured(self) -> "Settings":
        """One key without the other is a typo, not a configuration: say so rather than run blind.

        Tracing being off is a legitimate state (development, CI, e2e) and so is it being on. Half
        on is neither, and silently disabling it would hide a production misconfiguration until
        somebody went looking for traces that were never sent.
        """
        if (self.langfuse_public_key is None) != (self.langfuse_secret_key is None):
            raise ValueError(
                "LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY go together: set both to enable "
                "tracing (ADR-0008), or neither to disable it"
            )
        return self


def _unpriced(side: str, provider: str, model: str, path: str) -> str:
    """Why an unpriced provider is refused, said once (owner's instruction, 2026-09-29)."""
    return (
        f"no price is configured for {provider}/{model}{path} in readi_worker/speech/pricing.py. "
        "A per-minute vendor bills monthly, in arrears, so an unpriced one is not a zero in a "
        "column"
        "— it is a cost nobody sees until the invoice: add its rate, checked against the vendor's "
        "own"
        f"pricing page and dated, or set {side}_PROVIDER=fake"
    )


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
