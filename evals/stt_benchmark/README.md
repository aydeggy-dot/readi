# The accent benchmark

Does a speech recogniser understand Nigerian-accented English well enough for this product to be fair?
Every vendor publishes a word error rate; **none of them publishes one for a Nigerian engineer saying
"idempotent" over mobile data on a mid-range Android phone**, and neither Deepgram nor AssemblyAI
publishes any African English language code or figure at all. So we measure it ourselves.

The method is **ADR-0020**. Read it before changing anything here; the rules below are its consequences,
not preferences.

```bash
# Nothing spent: the stand-in recogniser over a set the harness generates for itself. Runs in `pnpm test`.
cd apps/ai-worker && uv run python -m readi_worker.stt_benchmark.run --smoke

# What a run would send and what it would cost — in minutes and characters against each free allowance.
cd apps/ai-worker && uv run python -m readi_worker.stt_benchmark.run \
  --manifest ../../evals/stt_benchmark/synthetic/manifest.yaml --providers deepgram,assemblyai --dry-run

# PAID. `--max-cost` is the approved figure; the run stops before the clip that would cross it.
cd apps/ai-worker && uv run python -m readi_worker.stt_benchmark.run \
  --manifest ../../evals/stt_benchmark/synthetic/manifest.yaml --providers deepgram,assemblyai --max-cost 0.20

# A finished run, re-rendered for nothing.
cd apps/ai-worker && uv run python -m readi_worker.stt_benchmark.run --render results/<file>.json

# Build the synthetic pre-screen set (PAID, a few cents of synthesis).
cd apps/ai-worker && uv run python -m readi_worker.stt_benchmark.synthesize --dry-run
```

## What is in here

|              |                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kit/`       | What a speaker is given: the recording script, the consent form (a **draft for a lawyer**), the phone instructions, and the transcription convention |
| `synthetic/` | The pre-screen set and its manifest, written by `synthesize.py`. Gitignored audio                                                                    |
| `real/`      | The consented recordings and their manifest, when they exist. Never committed                                                                        |
| `results/`   | One JSON per run. Every table is recomputed from these, so a report costs nothing to regenerate                                                      |

The code is `apps/ai-worker/readi_worker/stt_benchmark/`.

## The four rules that make a figure worth reading

**1. Synthetic audio may eliminate a provider. It may never choose one.** It is cleaner than real
speech, evenly paced, free of room noise and code-switching, and flatters everything. A provider is
eliminated on synthetic evidence only if it is worse by a wide margin on every source, and the report
refuses to pool synthetic clips with real ones into one number — `refuse_mixed` raises rather than warns,
because a warning above a number is read once and the number is quoted for ever.

**2. The reference is what a person wrote, having listened to the whole clip.** Two providers' output is
a draft; a person then corrects all of it. The tempting shortcut — adjudicate only where the two
providers disagree — is forbidden, and the reason is the point of the exercise: **when two recognisers
mishear a Nigerian accent, they mishear it the same way, so they agree**, and the error is never
surfaced. `--allow-draft` exists for scoring against an uncorrected draft and stamps the report as
agreement between machines rather than accuracy.

**3. Word error rate is per speaker as well as overall.** An average hides the one speaker a provider
fails, and a speaker is the fairness unit here exactly as a criterion is in `/evals`. A provider
excellent on seven speakers and unusable on the eighth has not passed.

**4. An unpriced provider does not run.** Intron publishes no rates at all, so counting their calls at
zero would put a free tier's real bill outside anything we measure. `--allow-unpriced` is the way
through and turns every cost figure in the report into a floor.

## What the harness reports, and why each one is there

- **Word error rate**, pooled rather than averaged, with substitutions, deletions and insertions kept
  apart: a deletion is a model that gave up, an insertion one that hallucinated, a substitution one that
  misheard — and for an accent benchmark the third is the interesting one.
- **Technical-term error rate**, over the terms from `content/glossary/tech_terms.txt` that the reference
  actually contains. This figure can disqualify a provider on its own. It is the same list we send as
  custom vocabulary, so a provider cannot be tuned for the test without being tuned for the product.
- **Filler retention**, which is not accuracy. The normalizer drops hesitations from both sides, so a
  vendor is not ranked on whether it writes "um" — but M6's delivery coaching counts filler words, so a
  vendor that discards them is less useful to us and that is said separately.
- **By variety**, because Pidgin and Nigerian English are scored apart. A Pidgin figure is partly a
  measurement of our own orthography convention and is read as an upper bound.
- **By synthesizer voice**, on the synthetic set, so no recogniser is judged chiefly on one vendor's
  audio.

## The normalizer is the load-bearing part

Word error rate is a function of what counts as the same word, so there is **one** normalizer
(`normalize.py`) with tests, and `kit/transcription-convention.md` is written to match it. Two notions of
sameness make every figure unreadable, and the difference between providers is smaller than the
difference between conventions.

It was also the first thing to go wrong: a plain substring alias replace turned "requests" into
"requestypescript" and cascaded "postgres" into "postgresqlsql". Aliases are applied at word boundaries
now, and the test that says so names the bug.

## Where audio lives, and where it does not

Benchmark audio is **not product data and not in the product**: never in the database, never in the
application's buckets, never committed here. The speakers are not users — they have no account — so their
consent is a signed form kept outside the application, and ADR-0020 §8 is the rule. `.gitignore` keeps
the audio out; the manifests and the results are what belong in git.
