"""What never leaves the worker in a trace (ADR-0008).

Langfuse is a personal-data store, not a log sink, so this is not a substitute for the retention
and deletion rules around it. What it removes is the class of detail that has no debugging value
and every privacy cost: a candidate's email address, their phone number, the link to their GitHub,
the street they live on. A prompt is still readable without them, which is the whole test for
whether a mask is worth having.

It is the SDK's `mask` hook, so it runs on **every** trace, not only on CV parsing as ADR-0008
requires. Two reasons for the wider net: a candidate types their own email into an interview answer
often enough ("you can reach me at …" in a wrap-up question), and one rule over everything is a
rule that can be read and tested, where "masked on this path and not that one" is a rule nobody can
check. It costs a little debugging detail on interview prompts, which contain staff-written content
and almost never a URL.

**It must never raise.** A mask that throws inside the SDK's export path would, at best, lose the
trace and, at worst, send the unmasked value — so everything is wrapped, and an unexpected type
becomes a marker rather than an exception.
"""

import re
from typing import Any

from readi_worker.logging_config import scrub

#: Anything that could be a link to a person: their portfolio, their profile, their repository. The
#: bare-domain half deliberately catches "linkedin.com/in/…" written without a scheme, which is how
#: it usually appears on a CV. Mirrors the pattern `cv/parse.py` already applies to parsed output.
_URL = re.compile(r"(?:https?://|www\.)\S+|\b[A-Za-z0-9-]+\.(?:com|org|net|io|dev|ng)/\S*")

#: A street address, conservatively: a house number followed by a few words and a street word.
#: It will miss plenty — addresses are not a regex — and that is stated rather than hidden. The
#: high-value identifiers here are the email and the phone number, both of which are exact.
_STREET = re.compile(
    r"\b\d{1,4}[A-Za-z]?,?\s+(?:[A-Z][\w'-]*\s+){0,4}"
    r"(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Close|Crescent|Drive|Lane|Way|Boulevard|Estate)\b",
    re.IGNORECASE,
)

REDACTED_URL = "[redacted-url]"
REDACTED_ADDRESS = "[redacted-address]"
#: What an unmaskable value becomes. Visible in the trace on purpose: a trace that quietly dropped
#: a field reads like a bug in the prompt.
REDACTED_UNKNOWN = "[redacted-unmaskable]"

#: How deep the recursion goes before it stops walking. Our trace payloads are two levels at most
#: (a dict of strings); anything deeper is a structure we did not intend to send.
MAX_DEPTH = 6


def mask_text(text: str) -> str:
    """Remove contact details from one string: email, phone, URL, street address."""
    return _STREET.sub(REDACTED_ADDRESS, _URL.sub(REDACTED_URL, scrub(text)))


def mask_personal_data(*, data: Any, **_kwargs: Any) -> Any:
    """The Langfuse `mask` hook: called with every input, output and metadata value we send.

    The signature is the SDK's (keyword-only `data`, plus whatever it may pass in future), so the
    `**_kwargs` is not decoration — a positional signature breaks on the next SDK minor.
    """
    try:
        return _mask(data, MAX_DEPTH)
    except Exception:  # see the module docstring: this may never raise
        return REDACTED_UNKNOWN


def _mask(data: Any, depth: int) -> Any:
    if depth <= 0:
        return REDACTED_UNKNOWN
    if isinstance(data, str):
        return mask_text(data)
    if isinstance(data, dict):
        return {key: _mask(value, depth - 1) for key, value in data.items()}
    if isinstance(data, list | tuple):
        return [_mask(item, depth - 1) for item in data]
    if isinstance(data, bool | int | float) or data is None:
        return data
    # Anything else is rendered by the SDK anyway, so render it here where we can still mask it.
    return mask_text(str(data))
