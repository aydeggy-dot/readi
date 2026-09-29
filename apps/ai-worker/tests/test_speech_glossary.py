"""The technical vocabulary: the file that is both the recogniser's keyterms and the benchmark's
tech-term subset (ADR-0020 §7)."""

from pathlib import Path

import pytest

from readi_worker.settings import Settings
from readi_worker.speech.factory import build_stt, build_tts, glossary_for
from readi_worker.speech.glossary import GlossaryError, default_glossary_path, load_terms


def test_the_shipped_glossary_loads() -> None:
    """Asserted against the real file, not a fixture: a glossary that stopped parsing would
    otherwise fail silently as a recogniser that quietly got worse at our own vocabulary."""
    terms = load_terms()

    assert len(terms) > 200
    assert "idempotent" in terms
    assert "Kubernetes" in terms
    assert "PostgreSQL" in terms
    # Every stack the catalogue offers is a word a candidate will say out loud.
    for term in ("React", "Cypress", "Laravel", "Playwright", "Spring", "Django"):
        assert term in terms


def test_comments_and_blank_lines_are_not_terms() -> None:
    assert not any(term.startswith("#") for term in load_terms())
    assert all(term.strip() for term in load_terms())


def test_duplicates_are_dropped_case_insensitively(tmp_path: Path) -> None:
    """ "Postgres" twice in two sections is a typo; "Postgres" and "PostgreSQL" are two terms."""
    source = tmp_path / "terms.txt"
    source.write_text("# a comment\nPostgres\npostgres\nPostgreSQL\n\nRedis\n", encoding="utf-8")

    assert load_terms(source) == ["Postgres", "PostgreSQL", "Redis"]


def test_the_shipped_glossary_has_no_duplicates() -> None:
    raw = default_glossary_path().read_text(encoding="utf-8").splitlines()
    written = [line.strip() for line in raw if line.strip() and not line.startswith("#")]
    assert len(written) == len(load_terms()), "a term is in the file twice"


def test_a_provider_cap_keeps_the_first_terms_and_says_what_it_dropped(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The file's order is its priority order, so truncation is a decision the file already made —
    and it is logged, because a silently shortened vocabulary looks exactly like one that did not
    help."""
    terms = load_terms(limit=5)

    assert terms == load_terms()[:5]
    assert "keeping the first 5" in caplog.text


def test_a_missing_glossary_is_named(tmp_path: Path) -> None:
    with pytest.raises(GlossaryError, match="cannot read the glossary"):
        load_terms(tmp_path / "nothing.txt")


def test_an_empty_glossary_is_refused(tmp_path: Path) -> None:
    source = tmp_path / "terms.txt"
    source.write_text("# only comments\n\n", encoding="utf-8")
    with pytest.raises(GlossaryError, match="holds no terms"):
        load_terms(source)


def test_the_factory_builds_what_the_registry_advertises(settings: Settings) -> None:
    """`providers.py` and `factory.py` going out of step is the one failure the factory's
    `RuntimeError` exists for, and it would only appear in a deployment."""
    assert build_stt(settings).provider == "fake"
    assert build_tts(settings).provider == "fake"


def test_the_configured_path_overrides_the_checkout(settings: Settings, tmp_path: Path) -> None:
    """An image that carries no repository sets GLOSSARY_PATH; everything else finds the file."""
    source = tmp_path / "terms.txt"
    source.write_text("Kubernetes\nidempotent\n", encoding="utf-8")

    configured = settings.model_copy(update={"glossary_path": str(source)})
    assert glossary_for(configured) == ["Kubernetes", "idempotent"]
    # And without an override it finds the checkout's copy, capped for the vendor's live path.
    assert glossary_for(settings) == load_terms()[:100]
