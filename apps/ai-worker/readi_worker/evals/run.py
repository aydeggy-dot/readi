"""The eval harness: `uv run python -m readi_worker.evals.run`.

    --dry-run                     the sample and what it will cost, without scoring anything
    --smoke                       the stand-in evaluator, two rubrics, no key, no cost (runs in CI)
    --sample 12 --seed 7          twelve rubrics, stratified by role, question type and level
    --all                         every rubric in the dataset
    --model claude-sonnet-5       which model to score with
    --compare a.json b.json       two finished runs, read back and compared
    --retry-unscored run.json     only the answers that run could not score, merged back into it
    --strict-criteria             the per-rubric schema that cannot omit or invent one (unmeasured)

It does not load `Settings`, and that is deliberate: the server's configuration wants Redis and a
service token, and a harness that could not run without a provisioned environment file could not run
in CI. What it needs is a provider, a model and (for a paid run) `ANTHROPIC_API_KEY` in the
environment.

Tracing is off. Every call goes through the same `EvaluationService` the worker serves, with a
`NullTracer`: sixty traces of model-written answers would cost a Langfuse quota and tell nobody
anything, and the run writes a far more useful record of itself to disk.

**Sequential by default**, and the concurrency flag exists mainly to be left alone. Calls share a
cached system prompt, and a cache entry can only be read once the request that wrote it has
answered — so `--concurrency 4` turns the first four reads into four writes and costs more.
"""

import argparse
import asyncio
import logging
import os
import random
import sys
import time
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from readi_worker.contracts import EvaluateAnswerResponse
from readi_worker.cv.parse import keyword_extraction
from readi_worker.evals.dataset import (
    KINDS,
    Case,
    Dataset,
    DatasetError,
    load_dataset,
    load_yaml,
    repo_root,
)
from readi_worker.evals.metrics import AgreementThresholds, run_metrics
from readi_worker.evals.report import render_comparison, render_run
from readi_worker.evals.requests import evaluation_request
from readi_worker.evals.results import CaseResult, RunResult, Usage, compare, merge_retry
from readi_worker.evaluation.calls import CACHE_SYSTEM_PROMPT, Evaluator
from readi_worker.evaluation.fake_script import FakeEvaluatorLLMClient
from readi_worker.evaluation.service import EvaluationService, render_prompts
from readi_worker.llm.anthropic_client import MIN_CACHEABLE_PREFIX_TOKENS, AnthropicLLMClient
from readi_worker.llm.base import LLMClient
from readi_worker.llm.fake import FunctionLLMClient
from readi_worker.llm.pricing import TOKEN_PRICES, has_price
from readi_worker.tracing import NullTracer

#: Output tokens per evaluator call, from the first paid evaluation run (2026-09-27: 4,999 output
#: tokens over five calls). An estimate, and named as one — the input side of a dry run is counted
#: exactly, because `messages.count_tokens` is free, and there is no free way to know in advance how
#: much a model will write.
ESTIMATED_OUTPUT_TOKENS = 1_000

#: One call in five of that same run was a reading code threw away — the gates working, and money
#: spent. Any estimate that leaves it out will be beaten by the bill.
REJECTION_ALLOWANCE = 0.2

#: How many rubrics a run scores unless told otherwise. Twelve is sixty answers, which is the sample
#: size the owner approved for the paid comparison (M4 decision 9).
DEFAULT_SAMPLE = 12


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    _show_worker_logs()
    root = repo_root()
    if args.compare:
        return _compare(args.compare)
    try:
        dataset = load_dataset(root, args.dataset)
    except DatasetError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    try:
        return _execute(root, dataset, args)
    except DatasetError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


def _show_worker_logs() -> None:
    """Let the worker's own INFO lines reach stderr for the length of a run.

    A CLI configures no logging, so the root logger sits at WARNING and drops everything the
    evaluation service says about itself. That is how the 2026-09-28 v3 check measured 17 rejected
    readings and could not say what any of them was: `_Checked.detail` carries
    `expected 0, 1, 2; got 1, 2, 3` into a `logger.info` that nothing was listening to. Scoped to
    `readi_worker`, so a library's debug chatter stays out of a watched run.
    """
    worker = logging.getLogger("readi_worker")
    worker.setLevel(logging.INFO)
    worker.propagate = False
    # Once. `main()` is called several times in one process by the tests, and a handler added per
    # call would print each line as many times as the harness had been run.
    if any(getattr(handler, "_readi_evals", False) for handler in worker.handlers):
        return
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(message)s"))
    handler._readi_evals = True  # type: ignore[attr-defined]
    worker.addHandler(handler)


