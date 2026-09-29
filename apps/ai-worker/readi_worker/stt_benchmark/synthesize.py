"""Build the synthetic pre-screen set: the same sentences, spoken by several voices.

    # What it would cost and how much of the month's quota it would take. Sends nothing.
    uv run python -m readi_worker.stt_benchmark.synthesize --dry-run

    # PAID (a few cents). Writes clips and a manifest under evals/stt_benchmark/synthetic/.
    uv run python -m readi_worker.stt_benchmark.synthesize --max-cost 0.20

**What this set is for, and what it is not.** It is a pre-screen: it proves the pipeline works,
exercises
the normalizer on real vendor output, and finds a recogniser that is plainly unfit. ADR-0020 §2 —
synthetic audio may **eliminate** a provider and may never **choose** one, because it is cleaner
than
real speech, evenly paced, free of room noise and code-switching, and flatters everything.

**The control condition is the point of the design.** Every sentence is synthesized twice: once in a
Nigerian-accented voice and once in a general-accent voice from the same vendor, with the same model
and
the same settings. A raw word error rate on synthetic speech says almost nothing; the **difference**
between the two conditions is a measurement of accent sensitivity with the vendor's own synthesis
artefacts held constant. It is a weaker control than a second TTS vendor, which ADR-0020 §2 asks
for, and
that deviation is recorded in the run's notes rather than glossed: the second vendor is owed before
any
provider is eliminated on this evidence.

The sentences are **Part A of the recording script**, so the synthetic set and the real set are
scored on
the same words and the pre-screen's tech-term figures can be read against the real ones later.
"""

import argparse
import asyncio
import sys
from pathlib import Path

import yaml

from readi_worker.paths import repo_root
from readi_worker.settings import SettingsError, load_settings
from readi_worker.speech.base import TtsError
from readi_worker.speech.elevenlabs import ElevenLabsTextToSpeech
from readi_worker.speech.pricing import tts_cost_micro_usd
from readi_worker.stt_benchmark.quota import Spend, allowance_for

#: Part A of the recording script in `evals/stt_benchmark/kit/`, verbatim — the same words the real
#: speakers read, so the two sets are comparable on the technical vocabulary.
SENTENCES: tuple[str, ...] = (
    "The retry is safe because the endpoint is idempotent - if the same webhook arrives"
    " twice, the second one changes nothing.",
    "We run the API on Kubernetes, and the readiness probe was failing because the"
    " connection pool to PostgreSQL filled up under load.",
    "The service is JavaScript on Node, and we moved the new parts to TypeScript so the"
    " payload shapes are checked at build time.",
    "We keep the session in Redis with a TTL of thirty minutes, and nginx in front of it"
    " terminates TLS and does the rate limiting.",
    "Sign-in goes through OAuth, and the access token is a JWT the API verifies on every"
    " request - the refresh token stays in a same-site cookie.",
    "The CI/CD pipeline runs unit tests on every push, then Cypress against staging, and we"
    " are moving the end-to-end suite to Playwright.",
    "Latency at p95 went from eighty milliseconds to three seconds, and the cause was an N"
    " plus one query behind a list endpoint.",
    "Cache invalidation is the hard part - the dashboard was showing another user's figures"
    " because the cache key left out the user id.",
    "Two requests got past the same check and both got the last unit, which is a race"
    " condition you only see at peak.",
    "The worker retries with exponential backoff, and anything that fails five times goes"
    " to a dead letter queue for somebody to look at.",
    "We build the image with Docker, deploy from GitHub Actions, and read a replica of the"
    " database for the reports so the primary is not touched.",
    "The flaky test was a timing problem, not a bug - the assertion ran before the request"
    " came back, and the locator matched two elements.",
)


class Voice:
    """One synthesizer voice and what it stands for in the design."""

    def __init__(self, voice_id: str, label: str, condition: str) -> None:
        self.voice_id = voice_id
        self.label = label
        #: `nigerian_english` or `control`, which is what the report groups by.
        self.condition = condition


#: Four voices: two Nigerian-accented and two general-accent controls. The Nigerian ids come from
#: `tools/list_voices.py --accent nigerian` (168 voices, 22 tagged conversational, all at rate 1.0
#: with a 730-day notice period on 2026-09-29) and are the `conversational` ones, because an
#: interviewer is a conversation and a narrator voice reads at a different pace.
#:
#: **Two per condition, not one**: a single voice's idiosyncrasy — a lisp, an unusual cadence —
#: would be indistinguishable from an accent effect, which is the whole thing being measured.
DEFAULT_VOICES: tuple[Voice, ...] = (
    Voice("blHJm2pvGPtru6vjIUQY", "wale-calm", "nigerian_english"),
    Voice("QN8k7mRRZJ1lTqOVuIv0", "lexy", "nigerian_english"),
    # The controls are ElevenLabs' own general-accent voices: same model, same settings.
    Voice("21m00Tcm4TlvDq8ikWAM", "rachel-control", "control"),
    Voice("pNInz6obpgDQGcFmaJgB", "adam-control", "control"),
)

