# Harness runs

One JSON file per run: `<UTC timestamp>-<model>.json`, written by
`readi_worker.evals.run`. Each holds every per-criterion score, every verified-quote count and every
call's tokens, latency and cost.

They are committed on purpose. A model recommendation whose measurements are not in the repository is
an assertion, and every figure in every report — the fairness table, the separations, the cost
arithmetic, the cross-model comparison — is recomputed from these files rather than stored as a
summary. That is what lets a run be re-cut months later, by kind or by role or against a gold set that
did not exist when it was made, without paying for it again.

There is no candidate data in them: the synthetic answers are model-written, and the ids are `uuid5`
of the case name (`readi_worker/evals/dataset.py`).
