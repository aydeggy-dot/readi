"""PII redaction for worker logs (CLAUDE.md §5: never log emails or phone numbers; use ids).

Mirrors apps/api/src/logging/scrub.ts. Installed on the root handlers at startup, so every logger
(including uvicorn's and third-party libraries') is covered.
"""

import logging
import re

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE = re.compile(r"\+\d{8,15}\b|\b234[789]\d{9}\b|\b0[789][01]\d{8}\b")

REDACTED_EMAIL = "[redacted-email]"
REDACTED_PHONE = "[redacted-phone]"


def scrub(text: str) -> str:
    return _PHONE.sub(REDACTED_PHONE, _EMAIL.sub(REDACTED_EMAIL, text))


class PiiScrubbingFilter(logging.Filter):
    """Rewrites each record's final message (after %-formatting) and drops its args."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = scrub(record.getMessage())
        record.args = None
        if record.exc_info:
            # Exception text can carry PII too; render it now and scrub the result.
            record.exc_text = scrub(logging.Formatter().formatException(record.exc_info))
            record.exc_info = None
        return True


def install_pii_filter() -> None:
    """Attach the filter to every root handler (idempotent)."""
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(level=logging.INFO)
    for handler in root.handlers:
        if not any(isinstance(f, PiiScrubbingFilter) for f in handler.filters):
            handler.addFilter(PiiScrubbingFilter())
