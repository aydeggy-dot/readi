"""The report, and the rule that stops it saying something it cannot support.

**A figure carries its provenance or it is not printed** (ADR-0020 §1). A run over mixed synthetic
and real clips prints two tables, never one: synthetic audio is cleaner than real speech, flatters
every recogniser, and may **eliminate** a provider but never choose one. `refuse_mixed` is where
that lives, and it is a refusal rather than a warning because a warning above a number is read once
and the number is quoted for ever — which is exactly how M4's fairness figure nearly escaped without
its caveat.

Everything else here is presentation. The numbers come from `metrics.py`, the run writes one JSON
per run into `evals/stt_benchmark/results/`, and every table in this file is recomputed from that
file — so a report can be regenerated for nothing and two runs can be compared without
re-transcribing anything.
"""

import json
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from readi_worker.stt_benchmark.manifest import Clip, Manifest
from readi_worker.stt_benchmark.metrics import (
    Alignment,
    TermScore,
    align,
    filler_retention,
    pooled,
    term_scores,
)


class ProvenanceError(RuntimeError):
    """A figure was asked for over clips of more than one provenance."""


@dataclass
class ClipResult:
    """One clip through one provider."""

    clip_id: str
    provider: str
    model: str
    provenance: str
    speaker: str
    variety: str
    voice: str | None
    reference_source: str
    hypothesis: str
    audio_seconds: float
    latency_ms: int
    cost_micro_usd: int
    reference_words: int
    substitutions: int
    deletions: int
    insertions: int
    term_total: int
    term_recognised: int
    filler_retention: float | None
    error: str | None = None

    @property
    def alignment(self) -> Alignment:
        return Alignment(self.reference_words, self.substitutions, self.deletions, self.insertions)


@dataclass
class Run:
    """Everything one invocation produced, and the caveats it has to carry."""

    manifest: str
    description: str
    started_at: str
    providers: list[str]
    results: list[ClipResult] = field(default_factory=list)
    #: Set when the run scored against an uncorrected two-provider draft rather than a human
    #: transcript.
    draft_references: bool = False
    #: Set when a provider with no published rate was allowed in; every cost figure is then a floor.
    unpriced_providers: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def for_provenance(self, provenance: str) -> list[ClipResult]:
        return [result for result in self.results if result.provenance == provenance]


def score(
    clip: Clip,
    provider: str,
    model: str,
    hypothesis: str,
    *,
    glossary: Sequence[str],
    audio_seconds: float,
    latency_ms: int,
    cost_micro_usd: int,
    error: str | None = None,
) -> ClipResult:
    alignment = align(clip.reference, hypothesis)
    terms: list[TermScore] = term_scores(clip.reference, hypothesis, glossary)
    return ClipResult(
        clip_id=clip.id,
        provider=provider,
        model=model,
        provenance=clip.provenance,
        speaker=clip.speaker,
        variety=clip.variety,
        voice=clip.voice,
        reference_source=clip.reference_source,
        hypothesis=hypothesis,
        audio_seconds=audio_seconds,
        latency_ms=latency_ms,
        cost_micro_usd=cost_micro_usd,
        reference_words=alignment.reference_words,
        substitutions=alignment.substitutions,
        deletions=alignment.deletions,
        insertions=alignment.insertions,
        term_total=sum(term.occurrences for term in terms),
        term_recognised=sum(term.recognised for term in terms),
        filler_retention=filler_retention(clip.reference, hypothesis),
        error=error,
    )


def refuse_mixed(results: Sequence[ClipResult]) -> str:
    """The provenance of these results, or a refusal. One provenance in, one figure out."""
    provenances = {result.provenance for result in results}
    if len(provenances) > 1:
        raise ProvenanceError(
            "a figure over synthetic and real clips together would mean nothing: synthetic audio "
            "is cleaner than real speech and flatters every recogniser (ADR-0020 §1). Report them "
            "apart."
        )
    return provenances.pop() if provenances else "none"


def render(run: Run, manifest: Manifest) -> str:
    """The whole report as markdown, one section per provenance."""
    lines: list[str] = [
        f"# Accent benchmark — {run.manifest}",
        "",
        run.description,
        "",
        f"Run at {run.started_at}. Providers: {', '.join(run.providers)}.",
        "",
    ]
    if run.draft_references:
        lines += [
            "> **The references are an uncorrected two-provider draft.** No person has listened to "
            "these clips end to end, so every figure below is agreement between machines, not "
            "accuracy (ADR-0020 §4).",
            "",
        ]
    if run.unpriced_providers:
        lines += [
            "> **Cost is a floor, not a total.** No published rate exists for "
            f"{', '.join(run.unpriced_providers)}, so their calls are counted at zero.",
            "",
        ]
    for note in run.notes:
        lines += [f"> {note}", ""]

    for provenance in ("real", "synthetic"):
        results = run.for_provenance(provenance)
        if not results:
            continue
        lines += _section(provenance, results, manifest)
    return "\n".join(lines).rstrip() + "\n"


