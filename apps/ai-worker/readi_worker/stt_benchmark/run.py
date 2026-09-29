"""The accent benchmark: how well does each recogniser understand Nigerian-accented English?

    # Nothing spent: the stand-in recogniser over a manifest it builds itself. Runs inside `pnpm
    # test`.
    uv run python -m readi_worker.stt_benchmark.run --smoke

    # What a real run would send and what it would cost — in minutes and characters against each
    # free allowance, not only in dollars, because on a free tier dollars are not what stops a run.
    uv run python -m readi_worker.stt_benchmark.run --manifest <path> --providers
    deepgram,assemblyai --dry-run

    # PAID. `--max-cost` is the approved figure; the run stops before the clip that would cross it.
    uv run python -m readi_worker.stt_benchmark.run --manifest <path> --providers
    deepgram,assemblyai --max-cost 1.00

    # A finished run, re-rendered for nothing.
    uv run python -m readi_worker.stt_benchmark.run --render <results.json>

**Two refusals, on purpose.**

*An unpriced provider does not run.* Intron publishes no rates at all, so counting their calls at
zero would put a free tier's real bill outside anything we measure — the same reasoning as the
startup rule (owner's instruction, 2026-09-29), one level up. `--allow-unpriced` is the explicit way
through and it stamps the report: every cost figure becomes a floor.

*A draft reference does not pass as a measurement.* ADR-0020 §4 requires a person to listen to every
clip and correct the whole draft, because two recognisers that mishear an accent the same way
**agree** — reviewing only their disagreements would hide precisely the errors this exercise exists
to find. A manifest may declare `reference_source: draft`, and then `--allow-draft` is required and
the report says on its face that the figures are agreement between machines rather than accuracy.
"""

import argparse
import asyncio
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from readi_worker.paths import repo_root
from readi_worker.settings import Settings, SettingsError, load_settings
from readi_worker.speech.base import SpeechToText, SttError
from readi_worker.speech.fake import FakeSpeechToText, silent_wav
from readi_worker.speech.glossary import load_terms
from readi_worker.speech.pricing import has_stt_price, stt_cost_micro_usd
from readi_worker.speech.providers import CallPath
from readi_worker.stt_benchmark import report as reporting
from readi_worker.stt_benchmark.manifest import Clip, Manifest, ManifestError, load_manifest
from readi_worker.stt_benchmark.quota import Spend, allowance_for
from readi_worker.stt_benchmark.report import Run

#: The batch model each provider is benchmarked on unless `--model` says otherwise. These are the
#: pre-recorded models: the benchmark transcribes files, and the live path is phase 3's.
DEFAULT_MODELS: dict[str, str] = {
    "fake": "fake",
    "deepgram": "nova-3",
    "assemblyai": "universal-3-5-pro",
    "intron": "en",
}

