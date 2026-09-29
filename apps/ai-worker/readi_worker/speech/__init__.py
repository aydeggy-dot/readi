"""Speech adapters (M5, CLAUDE.md "AI provider adapters"): recognition and synthesis.

- `base.py` — the two Protocols and their results. **Batch**, on purpose: the live conversation runs
  on LiveKit's plugin for the chosen provider (ADR-0019 §2), and these are what the accent
  benchmark, the pre-rendered interviewer audio and the voice panel need.
- `providers.py` — which providers this build can construct.
- `pricing.py` — the rates, in the units the vendors publish. An unpriced provider cannot start.
- `calls.py` — a call as an `AiCallRecord`: seconds for recognition, characters for synthesis.
- `glossary.py` — `content/glossary/tech_terms.txt`, the custom vocabulary and the benchmark's
  tech-term subset, loaded once for both.
- `fake.py` — deterministic recognition and synthesis: no key, no network, no cost.
- `factory.py` — the one place a provider name becomes an implementation.
"""
