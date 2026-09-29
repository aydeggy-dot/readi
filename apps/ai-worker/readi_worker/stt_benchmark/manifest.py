"""What a benchmark set is: clips, references, and the facts that decide whether a figure may be
read.

A manifest is YAML beside the audio, and every clip declares five things the report cannot be honest
without:

- **`provenance`** — `synthetic` or `real`. ADR-0020 §1: every report states which it is reading,
  per
  figure, and **refuses to print a combined figure over mixed provenance**. Synthetic audio may
  eliminate a provider and may never choose one.
- **`speaker`** — a code, never a name. The per-speaker word error rate is the fairness figure, and
  an
  average over speakers hides the one a provider fails.
- **`first_language`** and **`variety`** — Yoruba, Igbo, Hausa or other; Nigerian English or Pidgin.
  A
  recogniser that collapses on code-switching fails mid-interview, so the two are scored apart.
- **`device`** — the phone it was recorded on, because "ordinary conditions" is the point (ADR-0020
  §3).

And one that only the synthetic set has: **`voice`**, the synthesizer voice that produced the clip,
so a figure can be read per source. A recogniser must not be judged chiefly on its own vendor's
audio.

**The reference is what a person wrote**, following
`evals/stt_benchmark/kit/transcription-convention.md` (ADR-0020 §4). `reference_source` records how
it was made — `read` for the scripted part, whose text is known in advance, and `human` for a spoken
answer a person transcribed. A manifest may not claim `human` for something no person read:
`--allow-draft` is the explicit switch for scoring against an uncorrected two-provider draft, and it
stamps the report.
"""

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

Provenance = Literal["synthetic", "real"]
Variety = Literal["nigerian_english", "pidgin", "control"]
ReferenceSource = Literal["read", "human", "draft"]


class Clip(BaseModel):
    """One audio file and the transcript it is scored against."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1, max_length=80)
    #: Relative to the manifest's own directory, so a set can be moved without editing it.
    audio: str = Field(min_length=1)
    reference: str = Field(min_length=1)
    provenance: Provenance
    #: A code (`s1`, `s2`), never a name: these clips are read by people on our side.
    speaker: str = Field(min_length=1, max_length=40)
    first_language: str = Field(default="unknown", max_length=40)
    variety: Variety = "nigerian_english"
    device: str = Field(default="unknown", max_length=80)
    #: Synthetic clips only: which synthesizer voice produced it.
    voice: str | None = Field(default=None, max_length=80)
    reference_source: ReferenceSource = "human"
    #: What the clip has been re-encoded through, if anything — `raw` or e.g. `opus_24k`. ADR-0020
    #: §6 scores both, because the product receives Opus and a phone's recorder does not produce it.
    codec: str = Field(default="raw", max_length=40)
    #: Optional: where the same audio can be fetched from. Intron's API takes a URL, not bytes.
    audio_url: str | None = None

    def path(self, root: Path) -> Path:
        return root / self.audio


class Manifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=1, max_length=80)
    #: One sentence on where these clips came from — the report prints it, so a reader of a number
    #: knows what it is a number about.
    description: str = Field(min_length=1, max_length=400)
    clips: list[Clip] = Field(min_length=1)

    @property
    def provenances(self) -> set[Provenance]:
        return {clip.provenance for clip in self.clips}

    @property
    def speakers(self) -> list[str]:
        seen: list[str] = []
        for clip in self.clips:
            if clip.speaker not in seen:
                seen.append(clip.speaker)
        return seen


class ManifestError(RuntimeError):
    """The manifest could not be read, or describes clips that are not there."""


def load_manifest(path: Path) -> tuple[Manifest, Path]:
    """The manifest and the directory its relative paths are relative to.

    Every clip's audio is checked to exist here rather than at the point of use: a run that
    transcribes eleven of twelve clips and then fails has spent money for a report nobody can read
    against the set it claims to be about.
    """
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ManifestError(f"cannot read {path}: {exc.strerror}") from None
    except yaml.YAMLError as exc:
        raise ManifestError(f"{path} is not valid YAML: {exc}") from None

    try:
        manifest = Manifest.model_validate(raw)
    except ValueError as exc:
        raise ManifestError(f"{path} is not a manifest: {exc}") from None

    root = path.parent
    missing = [clip.id for clip in manifest.clips if not clip.path(root).is_file()]
    if missing:
        raise ManifestError(f"{path} names clips with no audio: {', '.join(missing)}")

    ids = [clip.id for clip in manifest.clips]
    if len(set(ids)) != len(ids):
        raise ManifestError(f"{path} has two clips with the same id")
    return manifest, root
