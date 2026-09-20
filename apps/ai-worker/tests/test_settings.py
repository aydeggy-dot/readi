import pytest

from readi_worker.settings import SettingsError, load_settings

TOKEN = "t" * 40


@pytest.fixture(autouse=True)
def _base_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("ANTHROPIC_API_KEY", "LLM_PROVIDER", "ENVIRONMENT"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("LLM_PROVIDER", "fake")


def test_loads_valid_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("PORT", "8123")
    monkeypatch.setenv("SENTRY_DSN", "")

    settings = load_settings(env_file=None)

    assert settings.port == 8123
    assert str(settings.redis_url) == "redis://localhost:6379/0"
    assert settings.sentry_dsn is None


def test_missing_required_variable_is_named(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("REDIS_URL", raising=False)

    with pytest.raises(SettingsError, match="REDIS_URL"):
        load_settings(env_file=None)


def test_invalid_values_are_not_echoed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REDIS_URL", "not-a-url-with-s3cr3t")
    monkeypatch.setenv("PORT", "99999")

    with pytest.raises(SettingsError) as info:
        load_settings(env_file=None)

    message = str(info.value)
    assert "REDIS_URL" in message
    assert "PORT" in message
    assert "s3cr3t" not in message


def test_anthropic_provider_requires_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    with pytest.raises(SettingsError, match="ANTHROPIC_API_KEY"):
        load_settings(env_file=None)

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key-not-real")
    settings = load_settings(env_file=None)
    assert settings.llm_model_cv_parse == "claude-sonnet-5"
    assert "sk-ant" not in repr(settings)


def test_fake_llm_is_refused_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(SettingsError, match="LLM_PROVIDER=fake"):
        load_settings(env_file=None)


def test_service_token_is_required_and_long(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("SERVICE_TOKEN", "short")
    with pytest.raises(SettingsError, match="SERVICE_TOKEN"):
        load_settings(env_file=None)
