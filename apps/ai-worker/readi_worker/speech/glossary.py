"""The technical vocabulary, loaded from `content/glossary/tech_terms.txt` (M5, ADR-0020).

One file, two uses — custom vocabulary for the recogniser and the benchmark's tech-term subset — and
one loader, so the two can never be reading different lists.
"""

import logging
from pathlib import Path

from readi_worker.paths import RepoRootError, repo_root

logger = logging.getLogger(__name__)

GLOSSARY_RELATIVE_PATH = Path("content") / "glossary" / "tech_terms.txt"


class GlossaryError(RuntimeError):
    """The glossary could not be found or holds nothing."""


def default_glossary_path() -> Path:
    """Where the glossary lives in a checkout. Overridden by `GLOSSARY_PATH` in a deployment."""
    try:
        return repo_root() / GLOSSARY_RELATIVE_PATH
    except RepoRootError as exc:  # pragma: no cover - only outside a checkout
        raise GlossaryError(str(exc)) from None


def load_terms(path: Path | None = None, *, limit: int | None = None) -> list[str]:
    """The terms, in file order, with comments and blank lines dropped.

    Duplicates are removed **case-insensitively**, keeping the first spelling, because the file is
    edited by hand alongside the question banks and "Postgres" twice in two sections is a typo
    rather than emphasis — while "Postgres" and "PostgreSQL" are two terms a candidate really does
    say.

    `limit` is the provider's cap on how many keyterms it will accept. Above it the **first** terms
    are kept, which is why the file says its order is its priority order; the drop is logged with
    the count, because a silently shortened vocabulary looks exactly like a vocabulary that did not
    help.
    """
    source = path or default_glossary_path()
    try:
        raw = source.read_text(encoding="utf-8")
    except OSError as exc:
        raise GlossaryError(f"cannot read the glossary at {source}: {exc.strerror}") from None

    terms: list[str] = []
    seen: set[str] = set()
    for line in raw.splitlines():
        term = line.strip()
        if not term or term.startswith("#"):
            continue
        key = term.casefold()
        if key in seen:
            continue
        seen.add(key)
        terms.append(term)

    if not terms:
        raise GlossaryError(f"the glossary at {source} holds no terms")

    if limit is not None and len(terms) > limit:
        logger.warning(
            "glossary has %d terms and the provider takes %d; keeping the first %d",
            len(terms),
            limit,
            limit,
        )
        return terms[:limit]
    return terms
