"""Finding files that live in the repository rather than in the package.

Two things the worker reads are repository content, not code: the seed rubrics and answer sets the
eval harness loads, and the speech glossary (`content/glossary/tech_terms.txt`). Both are found by
walking up from this file to the directory that holds `content/`, which works from a checkout, from
`uv run` in any subdirectory, and from pytest — and fails readably rather than silently reading
nothing when the worker runs from an image that carries no repository.

One implementation, because two copies of "where is the repository root" drift the moment one of
them learns about a new layout.
"""

from pathlib import Path


class RepoRootError(RuntimeError):
    """No repository root above the starting point."""


def repo_root(start: Path | None = None) -> Path:
    """The repository root: the nearest ancestor that holds a `content/` directory."""
    here = (start or Path(__file__)).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "content").is_dir():
            return candidate
    raise RepoRootError(f"no repository root above {here}: no content/ directory found")