def _section(provenance: str, results: Sequence[ClipResult], manifest: Manifest) -> list[str]:
    heading = {
        "real": "## Real speech — this is what decides",
        "synthetic": (
            "## Synthetic speech — a pre-screen only\n\n"
            "May eliminate a provider that is worse by a wide margin on every source. **May never "
            "choose one** (ADR-0020 §2)."
        ),
    }[provenance]
    lines = [heading, ""]

    providers = _ordered({result.provider for result in results})
    lines += [
        "| provider | WER | term error | fillers kept | clips | audio | cost |",
        "| --- | --: | --: | --: | --: | --: | --: |",
    ]
    for provider in providers:
        rows = [r for r in results if r.provider == provider]
        scored = [r for r in rows if r.error is None]
        wer = pooled([r.alignment for r in scored])
        terms = sum(r.term_total for r in scored)
        recognised = sum(r.term_recognised for r in scored)
        term_rate = 0.0 if terms == 0 else 1 - recognised / terms
        retentions = [r.filler_retention for r in scored if r.filler_retention is not None]
        fillers = f"{sum(retentions) / len(retentions):.0%}" if retentions else "—"
        seconds = sum(r.audio_seconds for r in scored)
        cost = sum(r.cost_micro_usd for r in rows)
        failed = len(rows) - len(scored)
        clips = f"{len(scored)}" + (f" (+{failed} failed)" if failed else "")
        lines.append(
            f"| {provider} | {wer:.1%} | {term_rate:.1%} | {fillers} | {clips} | "
            f"{seconds / 60:.1f} min | ${cost / 1_000_000:.4f} |"
        )
    lines.append("")

    speakers = [s for s in manifest.speakers if any(r.speaker == s for r in results)]
    if len(speakers) > 1:
        lines += ["### Per speaker — the figure that matters", ""]
        lines += [
            "| speaker | " + " | ".join(providers) + " |",
            "| --- | " + " | ".join("--:" for _ in providers) + " |",
        ]
        for speaker in speakers:
            cells = []
            for provider in providers:
                rows = [
                    r
                    for r in results
                    if r.speaker == speaker and r.provider == provider and r.error is None
                ]
                cells.append(f"{pooled([r.alignment for r in rows]):.1%}" if rows else "—")
            lines.append(f"| {speaker} | " + " | ".join(cells) + " |")
        lines.append("")
        lines += [
            "An average over speakers hides the one a provider fails. One excellent on seven "
            "speakers and unusable on the eighth has not passed.",
            "",
        ]

    varieties = _ordered({result.variety for result in results})
    if len(varieties) > 1:
        lines += ["### By variety", ""]
        lines += [
            "| variety | " + " | ".join(providers) + " |",
            "| --- | " + " | ".join("--:" for _ in providers) + " |",
        ]
        for variety in varieties:
            cells = []
            for provider in providers:
                rows = [
                    r
                    for r in results
                    if r.variety == variety and r.provider == provider and r.error is None
                ]
                cells.append(f"{pooled([r.alignment for r in rows]):.1%}" if rows else "—")
            lines.append(f"| {variety} | " + " | ".join(cells) + " |")
        lines.append("")

    voices = _ordered({r.voice for r in results if r.voice})
    if provenance == "synthetic" and len(voices) > 1:
        lines += [
            "### By synthesizer voice",
            "",
            "A recogniser must not be judged chiefly on one vendor's audio.",
            "",
        ]
        lines += [
            "| voice | " + " | ".join(providers) + " |",
            "| --- | " + " | ".join("--:" for _ in providers) + " |",
        ]
        for voice in voices:
            cells = []
            for provider in providers:
                rows = [
                    r
                    for r in results
                    if r.voice == voice and r.provider == provider and r.error is None
                ]
                cells.append(f"{pooled([r.alignment for r in rows]):.1%}" if rows else "—")
            lines.append(f"| {voice} | " + " | ".join(cells) + " |")
        lines.append("")
    return lines


def write(run: Run, out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(_as_json(run), indent=2) + "\n", encoding="utf-8")
    return out


def read(path: Path) -> Run:
    payload = json.loads(path.read_text(encoding="utf-8"))
    results = [ClipResult(**row) for row in payload.pop("results", [])]
    return Run(results=results, **payload)


def default_out(root: Path, manifest_name: str) -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return root / "results" / f"{stamp}-{manifest_name}.json"


def _as_json(run: Run) -> dict[str, object]:
    payload = asdict(run)
    return payload


def _ordered(values: set[str] | set[str | None]) -> list[str]:
    return sorted(str(value) for value in values if value is not None)