def load_thresholds(root: Path) -> AgreementThresholds:
    """`evals/thresholds.yaml` — the agreement numbers, in a file because nobody knows them yet.

    Read strictly: a missing key is a threshold somebody meant to write and did not, and a default
    quietly supplied here would be a threshold nothing can fail. Only the agreement figures are in
    that file; the separation margin and the fairness band live in `metrics.py` beside the code that
    applies them, and match `check-stress.mjs`.
    """
    raw = load_yaml(root / "evals" / "thresholds.yaml").get("agreement") or {}
    try:
        return AgreementThresholds(
            enforce_on_provenance=str(raw["enforce_on_provenance"]),
            min_exact=float(raw["min_exact"]),
            min_within_one=float(raw["min_within_one"]),
            max_mae=float(raw["max_mae"]),
            max_absolute_bias=float(raw["max_absolute_bias"]),
        )
    except KeyError as exc:
        raise DatasetError(f"evals/thresholds.yaml: `agreement` has no {exc}") from None


# ---- Choosing what to score.


def stratified_sample(dataset: Dataset, count: int, seed: int) -> tuple[str, ...]:
    """`count` rubric slugs, spread as evenly as the corpus allows. Deterministic in `seed`.

    A sample has to be whole rubrics rather than loose answers: the fairness band and both
    separations compare one rubric's five answers with each other, and a sample of 60 answers picked
    individually would measure none of them. Strata are role, question type and level, because those
    are the axes a reading could plausibly be worse on — a scenario question for a mid-level backend
    candidate is a different job from a behavioural one for an intern.
    """
    by_rubric: dict[str, Case] = {}
    for case in dataset.cases:
        by_rubric.setdefault(case.rubric.slug, case)
    strata: dict[tuple[str, str, str], list[str]] = {}
    for slug, case in by_rubric.items():
        levels = case.question.levels
        key = (case.role, case.question.type, levels[0] if levels else "any")
        strata.setdefault(key, []).append(slug)
    shuffler = random.Random(seed)  # noqa: S311 — sampling a corpus, not making a secret
    queues = []
    for key in sorted(strata):
        members = sorted(strata[key])
        shuffler.shuffle(members)
        queues.append(members)
    # Round-robin, so a stratum with four rubrics does not out-vote one with forty.
    chosen: list[str] = []
    while len(chosen) < count and any(queues):
        for queue in queues:
            if not queue:
                continue
            chosen.append(queue.pop())
            if len(chosen) == count:
                break
        queues = [queue for queue in queues if queue]
    return tuple(sorted(chosen))


def _retry_selection(
    dataset: Dataset, previous: RunResult, model: str, *, strict_criteria: bool
) -> list[Case]:
    """Exactly the answers `previous` has no score for, in its own order.

    Refused rather than merged when the model or the dataset differs: a file holding one model's
    readings of some answers and another's of the rest would be a lie in a place nothing downstream
    could detect, and `--compare` would read it as one model.

    `--strict-criteria` is refused for the same reason and is the sharper case. The merged file
    carries **one** flag, and `merge_retry` takes the retry's — so a strict retry of a plain run
    would produce a file reading `strict_criteria: true` over a majority of answers scored without
    it, and the rejection rate that file reports is the one figure the flag exists to be read
    against.
    """
    if previous.model != model:
        raise DatasetError(
            f"that run is `{previous.model}` and this one would be `{model}` — retry with "
            f"`--model {previous.model}`, or start a fresh run"
        )
    if previous.strict_criteria != strict_criteria:
        was, now = _strict_words(previous.strict_criteria), _strict_words(strict_criteria)
        raise DatasetError(
            f"that run scored with the strict criteria schema {was} and this one would score "
            f"{now} — retry with the same setting, or start a fresh run"
        )
    if previous.dataset != dataset.name:
        raise DatasetError(
            f"that run is over `{previous.dataset}` and this one is over `{dataset.name}`"
        )
    wanted = dict.fromkeys(previous.unscored())
    if not wanted:
        raise DatasetError("that run scored every answer; there is nothing to retry")
    by_key = {(case.rubric.slug, case.kind): case for case in dataset.cases}
    missing = [key for key in wanted if key not in by_key]
    if missing:
        raise DatasetError(
            "the dataset no longer holds "
            + ", ".join(f"`{rubric}/{kind}`" for rubric, kind in missing[:5])
        )
    return [by_key[key] for key in wanted]