#: Every clip is transcribed once per provider, so this is the whole of a clip's cost. It is the
#: pre-recorded path: the benchmark transcribes files, and the live path is phase 3's.
PATH: CallPath = "batch"


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        return asyncio.run(_run(args))
    except (ManifestError, reporting.ProvenanceError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except SettingsError as exc:
        print(exc, file=sys.stderr)
        return 2


async def _run(args: argparse.Namespace) -> int:
    if args.render:
        return _render_only(Path(args.render))

    root = repo_root() / "evals" / "stt_benchmark"
    script: list[str] | None = None
    if args.smoke:
        manifest, clips_root, script = smoke_manifest()
        providers = ["fake"]
    else:
        if not args.manifest:
            print("error: --manifest is required (or --smoke)", file=sys.stderr)
            return 2
        manifest, clips_root = load_manifest(Path(args.manifest))
        providers = [name.strip() for name in args.providers.split(",") if name.strip()]

    models = dict(DEFAULT_MODELS)
    for pair in args.model or []:
        provider, _, model = pair.partition("=")
        if not model:
            print(f"error: --model takes provider=model, not {pair!r}", file=sys.stderr)
            return 2
        models[provider] = model

    unpriced = [p for p in providers if not has_stt_price(p, models.get(p, ""), PATH)]
    if unpriced and not args.allow_unpriced:
        print(
            "error: no published rate for "
            + ", ".join(f"{p}/{models.get(p, '?')}" for p in unpriced)
            + ". A per-minute vendor bills monthly, in arrears, so counting it at zero hides a\n"
            "real bill: pass --allow-unpriced to run anyway, and every cost figure in the report\n"
            "becomes a floor rather than a total.",
            file=sys.stderr,
        )
        return 2

    drafts = [clip.id for clip in manifest.clips if clip.reference_source == "draft"]
    if drafts and not args.allow_draft:
        print(
            f"error: {len(drafts)} clip(s) carry an uncorrected draft reference. ADR-0020 §4\n"
            "wants a person to have listened to every clip, because two recognisers that\n"
            "mishear an accent the same way agree. Pass --allow-draft to score against the\n"
            "draft anyway; the report will say\n"
            "so on its face.",
            file=sys.stderr,
        )
        return 2

    glossary = load_terms()
    if args.dry_run:
        return _dry_run(manifest, clips_root, providers, models, unpriced)

    # Only a real provider needs configuration; `--smoke` must run with no environment at all.
    settings = _fake_settings() if providers == ["fake"] else load_settings()
    run = Run(
        manifest=manifest.name,
        description=manifest.description,
        started_at=datetime.now(UTC).isoformat(timespec="seconds"),
        providers=providers,
        draft_references=bool(drafts),
        unpriced_providers=unpriced if args.allow_unpriced else [],
    )
    if len(manifest.provenances) > 1:
        run.notes.append(
            "This set mixes synthetic and real clips. They are reported apart and never pooled."
        )

    cap_micro_usd = int(args.max_cost * 1_000_000) if args.max_cost else None
    spent = 0
    for provider in providers:
        model = models.get(provider, provider)
        stt = _build(provider, settings, script)
        keyterm_cap = _keyterm_cap(provider)
        try:
            for clip in manifest.clips:
                if (
                    cap_micro_usd is not None
                    and spent + _estimate(clip, provider, model) > cap_micro_usd
                ):
                    run.notes.append(
                        f"Stopped at the cap: ${cap_micro_usd / 1_000_000:.2f} approved, "
                        f"${spent / 1_000_000:.4f} spent, {clip.id} not transcribed."
                    )
                    print(f"stopping before {clip.id}: the cap would be crossed", file=sys.stderr)
                    break
                result = await _transcribe(
                    stt, clip, clips_root, provider, model, glossary, keyterm_cap
                )
                spent += result.cost_micro_usd
                run.results.append(result)
                status = "ok" if result.error is None else result.error
                print(
                    f"{provider:<11} {clip.id:<28} {status:<24} "
                    f"WER {result.alignment.wer:6.1%}  {result.latency_ms:>6} ms"
                )
        finally:
            closer = getattr(stt, "aclose", None)
            if closer is not None:
                await closer()

    # A smoke run writes beside its own generated clips, never into the repository: `pnpm test`
    # calls it every run, and a harness that litters its result directory is one people ignore.
    if args.out:
        out = Path(args.out)
    elif args.smoke:
        out = clips_root / "smoke-result.json"
    else:
        out = reporting.default_out(root, manifest.name)
    reporting.write(run, out)
    print(f"\n{reporting.render(run, manifest)}")
    print(f"results: {out}")
    return 0


async def _transcribe(
    stt: SpeechToText,
    clip: Clip,
    clips_root: Path,
    provider: str,
    model: str,
    glossary: Sequence[str],
    keyterm_cap: int,
) -> reporting.ClipResult:
    audio = clip.path(clips_root).read_bytes()
    keyterms = glossary[:keyterm_cap] if keyterm_cap else []
    try:
        transcription = await stt.transcribe(
            model=model,
            audio=audio,
            content_type=_content_type(clip.audio),
            language="en",
            keyterms=keyterms,
            audio_url=clip.audio_url,
        )
    except SttError as exc:
        return reporting.score(
            clip,
            provider,
            model,
            "",
            glossary=glossary,
            audio_seconds=0.0,
            latency_ms=exc.latency_ms,
            cost_micro_usd=0,
            error=exc.code,
        )
    return reporting.score(
        clip,
        provider,
        model,
        transcription.text,
        glossary=glossary,
        audio_seconds=transcription.audio_seconds,
        latency_ms=transcription.latency_ms,
        cost_micro_usd=stt_cost_micro_usd(
            provider, model, PATH, audio_seconds=transcription.audio_seconds
        ),
    )


def _dry_run(
    manifest: Manifest,
    clips_root: Path,
    providers: Sequence[str],
    models: dict[str, str],
    unpriced: Sequence[str],
) -> int:
    seconds = sum(_seconds(clip.path(clips_root)) for clip in manifest.clips)
    print(f"{manifest.name}: {len(manifest.clips)} clips, {seconds / 60:.1f} minutes of audio")
    print(f"provenance: {', '.join(sorted(manifest.provenances))}")
    print(f"speakers: {len(manifest.speakers)}\n")
    print(f"{'provider':<12} {'model':<22} {'audio':>9} {'cost':>9}  against the free allowance")
    print("-" * 92)
    total = 0
    for provider in providers:
        model = models.get(provider, provider)
        cost = stt_cost_micro_usd(provider, model, PATH, audio_seconds=seconds)
        total += cost
        spend = Spend(
            provider=provider,
            units=int(seconds),
            unit_name="audio seconds",
            cost_micro_usd=cost,
            priced=provider not in unpriced,
        )
        note = "" if spend.priced else "  (no published rate: this is not a cost)"
        print(
            f"{provider:<12} {model:<22} {seconds / 60:8.1f}m "
            f"${cost / 1_000_000:8.4f}  {spend.against(allowance_for(provider))}{note}"
        )
    print("-" * 92)
    print(f"{'total':<12} {'':<22} {'':>9} ${total / 1_000_000:8.4f}")
    if unpriced:
        print(
            "\nThe total is a floor: "
            + ", ".join(unpriced)
            + " publish no rate, so their clips are "
            "counted at zero."
        )
    return 0


def _render_only(path: Path) -> int:
    run = reporting.read(path)
    manifest = Manifest(
        name=run.manifest,
        description=run.description,
        clips=[
            Clip(
                id=result.clip_id,
                audio="(not read)",
                reference="(not read)",
                provenance=result.provenance,  # type: ignore[arg-type]  # validated when written
                speaker=result.speaker,
                variety=result.variety,  # type: ignore[arg-type]  # validated when written
            )
            for result in run.results
        ],
    )
    print(reporting.render(run, manifest))
    return 0


def _build(provider: str, settings: Settings, script: list[str] | None = None) -> SpeechToText:
    """One adapter per provider, built from the key in configuration rather than from an
    argument."""
    if provider == "fake":
        return FakeSpeechToText(script)
    from readi_worker.speech.assemblyai import AssemblyAiSpeechToText
    from readi_worker.speech.deepgram import DeepgramSpeechToText
    from readi_worker.speech.intron import IntronSpeechToText

    keys = {
        "deepgram": settings.deepgram_api_key,
        "assemblyai": settings.assemblyai_api_key,
        "intron": settings.intron_api_key,
    }
    key = keys.get(provider)
    if key is None:
        raise SettingsError(
            f"{provider.upper()}_API_KEY is not configured, so {provider} cannot be benchmarked"
        )
    secret = key.get_secret_value()
    timeout = settings.stt_timeout_s
    if provider == "deepgram":
        return DeepgramSpeechToText(secret, timeout_s=timeout)
    if provider == "assemblyai":
        return AssemblyAiSpeechToText(secret, timeout_s=timeout)
    if provider == "intron":
        return IntronSpeechToText(secret, timeout_s=timeout)
    raise SettingsError(f"no recogniser called {provider}")


def _fake_settings() -> Settings:
    """Settings for a run that reaches nothing: `--smoke` inside `pnpm test` has no env file."""
    return Settings(
        _env_file=None,
        redis_url="redis://127.0.0.1:16379/0",  # type: ignore[arg-type]  # validated
        service_token="smoke" * 8,  # type: ignore[arg-type]  # validated
        llm_provider="fake",
    )


def _keyterm_cap(provider: str) -> int:
    from readi_worker.speech.providers import STT_VENDORS

    vendor = STT_VENDORS.get(provider)
    return vendor.keyterm_limit[PATH] if vendor else 0


def _estimate(clip: Clip, provider: str, model: str) -> int:
    """What the next clip might cost, from the manifest rather than from the response.

    Deliberately an over-estimate where it is uncertain: a cap is a promise about an upper bound.
    """
    return stt_cost_micro_usd(provider, model, PATH, audio_seconds=180)


def _seconds(path: Path) -> float:
    import wave

    try:
        with wave.open(str(path), "rb") as handle:
            return handle.getnframes() / (handle.getframerate() or 16_000)
    except Exception:
        # Not a WAV: 16 kB/s is the fake's own rate and an honest order of magnitude for a phone
        # clip.
        return path.stat().st_size / 32_000


def _content_type(name: str) -> str:
    suffix = name.rsplit(".", 1)[-1].casefold()
    return {
        "wav": "audio/wav",
        "mp3": "audio/mpeg",
        "m4a": "audio/mp4",
        "ogg": "audio/ogg",
        "opus": "audio/ogg",
        "flac": "audio/flac",
        "webm": "audio/webm",
    }.get(suffix, "application/octet-stream")


#: The smoke set: a reference, and a hypothesis that differs from it in a way somebody chose.
#:
#: The perturbations are the point. A stand-in that returned something unrelated would score ~100%
#: and prove only that the pipeline runs; these three have **known** error counts, so a change to
#: the normalizer or to the alignment moves a number a test is watching:
#:
#: - exact, so 0% is reachable and the two glossary terms are recognised;
#: - two substitutions and a deletion, one of them a mangled glossary term, so the technical-term
#: rate
#: is not always either 0 or 100;
#: - a hesitation in the reference the recogniser dropped, so hesitation-stripping is exercised and
#: `filler_retention` has something to report.
SMOKE_SET: tuple[tuple[str, str, str], ...] = (
    (
        "s1",
        "we make the handler idempotent and retry with a backoff",
        "we make the handler idempotent and retry with a backoff",
    ),
    (
        "s1",
        "i would add an index on the column we filter by",
        "i would add an indecks on the colum we filter",
    ),
    (
        "s2",
        "um the test was flaky because it waited for a fixed time",
        "the test was flaky cos it waited for a fixed time",
    ),
)


def smoke_manifest() -> tuple[Manifest, Path, list[str]]:
    """A set the run builds for itself: no fixtures, no key, no network, no cost.

    It exercises the whole path — manifest, normalizer, alignment, term scoring, the per-speaker
    table and the provenance rule — against the stand-in recogniser, so the harness cannot rot
    quietly between paid runs. `--smoke` is what `pnpm test` calls.
    """
    import tempfile

    directory = Path(tempfile.mkdtemp(prefix="stt-smoke-"))
    clips: list[Clip] = []
    for index, (speaker, reference, _hypothesis) in enumerate(SMOKE_SET):
        name = f"smoke-{index}.wav"
        (directory / name).write_bytes(silent_wav(1.0 + index))
        clips.append(
            Clip(
                id=f"smoke-{index}",
                audio=name,
                reference=reference,
                provenance="synthetic",
                speaker=speaker,
                first_language="none",
                variety="control",
                device="generated",
                voice="fake",
                reference_source="read",
            )
        )
    manifest = Manifest(
        name="smoke",
        description="Generated silence with scripted references: the harness checking itself.",
        clips=clips,
    )
    return manifest, directory, [hypothesis for _s, _r, hypothesis in SMOKE_SET]


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m readi_worker.stt_benchmark.run",
        description="Word error rate per recogniser, per speaker, and on technical terms.",
    )
    parser.add_argument("--manifest", default=None, help="path to a manifest YAML")
    parser.add_argument(
        "--providers", default="deepgram,assemblyai", help="comma-separated recognisers"
    )
    parser.add_argument("--model", action="append", default=None, help="provider=model, repeatable")
    parser.add_argument("--smoke", action="store_true", help="the stand-in, on a generated set")
    parser.add_argument(
        "--dry-run", action="store_true", help="what it would send and cost, in units and dollars"
    )
    parser.add_argument(
        "--max-cost", type=float, default=None, help="the approved figure, in US dollars"
    )
    parser.add_argument(
        "--allow-unpriced",
        action="store_true",
        help="run a provider with no published rate; costs become a floor",
    )
    parser.add_argument(
        "--allow-draft",
        action="store_true",
        help="score against uncorrected two-provider draft references",
    )
    parser.add_argument("--render", default=None, help="re-render a finished run's JSON")
    parser.add_argument("--out", default=None, help="where to write the result JSON")
    return parser


if __name__ == "__main__":
    raise SystemExit(main())