#: Flash: the model the live path uses, so the pre-screen hears roughly what a candidate would hear
#: answered back. Quality is not the variable here — the recogniser is.
DEFAULT_MODEL = "eleven_flash_v2_5"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m readi_worker.stt_benchmark.synthesize",
        description="Synthesize the accent pre-screen set from Part A of the recording script.",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument(
        "--sentences", type=int, default=len(SENTENCES), help="how many of Part A to use"
    )
    parser.add_argument("--dry-run", action="store_true", help="characters and cost; sends nothing")
    parser.add_argument("--max-cost", type=float, default=None, help="the approved figure, in USD")
    parser.add_argument("--out", default=None, help="where to write clips and the manifest")
    args = parser.parse_args(argv)

    sentences = SENTENCES[: max(1, args.sentences)]
    characters = sum(len(sentence) for sentence in sentences) * len(DEFAULT_VOICES)
    cost = tts_cost_micro_usd("elevenlabs", args.model, characters)

    if args.dry_run:
        print(
            f"{len(sentences)} sentences x {len(DEFAULT_VOICES)} voices = "
            f"{len(sentences) * len(DEFAULT_VOICES)} clips"
        )
        for condition in ("nigerian_english", "control"):
            voices = [voice.label for voice in DEFAULT_VOICES if voice.condition == condition]
            print(f"  {condition:<18} {', '.join(voices)}")
        spend = Spend("elevenlabs", characters, "characters", cost, priced=True)
        print(f"\nmodel: {args.model}")
        print(f"characters: {characters:,}")
        print(f"cost: ${cost / 1_000_000:.4f}")
        print(f"allowance: {spend.against(allowance_for('elevenlabs'))}")
        return 0

    try:
        settings = load_settings()
    except SettingsError as exc:
        print(exc, file=sys.stderr)
        return 2
    key = settings.elevenlabs_api_key
    if key is None:
        print("ELEVENLABS_API_KEY is not configured for the worker", file=sys.stderr)
        return 2

    cap = int(args.max_cost * 1_000_000) if args.max_cost else None
    if cap is not None and cost > cap:
        print(
            f"error: this set would cost ${cost / 1_000_000:.4f} and the cap is "
            f"${cap / 1_000_000:.2f}. Raise the cap or lower --sentences.",
            file=sys.stderr,
        )
        return 2

    out = Path(args.out) if args.out else repo_root() / "evals" / "stt_benchmark" / "synthetic"
    return asyncio.run(_generate(sentences, args.model, key.get_secret_value(), out))


async def _generate(sentences: tuple[str, ...], model: str, api_key: str, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240 - once, before any request
    tts = ElevenLabsTextToSpeech(api_key, timeout_s=60.0)
    clips: list[dict[str, object]] = []
    spent = 0
    try:
        for voice in DEFAULT_VOICES:
            for index, sentence in enumerate(sentences, start=1):
                name = f"{voice.label}-{index:02d}.wav"
                try:
                    speech = await tts.synthesize(model=model, voice=voice.voice_id, text=sentence)
                except TtsError as exc:
                    print(f"{name}: failed ({exc.code})", file=sys.stderr)
                    return 1
                (out / name).write_bytes(speech.audio)
                spent += tts_cost_micro_usd("elevenlabs", model, speech.characters)
                clips.append(
                    {
                        "id": f"{voice.label}-{index:02d}",
                        "audio": name,
                        "reference": sentence,
                        "provenance": "synthetic",
                        # A synthetic clip's "speaker" is the voice: it is what the per-speaker
                        # table groups by, and calling it a speaker would be a lie in a report.
                        "speaker": voice.label,
                        "first_language": "none",
                        "variety": voice.condition,
                        "device": f"elevenlabs:{model}",
                        "voice": voice.label,
                        "reference_source": "read",
                        "codec": "raw",
                    }
                )
                print(f"{name}  {speech.characters:>4} chars  {speech.latency_ms:>5} ms")
    finally:
        await tts.aclose()

    manifest = {
        "name": "synthetic-prescreen",
        "description": (
            f"Part A of the recording script, synthesized by ElevenLabs {model} in "
            f"{len(DEFAULT_VOICES)} voices: two Nigerian-accented and two general-accent controls. "
            "A pre-screen only — it may eliminate a recogniser and may never choose one "
            "(ADR-0020 §2), and the control condition is weaker than the second TTS vendor the "
            "ADR asks for."
        ),
        "clips": clips,
    }
    path = out / "manifest.yaml"
    path.write_text(yaml.safe_dump(manifest, sort_keys=False, allow_unicode=True), encoding="utf-8")
    print(f"\n{len(clips)} clips, ${spent / 1_000_000:.4f} spent")
    print(f"manifest: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