def _strict_words(strict: bool) -> str:
    return "on" if strict else "off"


def _select(dataset: Dataset, args: argparse.Namespace) -> list[Case]:
    cases = [case for case in dataset.cases if not args.role or case.role == args.role]
    if not cases:
        raise DatasetError(f"no cases for role `{args.role}` in `{dataset.name}`")
    if args.all:
        chosen = tuple(dict.fromkeys(case.rubric.slug for case in cases))
    else:
        chosen = stratified_sample(
            Dataset(cases=tuple(cases), provenance=dataset.provenance, name=dataset.name),
            args.sample,
            args.seed,
        )
    order = {slug: index for index, slug in enumerate(chosen)}
    kinds = {kind: index for index, kind in enumerate(KINDS)}
    selected = [case for case in cases if case.rubric.slug in order]
    # Rubric by rubric, and in the README's order within each, so a watched run reads as five
    # answers to one question rather than as sixty unrelated ones.
    selected.sort(key=lambda case: (order[case.rubric.slug], kinds.get(case.kind, 99)))
    return selected


# ---- Running.


def _build_client(provider: str, timeout_s: float) -> LLMClient:
    if provider == "fake":
        # The evaluator's stand-in, with the CV keyword extractor behind it as `main.py` arranges —
        # it answers this call shape and nothing else ever reaches the fallback here.
        return FakeEvaluatorLLMClient(FunctionLLMClient(keyword_extraction))
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise DatasetError(
            "ANTHROPIC_API_KEY is not set. Use --provider fake (or --smoke) to run without a key."
        )
    return AnthropicLLMClient(key, timeout_s=timeout_s)


