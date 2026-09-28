"""The corpus loads, and it breaks loudly rather than quietly when it does not.

These run against the **real** `content/seed` and `evals/datasets/synthetic`, not a fixture. That is
deliberate: the thing worth knowing is whether the harness can still read the corpus as it stands
today, and a fixture would keep passing after a seed-format change that broke every real file.
"""

from pathlib import Path

import pytest
import yaml

from readi_worker.evals.dataset import (
    KINDS,
    DatasetError,
    load_dataset,
    load_questions,
    load_rubrics,
    repo_root,
    seed_roles,
)
from readi_worker.evals.requests import evaluation_request

ROOT = repo_root()


def test_the_whole_synthetic_corpus_loads() -> None:
    dataset = load_dataset(ROOT)
    assert len(dataset.rubrics()) == len(dataset.cases) / len(KINDS)
    # Model-written expectations. A run that reported agreement with these as a quality figure would
    # be measuring the drafter agreeing with itself, which is what `provenance` exists to prevent.
    assert dataset.provenance == "ai_draft"
    assert {case.kind for case in dataset.cases} == set(KINDS)


def test_every_answer_set_has_all_five_kinds() -> None:
    dataset = load_dataset(ROOT)
    by_rubric: dict[str, list[str]] = {}
    for case in dataset.cases:
        by_rubric.setdefault(case.rubric.slug, []).append(case.kind)
    incomplete = {rubric: kinds for rubric, kinds in by_rubric.items() if set(kinds) != set(KINDS)}
    assert incomplete == {}, "a rubric missing a kind makes its separations unmeasurable"


def test_every_case_becomes_a_valid_request() -> None:
    """The contract is the gate. A case the worker would reject with a 422 is a case not
    measured."""
    for case in load_dataset(ROOT).cases:
        request = evaluation_request(case)
        assert len(request.question.rubric.criteria) == len(case.expected)
        assert request.exchange[-1].speaker == "candidate"
        # Every criterion is presented as asked about, which is what the expectations assume.
        assert all(criterion.asked_about for criterion in request.question.rubric.criteria)


def test_seed_roles_excludes_the_directories_that_are_not_roles() -> None:
    roles = seed_roles(ROOT / "content" / "seed")
    assert "review" not in roles
    assert "blueprints" not in roles
    assert "frontend" in roles


def test_a_rubric_and_a_question_are_found_for_every_seed_bank() -> None:
    seed = ROOT / "content" / "seed"
    rubrics, questions = load_rubrics(seed), load_questions(seed)
    for question in questions.values():
        assert question.rubric_slug in rubrics, f"{question.slug} names a rubric nothing defines"


def test_a_reordered_rubric_breaks_the_load(tmp_path: Path) -> None:
    """The check that stops a file silently scoring the wrong criterion (`check-stress.mjs`'s)."""
    root = _corpus(tmp_path, dimensions=["Second", "First"])
    with pytest.raises(DatasetError, match="against a rubric whose criteria are"):
        load_dataset(root)


def test_an_unknown_rubric_names_the_file(tmp_path: Path) -> None:
    root = _corpus(tmp_path, rubric_slug="not-a-rubric")
    with pytest.raises(DatasetError, match="which no seed file defines"):
        load_dataset(root)


def test_a_template_file_is_never_counted(tmp_path: Path) -> None:
    """`gold/` ships an example of its own format. An example scored by nobody is not data."""
    root = _corpus(tmp_path)
    example = root / "evals" / "datasets" / "synthetic" / "frontend" / "example.template.yaml"
    example.write_text(example.parent.joinpath("thing.yaml").read_text(), encoding="utf-8")
    assert len(load_dataset(root).cases) == 1


# ---- A minimal corpus on disk, for the cases that have to be malformed.


def _corpus(
    tmp_path: Path,
    *,
    dimensions: list[str] | None = None,
    rubric_slug: str = "thing",
) -> Path:
    named = dimensions or ["First", "Second"]
    seed = tmp_path / "content" / "seed"
    (seed / "frontend").mkdir(parents=True)
    _write(
        seed / "topics.yaml",
        {"topics": [{"slug": "javascript-fundamentals", "name": "JavaScript"}]},
    )
    _write(
        seed / "frontend" / "rubrics.yaml",
        {
            "rubrics": [
                {
                    "slug": "thing",
                    "name": "A thing",
                    "criteria": [
                        {
                            "dimension": name,
                            "description": "What it scores.",
                            "weight": 50,
                            "levels": {str(rung): f"rung {rung}" for rung in range(5)},
                        }
                        for name in ["First", "Second"]
                    ],
                }
            ]
        },
    )
    _write(
        seed / "frontend" / "questions.yaml",
        {
            "questions": [
                {
                    "slug": "a-question",
                    "roles": ["frontend"],
                    "levels": ["mid"],
                    "type": "technical",
                    "topic": "javascript-fundamentals",
                    "prompt": "Why?",
                    "rubric": "thing",
                    "ideal_points": ["Because."],
                }
            ]
        },
    )
    answers = tmp_path / "evals" / "datasets" / "synthetic" / "frontend"
    answers.mkdir(parents=True)
    _write(
        answers / "thing.yaml",
        {
            "generated_by": "ai_draft",
            "role": "frontend",
            "rubric": rubric_slug,
            "question": "a-question",
            "answers": [
                {
                    "kind": "strong",
                    "text": "Because the main thread was busy.",
                    "expected": [
                        {"dimension": name, "score": 3, "because": "it does"} for name in named
                    ],
                }
            ],
        },
    )
    return tmp_path


def _write(path: Path, data: dict[str, object]) -> None:
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
