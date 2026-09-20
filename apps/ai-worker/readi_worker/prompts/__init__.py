"""Versioned prompt templates: `prompts/<name>.v<N>.md` (CLAUDE.md "Prompts").

Never edit a released version in place; add `v<N+1>` and switch to it behind config after an eval.
"""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent),
    undefined=StrictUndefined,  # a missing variable is a bug, not an empty string
    autoescape=False,  # plain text, not HTML  # noqa: S701 — candidate data is wrapped by `as_data`
    keep_trailing_newline=True,
)


def render(name: str, version: int, **variables: object) -> str:
    return _env.get_template(f"{name}.v{version}.md").render(**variables).strip()


def as_data(text: str, tag: str) -> str:
    """Wrap untrusted text in `<tag>…</tag>`, neutralising any copy of the tags inside it, so the
    text cannot close the data block and pose as instructions."""
    neutral = text.replace(f"<{tag}>", f"<{tag}_>").replace(f"</{tag}>", f"</{tag}_>")
    return f"<{tag}>\n{neutral}\n</{tag}>"
