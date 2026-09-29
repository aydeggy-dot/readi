"""The accent benchmark: the normalizer, the metrics, the provenance rule, and the two refusals.

The normalizer's tests are the ones that matter most here. Word error rate is a function of what
counts as the same word, so a change to it silently moves every figure the milestone will rest on —
and the first version of it corrupted its own inputs ("requests" → "requestypescript") in a way no
vendor comparison would have explained.
"""

from pathlib import Path

import pytest
import yaml

from readi_worker.stt_benchmark import report as reporting
from readi_worker.stt_benchmark.manifest import Clip, Manifest, ManifestError, load_manifest
from readi_worker.stt_benchmark.metrics import (
    align,
    filler_retention,
    pooled,
    term_error_rate,
    term_scores,
)
from readi_worker.stt_benchmark.normalize import hesitation_count, in_words, normalize, tokens
from readi_worker.stt_benchmark.quota import Spend, allowance_for
from readi_worker.stt_benchmark.run import SMOKE_SET, main

# ---- The normalizer.


def test_case_and_punctuation_are_not_errors() -> None:
    assert normalize("We queue the write, and retry it.") == "we queue the write and retry it"


def test_aliases_apply_at_word_boundaries_only() -> None:
    """The bug this test exists for: a substring replace turned "requests" into "requestypescript"
    (ts → typescript) and cascaded "postgres" → "postgresql" → "postgresqlsql"."""
    assert normalize("We saw 12 requests") == "we saw twelve requests"
    assert normalize("PostgreSQL and postgres") == "postgresql and postgresql"
    assert normalize("adjust the statements") == "adjust the statements"


def test_spoken_and_written_forms_of_a_word_are_the_same_word() -> None:
    assert normalize("k8s") == normalize("kubernetes")
    assert normalize("Node.js") == normalize("nodejs")
    assert normalize("JS") == normalize("javascript")


def test_small_numbers_are_words_and_large_ones_are_left_alone() -> None:
    """A recogniser printing "80" is not wrong against a transcriber who wrote "eighty". Above 999
    the
    mapping is ambiguous — "2026" is two different sentences — so the convention handles it, not
    this."""
    assert normalize("we saw 80 requests") == normalize("we saw eighty requests")
    assert normalize("it took 300 ms") == normalize("it took three hundred ms")
    assert normalize("98%") == "ninety eight percent"
    assert normalize("in 2026") == "in 2026"
    assert in_words(0) == "zero"
    assert in_words(45) == "forty five"
    assert in_words(207) == "two hundred seven"
    assert in_words(2026) == "2026"


def test_a_transcribers_marker_is_not_a_word_the_recogniser_missed() -> None:
    """Left in, every `[unintelligible]` would be a free error against a recogniser that had nothing
    to write down there."""
    assert normalize("the [unintelligible] index") == "the index"
    assert normalize("we deploy (laughs) on Fridays") == "we deploy on fridays"


def test_hesitations_are_dropped_from_the_score_and_counted_apart() -> None:
    assert tokens("uhhh the mmm cache um") == ["the", "cache"]
    assert hesitation_count("uhhh the mmm cache um") == 3
    # Lexical fillers carry meaning and are scored as the words they are.
    assert "like" in tokens("it was like a queue")


# ---- The metrics.


def test_the_three_error_kinds_are_kept_apart() -> None:
    """They mean different things about a recogniser: a deletion is a model that gave up, an
    insertion
    one that hallucinated, a substitution one that misheard — and for an accent benchmark the third
    is the interesting one."""
    alignment = align("we add an index on the column", "we add an indecks on the")
    assert alignment.reference_words == 7
    assert alignment.substitutions == 1
    assert alignment.deletions == 1
    assert alignment.insertions == 0
    assert alignment.wer == pytest.approx(2 / 7)


def test_an_inserting_recogniser_can_score_above_one() -> None:
    """And it is printed rather than clamped, because a figure above 100% is information."""
    alignment = align("okay", "okay so what i think is")
    assert alignment.wer > 1


def test_word_error_rate_is_pooled_not_averaged() -> None:
    """Averaging per-clip rates weights a five-word clip the same as a two-minute answer."""
    short = align("yes", "no")
    long = align(" ".join(["word"] * 99), " ".join(["word"] * 99))
    assert pooled([short, long]) == pytest.approx(1 / 100)


