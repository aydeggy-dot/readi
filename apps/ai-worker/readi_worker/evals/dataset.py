"""The corpus, read from files: seed rubrics and questions, and the answer sets scored against them.

No database, and deliberately no `ContentService`: `content/seed` is where a question's words come
from until somebody edits it in the CMS, and a harness that needed a migrated Postgres could not run
in CI or from a `workflow_dispatch` job. The cost of that choice is that this parses YAML the
importer
also parses, so a change to the seed format is two edits — which is why this reads only the fields
it
needs and fails loudly on a missing one rather than defaulting.

**A rubric's weights are loaded here and never sent to the model.** The evaluator is given criteria
without weights on purpose (`contracts/evaluations.ts`), but the harness needs them to compute a
weighted score per answer, because that is the number the two separations are measured on — the same
arithmetic `check-stress.mjs` does on the written scores.
"""

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from readi_worker.paths import RepoRootError
from readi_worker.paths import repo_root as _repo_root

#: The five answers of a stress set, in the order the README presents them.
KINDS = ("strong", "weak", "fluent-but-wrong", "correct-poorly-explained", "nigerian-english")

#: The kind whose distance from `strong` is the fairness measurement.
FAIRNESS_KIND = "nigerian-english"

#: A namespace for the ids this harness has to invent. `EvaluationQuestion.topic` needs a uuid and a
#: file has none — the topic reaches no prompt (`evaluate_answer_input.v1.md` renders the question,
#: the criteria, the ideal points and the transcript, and nothing else), so a uuid5 of the slug is a
#: stable stand-in rather than a fact about any row. The same namespace gives each case its session
#: and user id, which exist only so a Langfuse trace can be found again (ADR-0008).
NAMESPACE = uuid.UUID("2f3b8c4e-6a1d-4f2b-9c7e-5d8a1b0c3e47")


def synthetic_id(*parts: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, "/".join(parts))


@dataclass(frozen=True, slots=True)
class Criterion:
    position: int
    dimension: str
    description: str
    #: Share of the rubric's score, 0-100. Used by the harness, never sent to the model.
    weight: int
    levels: dict[str, str]


@dataclass(frozen=True, slots=True)
class Rubric:
    slug: str
    name: str
    criteria: tuple[Criterion, ...]

    @property
    def dimensions(self) -> tuple[str, ...]:
        return tuple(criterion.dimension for criterion in self.criteria)


@dataclass(frozen=True, slots=True)
class Question:
    slug: str
    type: str
    topic_slug: str
    topic_name: str
    prompt: str
    context: str | None
    ideal_points: tuple[str, ...]
    rubric_slug: str
    #: Every catalogue role the question is offered to. Not the directory it lives in — a
    #: behavioural
    #: question written under `content/seed/frontend/` is asked of four roles, and selecting by path
    #: is the mistake `review-doc.ts` made (CLAUDE.md "Learning content").
    roles: tuple[str, ...]
    levels: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Case:
    """One answer to score: which rubric, which kind of answer, and what it was written to score."""

    #: The directory of `evals/datasets/<set>/<role>/` this came from. A grouping for the report,
    #: not
    #: a claim about which role is asked the question — `Question.roles` is that.
    role: str
    rubric: Rubric
    question: Question
    kind: str
    text: str
    #: One expected score per criterion, in the rubric's order. Who wrote them decides what
    #: agreement
    #: with them means — see `Dataset.provenance`.
    expected: tuple[int, ...]
    source: str

    @property
    def id(self) -> str:
        return f"{self.rubric.slug}/{self.kind}"


@dataclass(frozen=True, slots=True)
class Dataset:
    cases: tuple[Case, ...]
    #: `ai_draft` for the synthetic sets, `human` for gold. It decides whether the agreement figures
    #: in a report are a quality measurement or a drift alarm, and the report prints it for that
    #: reason rather than for tidiness.
    provenance: str
    name: str

    def rubrics(self) -> tuple[str, ...]:
        seen = {case.rubric.slug: None for case in self.cases}
        return tuple(seen)


class DatasetError(RuntimeError):
    """The corpus does not say what the harness needs. Always names the file."""


# ---- Reading the seed content.


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise DatasetError(f"{path}: not valid YAML ({exc})") from None
    if not isinstance(loaded, dict):
        raise DatasetError(f"{path}: expected a mapping at the top level")
    return loaded


def seed_roles(seed: Path) -> tuple[str, ...]:
    """The role directories of `content/seed`, which is where a bank's files live.

    `review` and `blueprints` are not roles; neither is a role with no directory (`fullstack` has
    none, and its questions live in the other banks carrying its slug).
    """
    return tuple(
        sorted(
            entry.name
            for entry in seed.iterdir()
            if entry.is_dir() and entry.name not in {"review", "blueprints"}
        )
    )


