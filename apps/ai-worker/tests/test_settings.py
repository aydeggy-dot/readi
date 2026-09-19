import pytest

from readi_worker.settings import SettingsError, load_settings


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
