"""Per-answer evaluation (spec §4.4, §6.2; M4).

The evaluator is the first and only model call that receives a rubric, and the first whose
output is a **score** rather than wording. Both facts shape this package:

- `evidence.py` checks that every quote the model attributes to the candidate is really
  something the candidate said. That is the honesty the report rests on, and it is also the
  strongest code-level defence against prompt injection: an answer that talks the model into
  full marks still has to produce quotes that are in the transcript.
- `calls.py` makes the call, retries invalid output at most twice, and never retries a refusal.
- `service.py` normalises what comes back and decides whether it may be stored at all.
"""
