"""Compare CV-parse models side by side on your own sample CVs (owner request, M1 phase 3).

    cd apps/ai-worker
    uv run python -m readi_worker.tools.compare_cv_parse ~/sample-cvs \\
        --models claude-sonnet-5,claude-haiku-4-5 --role "Frontend engineer" --level "Mid-level"

Uses the production pipeline (extraction, prompt, validation, normalisation) with each model and
prints latency, tokens, cost and what was extracted. The full results go to a Markdown report in
`apps/ai-worker/.cv-compare/` (gitignored). CVs are personal data: keep the folder and the report
local, and delete them when done. Needs ANTHROPIC_API_KEY (environment or apps/ai-worker/.env);
every run makes real, billed API calls.
"""

import argparse
import asyncio
import base64
import json
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from readi_worker.contracts import CvParseRequest, CvParseResponse
from readi_worker.cv.extract import DOCX, PDF
from readi_worker.cv.parse import CvParser
from readi_worker.llm.anthropic_client import AnthropicLLMClient
from readi_worker.llm.pricing import has_price

CONTENT_TYPES = {".pdf": PDF, ".docx": DOCX}
REPORT_DIR = Path(__file__).parents[2] / ".cv-compare"


class _Keys(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    anthropic_api_key: SecretStr


@dataclass
class Run:
    model: str
    response: CvParseResponse

    @property
    def latency_ms(self) -> int:
        return sum(call.latency_ms for call in self.response.ai_calls)

    @property
    def tokens(self) -> tuple[int, int]:
        calls = self.response.ai_calls
        return sum(c.input_units for c in calls), sum(c.output_units for c in calls)

    @property
    def cost_micro_usd(self) -> int:
        return sum(call.cost_micro_usd for call in self.response.ai_calls)

    def skills(self) -> set[str]:
        parsed = self.response.parsed
        return {s.root for s in parsed.skills} if parsed else set()


def _usd(micro: int) -> str:
    return f"${micro / 1_000_000:.4f}"


def _row(run: Run) -> str:
    parsed = run.response.parsed
    counts = (
        f"{len(parsed.skills):>3} {len(parsed.projects):>3} {len(parsed.experience):>3} "
        f"{len(parsed.gaps):>3}"
        if parsed
        else "  -   -   -   -"
    )
    tokens_in, tokens_out = run.tokens
    status = run.response.status + (f" ({run.response.error})" if run.response.error else "")
    return (
        f"  {run.model:<22} {status:<24} {run.latency_ms / 1000:>6.1f}s "
        f"{tokens_in:>7} {tokens_out:>6} {_usd(run.cost_micro_usd):>9}   {counts}"
    )


async def _compare_file(
    path: Path, parsers: dict[str, CvParser], role: str, level: str
) -> list[Run]:
    data = await asyncio.to_thread(path.read_bytes)
    request = CvParseRequest.model_validate(
        {
            "request_id": str(uuid.uuid4()),
            "content_type": CONTENT_TYPES[path.suffix.lower()],
            "file_base64": base64.b64encode(data).decode(),
            "target_role_label": role,
            "level_label": level,
        }
    )
    responses = await asyncio.gather(*(p.parse(request) for p in parsers.values()))
    return [Run(model, r) for model, r in zip(parsers, responses, strict=True)]


def _report(results: list[tuple[Path, list[Run]]], role: str, level: str) -> str:
    lines = [f"# CV parse comparison — {datetime.now(UTC):%Y-%m-%d %H:%M} UTC", ""]
    lines += [f"Target: {role} / {level}. Contains CV data: keep local, delete when done.", ""]
    for path, runs in results:
        lines += [f"## {path.name}", ""]
        for run in runs:
            tokens_in, tokens_out = run.tokens
            lines += [
                f"### {run.model} — {run.response.status}, {run.latency_ms} ms, "
                f"{tokens_in} in / {tokens_out} out, {_usd(run.cost_micro_usd)}",
                "",
                "```json",
                json.dumps(run.response.model_dump(mode="json")["parsed"], indent=2),
                "```",
                "",
            ]
    return "\n".join(lines)


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("folder", type=Path, help="folder of .pdf / .docx CVs")
    parser.add_argument("--models", default="claude-sonnet-5,claude-haiku-4-5")
    parser.add_argument("--role", default="Frontend engineer")
    # Free text, not a choice: roles and levels are catalogue content now (ADR-0015).
    parser.add_argument("--level", default="Intern / Junior")
    parser.add_argument("--max-files", type=int, default=20)
    args = parser.parse_args(argv)

    files = sorted(p for p in args.folder.iterdir() if p.suffix.lower() in CONTENT_TYPES)[
        : args.max_files
    ]
    if not files:
        print(f"No .pdf or .docx files in {args.folder}", file=sys.stderr)
        return 2
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    for model in models:
        if not has_price("anthropic", model):
            print(
                f"warning: no price configured for {model}; its cost shows as $0", file=sys.stderr
            )

    keys = _Keys()  # read from the environment / .env
    llm = AnthropicLLMClient(keys.anthropic_api_key.get_secret_value(), timeout_s=120)
    parsers = {model: CvParser(llm, model) for model in models}

    header = (
        f"  {'model':<22} {'status':<24} {'time':>7} {'in':>7} {'out':>6} {'cost':>9}"
        "   skl prj exp gap"
    )
    results: list[tuple[Path, list[Run]]] = []
    try:
        for index, path in enumerate(files, start=1):
            print(f"\n[{index}/{len(files)}] {path.name}")
            print(header)
            runs = await _compare_file(path, parsers, args.role, args.level)
            for run in runs:
                print(_row(run))
            if len(runs) >= 2:
                first, *others = runs
                for other in others:
                    only_first = sorted(first.skills() - other.skills())
                    only_other = sorted(other.skills() - first.skills())
                    print(f"  skills only in {first.model}: {', '.join(only_first) or '-'}")
                    print(f"  skills only in {other.model}: {', '.join(only_other) or '-'}")
            results.append((path, runs))
    finally:
        await llm.aclose()

    print("\nTotals")
    for model in models:
        runs = [run for _, file_runs in results for run in file_runs if run.model == model]
        ok = sum(run.response.status == "parsed" for run in runs)
        cost = sum(run.cost_micro_usd for run in runs)
        latency = sum(run.latency_ms for run in runs) / max(len(runs), 1) / 1000
        print(f"  {model:<22} parsed {ok}/{len(runs)}, avg {latency:.1f}s, total {_usd(cost)}")

    REPORT_DIR.mkdir(exist_ok=True)
    report = REPORT_DIR / f"report-{datetime.now(UTC):%Y%m%d-%H%M%S}.md"
    report.write_text(_report(results, args.role, args.level))
    print(f"\nFull results: {report}\n(Contains CV data: keep it local and delete it when done.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
