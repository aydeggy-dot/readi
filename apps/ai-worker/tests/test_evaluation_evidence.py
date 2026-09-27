"""Evidence verification: does this quote belong to the candidate, and is the check fair?

Two things are being tested and they pull in opposite directions, which is the whole difficulty:

- **Fair.** A candidate writing Nigerian English, Pidgin, or English without punctuation must not
  lose the evidence for their own mark because a model tidied the quote on the way out. Those cases
  are first, and they are the reason this file is longer than the function it tests.
- **Strict.** A quote the candidate never said must not verify, or the citation means nothing, and
  the strongest code-level defence against prompt injection goes with it.

The line between them is: **spelling, punctuation and small tidying, yes; different words, no.**
"""

import json
from pathlib import Path
from typing import Any

import pytest

from readi_worker.evaluation.evidence import (
    MIN_QUOTE_CHARS,
    evidence_rule_violations,
    is_quoted,
    normalise,
    quote_coverage,
)

# ---- Fair to how a candidate actually writes.

#: Written as escapes and named, because a keyboard's apostrophe and a word processor's are
#: different characters, and this file is about that difference. Ruff flags the literals.
CURLY = "\u2019"
NBSP = "\u00a0"

PIDGIN = (
    "So wetin I go do first, I go check the logs, because the logs dey tell you wetin happen. "
    "Then I go run the test wey dem write for that endpoint, but dem no dey run am before dem push"
)

FAIR_CASES = [
    ("exactly as written", "I go check the logs"),
    ("a longer verbatim run", "dem no dey run am before dem push"),
    ("punctuation the model added", "I go check the logs, because the logs dey tell you."),
    (
        "punctuation the candidate left out",
        "Then I go run the test wey dem write for that endpoint",
    ),
    ("capitalisation changed", "SO WETIN I GO DO FIRST, I GO CHECK THE LOGS"),
    ("a curly apostrophe against a straight one", "dem no dey run am before dem push" + CURLY),
    ("a plural the model tidied", "I go run the tests wey dem write for that endpoint"),
    ("one corrected typo", "dem no dey run em before dem push"),
    ("a filler dropped from the middle", "I go check the logs because the logs dey tell you"),
]


@pytest.mark.parametrize(("name", "quote"), FAIR_CASES, ids=[case[0] for case in FAIR_CASES])
def test_a_candidates_own_words_verify_however_they_are_written(name: str, quote: str) -> None:
    assert is_quoted(quote, PIDGIN), f"{name}: coverage was {quote_coverage(quote, PIDGIN):.2f}"


def test_the_same_substance_in_two_registers_is_treated_identically() -> None:
    """The fairness claim in one assertion: two candidates, the same knowledge, the same outcome."""
    standard = "First I would check the logs, because the logs tell you what happened."
    pidgin = "First I go check the logs, because the logs dey tell you wetin happen."
    assert is_quoted("I would check the logs", standard)
    assert is_quoted("I go check the logs", pidgin)
    # And neither is verified against the other, because they are different words.
    assert not is_quoted("I would check the logs", pidgin)


def test_normalise_keeps_the_words_and_drops_everything_else() -> None:
    assert normalise("  Dem  NO dey—run am, abi? ") == "dem no dey run am abi"
    # NFKC first, so a curly apostrophe and a non-breaking space are ordinary characters by the
    # time punctuation is stripped.
    assert normalise(f"it{CURLY}s{NBSP}fine") == "it s fine"


# ---- Strict about what was never said.

UNFAIR_CASES = [
    ("a translation into standard English", "They do not run the tests before they push"),
    ("a plausible fabrication", "I would read the execution plan for the slowest query"),
    ("words gathered from all over the answer", "check the test endpoint push logs"),
    ("a quote too short to mean anything", "the logs"),
    ("the model's own summary", "The candidate demonstrated a systematic approach"),
]


@pytest.mark.parametrize(("name", "quote"), UNFAIR_CASES, ids=[case[0] for case in UNFAIR_CASES])
def test_words_the_candidate_never_said_do_not_verify(name: str, quote: str) -> None:
    assert not is_quoted(quote, PIDGIN), f"{name}: coverage was {quote_coverage(quote, PIDGIN):.2f}"


def test_a_short_fragment_cannot_be_evidence_even_when_it_is_really_there() -> None:
    """It is in the answer twice and still proves nothing about what the candidate knows."""
    assert "the logs" in PIDGIN
    assert len("the logs") < MIN_QUOTE_CHARS
    assert quote_coverage("the logs", PIDGIN) == 0.0


def test_an_empty_answer_verifies_nothing() -> None:
    assert not is_quoted("I go check the logs", "")


# ---- The rule that exists in two languages (ADR-0003 decision 5).

CASES_FILE = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "shared-types"
    / "src"
    / "evidence-cases.json"
)


class _Criterion:
    """The shape the rule reads, as the model's own reading presents it."""

    def __init__(self, criterion: int, score: int, evidence: list[str]) -> None:
        self.criterion = criterion
        self.score = score
        self.evidence = evidence


def _cases() -> list[dict[str, Any]]:
    payload: dict[str, Any] = json.loads(CASES_FILE.read_text(encoding="utf-8"))
    cases: list[dict[str, Any]] = payload["cases"]
    return cases


def test_the_shared_case_file_is_where_it_is_expected_to_be() -> None:
    """A missing file must fail loudly here, not silently reduce this to zero test cases."""
    assert CASES_FILE.is_file(), CASES_FILE
    assert len(_cases()) >= 6
    assert any(case["expected"] for case in _cases())
    assert any(not case["expected"] for case in _cases())


@pytest.mark.parametrize("case", _cases(), ids=[case["name"] for case in _cases()])
def test_the_evidence_rule_agrees_with_typescript(case: dict[str, Any]) -> None:
    """Same file, same verdicts. `evaluations.test.ts` runs these cases against the other twin."""
    criteria = [
        _Criterion(entry["criterion"], entry["score"], entry["evidence"])
        for entry in case["criteria"]
    ]
    assert [v.criterion for v in evidence_rule_violations(criteria)] == case["expected"]


def test_the_violation_names_the_criterion_so_a_retry_can_say_what_to_fix() -> None:
    violations = evidence_rule_violations([_Criterion(2, 3, [])])
    assert "criterion 2" in violations[0].message
    assert "3" in violations[0].message
