import io
import logging

import pytest

from readi_worker.logging_config import (
    REDACTED_EMAIL,
    REDACTED_PHONE,
    PiiScrubbingFilter,
    install_pii_filter,
    scrub,
)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("user amaka.o+cv@example.com.ng", f"user {REDACTED_EMAIL}"),
        ("to +2348031234567", f"to {REDACTED_PHONE}"),
        ("to 2348031234567", f"to {REDACTED_PHONE}"),
        ("call 08031234567", f"call {REDACTED_PHONE}"),
        ("id 8d3f9c2e-4b1a-4c7e-9f00-123456789012 at 1758284400000", None),
    ],
)
def test_scrub(text: str, expected: str | None) -> None:
    assert scrub(text) == (expected if expected is not None else text)


def test_filter_redacts_formatted_messages_and_exceptions() -> None:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.addFilter(PiiScrubbingFilter())
    logger = logging.getLogger("readi.test.scrub")
    logger.addHandler(handler)
    logger.propagate = False
    try:
        logger.warning("sent to %s", "+2348031234567")
        try:
            raise ValueError("bad email a@b.co")
        except ValueError:
            logger.exception("failed for %s", "a@b.co")
    finally:
        logger.removeHandler(handler)

    text = stream.getvalue()
    assert "+2348031234567" not in text
    assert "a@b.co" not in text
    assert REDACTED_PHONE in text
    assert REDACTED_EMAIL in text


def test_install_is_idempotent() -> None:
    install_pii_filter()
    install_pii_filter()
    for handler in logging.getLogger().handlers:
        assert sum(isinstance(f, PiiScrubbingFilter) for f in handler.filters) == 1