def test_a_multi_word_term_must_appear_as_a_sequence() -> None:
    """Otherwise "cache invalidation" counts as heard because both words turn up somewhere, which is
    the sort of near-miss that makes a lenient benchmark useless."""
    glossary = ["cache invalidation", "idempotent"]
    scattered = term_scores(
        "cache invalidation is hard and idempotent writes help",
        "the cache is hard and invalidation of idempotent writes help",
        glossary,
    )
    by_term = {score.term: score for score in scattered}
    assert by_term["cache invalidation"].recognised == 0
    assert by_term["idempotent"].recognised == 1
    assert term_error_rate(scattered) == pytest.approx(0.5)


def test_a_term_the_reference_never_said_is_not_scored() -> None:
    assert term_scores("we add an index", "we add an index", ["Kubernetes"]) == []


def test_filler_retention_is_none_when_there_was_nothing_to_retain() -> None:
    assert filler_retention("the cache", "the cache") is None
    assert filler_retention("um the cache", "the cache") == 0.0
    assert filler_retention("um the cache", "um uh the cache") == 2.0


# ---- The manifest.


def _write_manifest(directory: Path, **overrides: object) -> Path:
    (directory / "clip.wav").write_bytes(b"RIFF")
    clip: dict[str, object] = {
        "id": "c1",
        "audio": "clip.wav",
        "reference": "we queue the write",
        "provenance": "real",
        "speaker": "s1",
        **overrides,
    }
    path = directory / "manifest.yaml"
    path.write_text(
        yaml.safe_dump({"name": "set", "description": "a set", "clips": [clip]}), encoding="utf-8"
    )
    return path


def test_a_manifest_that_names_missing_audio_is_refused(tmp_path: Path) -> None:
    """Checked up front: a run that transcribes eleven of twelve clips and then fails has spent
    money
    for a report nobody can read against the set it claims to be about."""
    path = _write_manifest(tmp_path, audio="not-there.wav")
    with pytest.raises(ManifestError, match="no audio"):
        load_manifest(path)


def test_a_manifest_loads_with_its_root(tmp_path: Path) -> None:
    manifest, root = load_manifest(_write_manifest(tmp_path))
    assert root == tmp_path
    assert manifest.speakers == ["s1"]
    assert manifest.provenances == {"real"}


def test_an_unknown_field_is_refused(tmp_path: Path) -> None:
    """`extra="forbid"`: a misspelt `provenence` would otherwise default to a figure being
    pooled."""
    path = _write_manifest(tmp_path, provenence="synthetic")
    with pytest.raises(ManifestError, match="not a manifest"):
        load_manifest(path)


# ---- The provenance rule.


def _result(provenance: str) -> reporting.ClipResult:
    clip = Clip(
        id=f"c-{provenance}",
        audio="a.wav",
        reference="we queue the write",
        provenance=provenance,  # type: ignore[arg-type]  # the literal is what this test varies
        speaker="s1",
    )
    return reporting.score(
        clip,
        "fake",
        "fake",
        "we queue the write",
        glossary=[],
        audio_seconds=1.0,
        latency_ms=1,
        cost_micro_usd=0,
    )


def test_a_figure_over_mixed_provenance_is_refused() -> None:
    """Synthetic audio is cleaner than real speech and flatters every recogniser, so a pooled figure
    would mean nothing — and a warning above a number is read once while the number is quoted for
    ever."""
    with pytest.raises(reporting.ProvenanceError, match="would mean nothing"):
        reporting.refuse_mixed([_result("real"), _result("synthetic")])

    assert reporting.refuse_mixed([_result("real")]) == "real"


def test_the_report_prints_the_two_provenances_apart() -> None:
    run = reporting.Run(
        manifest="mixed",
        description="both kinds",
        started_at="2026-09-29T00:00:00+00:00",
        providers=["fake"],
        results=[_result("real"), _result("synthetic")],
    )
    manifest = Manifest(
        name="mixed",
        description="both kinds",
        clips=[
            Clip(id="c-real", audio="a.wav", reference="x", provenance="real", speaker="s1"),
            Clip(
                id="c-synthetic", audio="a.wav", reference="x", provenance="synthetic", speaker="s1"
            ),
        ],
    )
    rendered = reporting.render(run, manifest)
    assert "## Real speech — this is what decides" in rendered
    assert "May never choose one" in rendered