def _execute(root: Path, dataset: Dataset, args: argparse.Namespace) -> int:
    """Choose the sample, run it, write it, report it, and decide the exit code.

    The event loop wraps only the part that makes calls. Everything that touches the disk is out
    here, where blocking on it is what it looks like.
    """
    if args.smoke:
        args.provider, args.model, args.sample = "fake", "fake", min(args.sample, 2)
    previous: RunResult | None = None
    if args.retry_unscored:
        # Read and checked **before** anything is scored: a mismatch discovered afterwards has
        # already been paid for.
        previous = RunResult.read(Path(args.retry_unscored))
        cases = _retry_selection(
            dataset, previous, args.model, strict_criteria=bool(args.strict_criteria)
        )
        print(
            f"retrying {len(cases)} unscored answer(s) from {Path(args.retry_unscored).name}",
            file=sys.stderr,
        )
    else:
        cases = _select(dataset, args)
    criteria = {case.rubric.slug: case.rubric.criteria for case in cases}

    if args.dry_run:
        return asyncio.run(_dry_run(cases, args))

    # The path is settled before anything is scored, because the run writes to it as it goes.
    out = (
        Path(args.out) if args.out else root / "evals" / "results" / f"{_stamp()}-{args.model}.json"
    )
    result = asyncio.run(_score_all(cases, dataset, args, out))
    if previous is not None:
        result = merge_retry(previous, result, source=Path(args.retry_unscored).name)
        # The merged run holds answers this process never scored, so the rubrics it is measured
        # against are the merged file's, not this run's.
        merged = {case.rubric for case in result.cases}
        criteria = {
            case.rubric.slug: case.rubric.criteria
            for case in dataset.cases
            if case.rubric.slug in merged
        }
    result.write(out)
    report = render_run(result, criteria)
    print(report)
    if args.report:
        Path(args.report).write_text(report, encoding="utf-8")
    print(f"wrote {out}", file=sys.stderr)

    if args.smoke:
        return _smoke_verdict(result)

    metrics = run_metrics(result.scored(), criteria)
    problems = list(metrics.problems)
    # Agreement is only allowed to fail a run over a dataset a **person** scored. Against
    # model-written expectations it measures the drafter agreeing with itself, so the thresholds are
    # printed in the report and enforced nowhere.
    thresholds = load_thresholds(root)
    if thresholds.applies_to(result.provenance):
        problems += thresholds.problems(metrics.against_expected)
    if problems:
        print(f"\n{len(problems)} problem(s), fairness first:", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        return 1
    return 0


async def _score_all(
    cases: Sequence[Case], dataset: Dataset, args: argparse.Namespace, out: Path
) -> RunResult:
    """Every case, scored through the same service the worker serves. The only part that spends.

    **It writes the file after every answer.** A run can be stopped — by a spending cap, by a
    provider outage, by a laptop lid — and the first version wrote only at the end, so the v3 check
    of 2026-09-28 was killed at its cap and left nothing but stderr: the rejection rate it had
    measured had to be reconstructed from cache-read counts in the log, and the per-call causes were
    gone. A partial file names what it set out to score, so `--retry-unscored` finishes it.
    """
    client = _build_client(args.provider, args.timeout)
    service = EvaluationService(
        Evaluator(client, args.model, args.timeout, strict_criteria=args.strict_criteria),
        NullTracer(),
    )
    started = _now()
    prompt_versions: dict[str, int] = {}
    semaphore = asyncio.Semaphore(max(1, args.concurrency))
    done = 0
    results: list[CaseResult] = []

    def snapshot() -> RunResult:
        return RunResult(
            label=args.label or f"{args.model}-{dataset.name}",
            dataset=dataset.name,
            provenance=dataset.provenance,
            provider=args.provider,
            model=args.model,
            started_at=started,
            finished_at=_now(),
            cache_system=CACHE_SYSTEM_PROMPT and args.provider != "fake",
            strict_criteria=bool(args.strict_criteria),
            prompt_versions=prompt_versions,
            planned=[f"{case.rubric.slug}/{case.kind}" for case in cases],
            cases=list(results),
        )

    async def score(index: int, case: Case) -> CaseResult:
        nonlocal done
        async with semaphore:
            began = time.perf_counter()
            response = await service.evaluate(evaluation_request(case, position=index))
            done += 1
            result = _case_result(case, response)
            print(
                f"[{done:>3}/{len(cases)}] {case.rubric.slug}/{case.kind:<24} "
                f"{_scores(result)}  {time.perf_counter() - began:5.1f}s  "
                f"{result.usage.cost_micro_usd / 10_000:5.2f}c  "
                f"cache w{result.usage.cache_write_tokens} r{result.usage.cache_read_tokens}"
                + (f"  [{result.error}]" if result.error else ""),
                file=sys.stderr,
                flush=True,
            )
            prompt_versions.update(
                {name: version.root for name, version in response.prompt_versions.items()}
            )
            results.append(result)
            # After every answer, not at the end: what has been paid for is on disk before the next
            # call is made.
            snapshot().write(out)
            return result

    if args.concurrency == 1:
        for index, case in enumerate(cases):
            await score(index, case)
    else:
        await asyncio.gather(*(score(index, case) for index, case in enumerate(cases)))

    if isinstance(client, AnthropicLLMClient):
        await client.aclose()

    return snapshot()


def _case_result(case: Case, response: EvaluateAnswerResponse) -> CaseResult:
    read = response.evaluation.criteria if response.evaluation else []
    by_position = {score.criterion: score for score in read}
    usage = Usage(
        calls=len(response.ai_calls),
        rejected=sum(
            1
            for call in response.ai_calls
            if call.error_code and call.error_code.root.startswith("rejected_")
        ),
        failed=1 if response.evaluation is None else 0,
        input_tokens=sum(call.input_units for call in response.ai_calls),
        output_tokens=sum(call.output_units for call in response.ai_calls),
        cache_write_tokens=sum(call.cache_write_units for call in response.ai_calls),
        cache_read_tokens=sum(call.cache_read_units for call in response.ai_calls),
        cost_micro_usd=sum(call.cost_micro_usd for call in response.ai_calls),
        latency_ms=sum(call.latency_ms for call in response.ai_calls),
    )
    return CaseResult(
        rubric=case.rubric.slug,
        role=case.role,
        kind=case.kind,
        question=case.question.slug,
        scores=[
            by_position[criterion.position].score if criterion.position in by_position else None
            for criterion in case.rubric.criteria
        ],
        expected=list(case.expected),
        evidence=[
            len(by_position[criterion.position].evidence)
            if criterion.position in by_position
            else 0
            for criterion in case.rubric.criteria
        ],
        error=response.error,
        confidence=response.evaluation.confidence if response.evaluation else None,
        evidence_flags=[flag.root for flag in response.evidence_flags],
        # Which gate refused the reading, not merely that one did. The count alone cannot say
        # whether a third of the bill has a single fixable cause.
        call_errors=[call.error_code.root for call in response.ai_calls if call.error_code],
        usage=usage,
    )


# ---- What it will cost, before anything is spent.


async def _dry_run(cases: Sequence[Case], args: argparse.Namespace) -> int:
    """The sample and its price. Input tokens are **counted** where a key allows it."""
    rubrics = tuple(dict.fromkeys(case.rubric.slug for case in cases))
    print(f"{len(cases)} answers over {len(rubrics)} rubrics")
    for slug in rubrics:
        first = next(case for case in cases if case.rubric.slug == slug)
        kinds = [case.kind for case in cases if case.rubric.slug == slug]
        print(
            f"  {slug:<38} {first.role:<9} {first.question.type:<11} "
            f"{','.join(first.question.levels) or 'any':<18} {len(kinds)} answers"
        )

    prompts = [render_prompts(evaluation_request(case)) for case in cases]
    system_chars = len(prompts[0][0])
    counted: list[int] | None = None
    if args.count_tokens and args.provider != "fake" and os.environ.get("ANTHROPIC_API_KEY"):
        client = _build_client(args.provider, args.timeout)
        assert isinstance(client, AnthropicLLMClient)  # noqa: S101 — narrowing, not a check
        print("counting input tokens (free)…", file=sys.stderr)
        counted = [
            await client.count_input_tokens(model=args.model, system=system, user=user)
            for system, user in prompts
        ]
        prefix = await client.count_input_tokens(model=args.model, system=prompts[0][0], user="x")
        await client.aclose()
    else:
        prefix = round(system_chars / 3.7)

    print(
        f"\nsystem prompt: {system_chars:,} chars, ~{prefix:,} tokens{_prefix_note(args, prefix)}"
    )
    for model in _models_to_price(args):
        _print_estimate(model, prompts, counted, prefix, len(cases))
    print(
        "\nOutput tokens are the one estimate here "
        f"({ESTIMATED_OUTPUT_TOKENS:,} per call, from the first paid run's measured average); the "
        "input side is counted where a key allows it. `worst case` adds a "
        f"{REJECTION_ALLOWANCE:.0%} retry allowance, the rejected-reading rate that same run saw."
    )
    return 0


def _prefix_note(args: argparse.Namespace, prefix: int) -> str:
    minimum = MIN_CACHEABLE_PREFIX_TOKENS.get(args.model)
    if minimum is None:
        return ""
    if prefix > minimum:
        return f" — above {args.model}'s {minimum:,}-token minimum, so it caches"
    return f" — BELOW {args.model}'s {minimum:,}-token minimum: it will NOT cache"


def _models_to_price(args: argparse.Namespace) -> tuple[str, ...]:
    if args.model != "fake":
        return (args.model,)
    return tuple(model for provider, model in TOKEN_PRICES if provider == "anthropic")


def _print_estimate(
    model: str,
    prompts: Sequence[tuple[str, str]],
    counted: Sequence[int] | None,
    prefix: int,
    calls: int,
) -> None:
    if not has_price("anthropic", model):
        print(f"\n{model}: no price configured")
        return
    input_price, output_price = TOKEN_PRICES[("anthropic", model)]
    total_input = (
        sum(counted)
        if counted is not None
        else round(sum(len(system) + len(user) for system, user in prompts) / 3.7)
    )
    output = calls * ESTIMATED_OUTPUT_TOKENS
    uncached = (total_input * input_price + output * output_price) / 1_000_000
    # One write and the rest reads, which is what a sequential run does: the prefix leaves the
    # full-price total once per later call, comes back at 1.25x once and at 0.1x for each of them.
    cached_input = total_input - prefix * (calls - 1) + prefix * 0.25 + prefix * 0.1 * (calls - 1)
    cached = (cached_input * input_price + output * output_price) / 1_000_000
    print(
        f"\n{model}: {total_input:,} input tokens"
        f"{'' if counted is not None else ' (estimated at 3.7 chars/token)'}"
        f" + ~{output:,} output"
        f"\n  no caching          ${uncached / 1_000_000:.2f}"
        f"\n  cached, sequential  ${cached / 1_000_000:.2f}"
        f"  ({(1 - cached / uncached) * 100:.0f}% less)"
        f"\n  worst case          ${cached * (1 + REJECTION_ALLOWANCE) / 1_000_000:.2f}"
    )


# ---- Reading two finished runs.


def _compare(paths: Sequence[str]) -> int:
    if len(paths) != 2:
        print("error: --compare takes exactly two result files", file=sys.stderr)
        return 2
    left, right = (RunResult.read(Path(path)) for path in paths)
    print(render_comparison(compare(left, right), left, right))
    return 0


# ---- The smoke run's own verdict.


def _smoke_verdict(result: RunResult) -> int:
    """What `--smoke` checks, and what it deliberately does not.

    It checks the **machinery**: every answer came back scored, one score per criterion, every
    non-zero criterion carries a verified quote, and nothing cost anything. It does **not** check
    the fairness band or the two separations, because the stand-in evaluator scores on whether the
    "because" appears (`evaluation/fake_script.py`) — asserting a separation against it would be a
    test of a coin toss, and the kind of green tick that makes a harness worse than none.
    """
    problems: list[str] = []
    for case in result.cases:
        if case.error is not None:
            problems.append(f"{case.rubric}/{case.kind}: {case.error}")
        if any(score is None for score in case.scores):
            problems.append(f"{case.rubric}/{case.kind}: a criterion with no score")
        if case.evidence_violations():
            problems.append(
                f"{case.rubric}/{case.kind}: a non-zero criterion with no verified quote (§6.2)"
            )
    if result.usage.cost_micro_usd:
        problems.append(f"the stand-in evaluator billed {result.usage.cost_micro_usd} micro-USD")
    for problem in problems:
        print(f"  smoke: {problem}", file=sys.stderr)
    return 1 if problems else 0


# ---- Plumbing.


def _scores(result: CaseResult) -> str:
    return "/".join("-" if score is None else str(score) for score in result.scores).ljust(9)


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m readi_worker.evals.run",
        description="Score the answer sets with the real evaluator and report fairness, the two "
        "separations, agreement and cost.",
    )
    parser.add_argument("--dataset", default="synthetic", help="evals/datasets/<name>")
    parser.add_argument("--role", default=None, help="only this role's answer sets")
    parser.add_argument("--sample", type=int, default=DEFAULT_SAMPLE, help="how many rubrics")
    parser.add_argument("--all", action="store_true", help="every rubric in the dataset")
    parser.add_argument("--seed", type=int, default=7, help="the sample is deterministic in this")
    parser.add_argument("--provider", default="anthropic", choices=("anthropic", "fake"))
    parser.add_argument("--model", default="claude-opus-5")
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument(
        "--concurrency", type=int, default=1, help="leave this at 1; see the module"
    )
    parser.add_argument("--dry-run", action="store_true", help="the sample and its cost, no calls")
    parser.add_argument(
        "--retry-unscored",
        default=None,
        metavar="RESULT",
        help="re-score only the answers this result file has no score for, and write the two "
        "merged as one whole run",
    )
    parser.add_argument(
        "--count-tokens",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="count input tokens with the provider on --dry-run (free)",
    )
    parser.add_argument(
        "--smoke", action="store_true", help="the stand-in evaluator; no key needed"
    )
    parser.add_argument(
        "--strict-criteria",
        action="store_true",
        help="per-rubric output schema: a criterion cannot be omitted or invented "
        "(unmeasured — see evaluation/strict_schema.py)",
    )
    parser.add_argument("--out", default=None, help="where to write the result JSON")
    parser.add_argument("--report", default=None, help="also write the markdown report here")
    parser.add_argument("--label", default=None)
    parser.add_argument("--compare", nargs="*", default=None, metavar="RESULT", help="two files")
    return parser


if __name__ == "__main__":  # pragma: no cover — the entry point
    raise SystemExit(main())