def load_rubrics(seed: Path) -> dict[str, Rubric]:
    """Every rubric a seed file defines, keyed by slug, from the shared file and each role's."""
    files = [
        seed / "rubrics.shared.yaml",
        *(seed / role / "rubrics.yaml" for role in seed_roles(seed)),
    ]
    rubrics: dict[str, Rubric] = {}
    for path in files:
        if not path.exists():
            continue
        for raw in load_yaml(path).get("rubrics") or []:
            slug = raw["slug"]
            if slug in rubrics:
                raise DatasetError(f"{path}: rubric `{slug}` is defined twice")
            rubrics[slug] = Rubric(
                slug=slug,
                name=raw["name"],
                criteria=tuple(
                    Criterion(
                        position=position,
                        dimension=criterion["dimension"],
                        description=criterion["description"].strip(),
                        weight=int(criterion["weight"]),
                        levels={str(rung): text for rung, text in criterion["levels"].items()},
                    )
                    # `position` is the index in the file, which is what a session's pinned snapshot
                    # and `criteria_block` both use: a rubric has no row ids here.
                    for position, criterion in enumerate(raw["criteria"])
                ),
            )
    if not rubrics:
        raise DatasetError(f"{seed}: no rubrics found — is this the content/seed directory?")
    return rubrics


def load_questions(seed: Path) -> dict[str, Question]:
    """Every question a seed bank defines, keyed by slug."""
    topics = {
        raw["slug"]: raw["name"] for raw in load_yaml(seed / "topics.yaml").get("topics") or []
    }
    questions: dict[str, Question] = {}
    for role in seed_roles(seed):
        path = seed / role / "questions.yaml"
        if not path.exists():
            continue
        for raw in load_yaml(path).get("questions") or []:
            slug = raw["slug"]
            if slug in questions:
                raise DatasetError(f"{path}: question `{slug}` is defined twice")
            topic = raw["topic"]
            if topic not in topics:
                raise DatasetError(
                    f"{path}: question `{slug}` names topic `{topic}`, "
                    "which topics.yaml does not define"
                )
            context = raw.get("context")
            questions[slug] = Question(
                slug=slug,
                type=raw["type"],
                topic_slug=topic,
                topic_name=topics[topic],
                prompt=" ".join(raw["prompt"].split()),
                context=context.rstrip() if context else None,
                ideal_points=tuple(raw.get("ideal_points") or []),
                rubric_slug=raw["rubric"],
                roles=tuple(raw.get("roles") or []),
                levels=tuple(raw.get("levels") or []),
            )
    return questions


# ---- Reading an answer set.


def load_dataset(root: Path, name: str = "synthetic") -> Dataset:
    """Load `evals/datasets/<name>` against the rubrics and questions of `content/seed`.

    Files named `*.template.yaml` are skipped: `gold/` ships a worked example of its own format so a
    reviewer has something to copy, and an example scored by nobody must never be counted.
    """
    seed = root / "content" / "seed"
    rubrics = load_rubrics(seed)
    questions = load_questions(seed)
    directory = root / "evals" / "datasets" / name
    if not directory.exists():
        raise DatasetError(f"{directory}: no such dataset")

    cases: list[Case] = []
    provenances: set[str] = set()
    for path in sorted(_yaml_files(directory)):
        if path.name.endswith(".template.yaml"):
            continue
        raw = load_yaml(path)
        where = path.relative_to(root)
        rubric = rubrics.get(raw.get("rubric", ""))
        if rubric is None:
            raise DatasetError(
                f"{where}: names rubric `{raw.get('rubric')}`, which no seed file defines"
            )
        question = questions.get(raw.get("question", ""))
        if question is None:
            raise DatasetError(
                f"{where}: names question `{raw.get('question')}`, which no seed bank defines"
            )
        provenances.add(str(raw.get("generated_by", "unknown")))
        for answer in raw.get("answers") or []:
            expected = answer.get("expected") or []
            named = [str(item["dimension"]) for item in expected]
            # The same check `check-stress.mjs` makes, for the same reason: a file that scores the
            # dimensions of a rubric that has since been reordered is scoring the wrong criterion,
            # and
            # it must break loudly rather than quietly agree with nothing.
            if named != list(rubric.dimensions):
                raise DatasetError(
                    f"{where} — {answer.get('kind')}: scores [{', '.join(named)}] against a rubric "
                    f"whose criteria are [{', '.join(rubric.dimensions)}]"
                )
            cases.append(
                Case(
                    role=path.parent.name,
                    rubric=rubric,
                    question=question,
                    kind=str(answer["kind"]),
                    text=answer["text"].strip(),
                    expected=tuple(int(item["score"]) for item in expected),
                    source=str(where),
                )
            )
    if not cases:
        raise DatasetError(f"{directory}: no answers found")
    return Dataset(
        cases=tuple(cases),
        # One value, or the word that says the set is mixed — which would itself be a finding,
        # because
        # a set holding both model-written and human scores cannot be reported as either.
        provenance=provenances.pop() if len(provenances) == 1 else "mixed",
        name=name,
    )


def _yaml_files(directory: Path) -> Iterator[Path]:
    for child in sorted(directory.iterdir()):
        if child.is_dir():
            yield from _yaml_files(child)
        elif child.suffix == ".yaml":
            yield child


def repo_root(start: Path | None = None) -> Path:
    """The repository root, as a `DatasetError` when there is none.

    The walk itself is `readi_worker.paths`, shared with the speech glossary since M5 phase 1: two
    copies of "where is the repository root" drift the moment one of them learns about a new layout.
    This wrapper exists only so that a harness run keeps failing with the harness's own error type.
    """
    try:
        return _repo_root(start or Path(__file__))
    except RepoRootError as exc:
        raise DatasetError(str(exc)) from None
