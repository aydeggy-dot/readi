"""The accent benchmark (M5, ADR-0020): does a recogniser understand Nigerian-accented English?

Choosing a speech-to-text provider is a fairness decision, not a procurement one. Every vendor
publishes a word error rate; none publishes one for a Nigerian engineer saying "idempotent" over a
mobile network on a mid-range Android phone, and neither Deepgram nor AssemblyAI publishes any
African English language code or figure at all. This is how we find out for ourselves.

- `manifest.py` — what a set is: clips, references, and the facts a figure cannot be honest without.
- `normalize.py` — the one normalizer, because WER is a function of what counts as the same word.
- `metrics.py` — word error rate overall and per speaker, technical-term error rate, filler
  retention.
- `quota.py` — what a run will spend in the units that stop it, which on a free tier is not dollars.
- `report.py` — the tables, and the refusal to pool synthetic clips with real ones.
- `run.py` — the command line: `--smoke`, `--dry-run`, `--max-cost`, `--render`.

Its counterpart is `/evals/stt_benchmark`, which holds the manifests, the audio, the results and the
recording kit; this package is the code.
"""