def test_a_draft_reference_is_declared_on_the_face_of_the_report() -> None:
    run = reporting.Run(
        manifest="set",
        description="d",
        started_at="2026-09-29T00:00:00+00:00",
        providers=["fake"],
        results=[_result("real")],
        draft_references=True,
        unpriced_providers=["intron"],
    )
    rendered = reporting.render(
        run,
        Manifest(
            name="set",
            description="d",
            clips=[
                Clip(id="c-real", audio="a.wav", reference="x", provenance="real", speaker="s1")
            ],
        ),
    )
    assert "uncorrected two-provider draft" in rendered
    assert "Cost is a floor" in rendered


# ---- The allowance, in the units that stop a run.


def test_a_recogniser_allowance_is_dollars_and_a_synthesizer_allowance_is_characters() -> None:
    """On a free tier "$0.30" stops nothing and "4,000 characters left" stops everything."""
    deepgram = Spend(
        "deepgram", units=900, unit_name="audio seconds", cost_micro_usd=115_500, priced=True
    )
    assert "of $200.00 credit" in deepgram.against(allowance_for("deepgram"))

    eleven = Spend(
        "elevenlabs", units=2_600, unit_name="characters", cost_micro_usd=104_000, priced=True
    )
    against = eleven.against(allowance_for("elevenlabs"))
    assert "2,600 of 30,000 characters" in against
    assert "8.7%" in against


def test_an_unknown_allowance_says_so_rather_than_implying_zero() -> None:
    assert (
        Spend("intron", 60, "audio seconds", 0, priced=False).against(allowance_for("intron"))
        == "allowance unknown"
    )


# ---- The command line.


def test_the_smoke_run_scores_its_own_perturbations_exactly(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The regression lock. The three clips differ from their references in ways somebody chose — an
    exact match, two substitutions and a deletion, and a dropped hesitation — so these figures move
    only if the normalizer or the alignment moves. A stand-in returning something unrelated would
    score ~100% and prove only that the pipeline runs."""
    assert main(["--smoke"]) == 0

    out = capsys.readouterr().out
    assert "WER   0.0%" in out
    assert "WER  27.3%" in out
    assert "WER   9.1%" in out
    # Pooled over 4 errors in 32 reference words, and the two glossary terms of clip 1 against the
    # mangled "index" of clip 2.
    assert "| fake | 12.5% | 20.0% | 0% |" in out


def test_the_smoke_set_is_a_perturbation_of_its_own_references() -> None:
    """If somebody makes the hypotheses identical, the harness still passes and measures nothing."""
    assert any(reference != hypothesis for _s, reference, hypothesis in SMOKE_SET)
    assert any(reference == hypothesis for _s, reference, hypothesis in SMOKE_SET)


def test_an_unpriced_provider_is_refused_by_name(
    capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    """The owner's rule one level up from startup: a free tier whose calls are counted at zero is a
    bill nobody sees."""
    path = _write_manifest(tmp_path)
    assert main(["--manifest", str(path), "--providers", "intron", "--dry-run"]) == 2
    assert "no published rate for intron" in capsys.readouterr().err


def test_an_unpriced_provider_runs_when_that_is_said_out_loud(tmp_path: Path) -> None:
    path = _write_manifest(tmp_path)
    assert (
        main(["--manifest", str(path), "--providers", "intron", "--dry-run", "--allow-unpriced"])
        == 0
    )


def test_a_draft_reference_is_refused_without_the_switch(
    capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    """ADR-0020 §4: two recognisers that mishear an accent the same way agree, so a draft nobody has
    listened to is agreement between machines rather than accuracy."""
    path = _write_manifest(tmp_path, reference_source="draft")
    assert main(["--manifest", str(path), "--providers", "deepgram", "--dry-run"]) == 2
    assert "uncorrected draft reference" in capsys.readouterr().err


def test_the_dry_run_prices_in_units_against_the_allowance(
    capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    path = _write_manifest(tmp_path)
    assert main(["--manifest", str(path), "--providers", "deepgram,assemblyai", "--dry-run"]) == 0

    out = capsys.readouterr().out
    assert "against the free allowance" in out
    assert "credit" in out
    # And it sends nothing: a dry run that transcribed one clip to estimate the rest would be a paid
    # run.
    assert "WER" not in out
