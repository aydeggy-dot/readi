"""The interview engine (M3): a deterministic state machine our code owns, in the worker.

- `machine.py` — the states and the transitions. Pure, `now` passed in, no I/O.
- `budgets.py` — the time and question budgets, and the reserves.
- `probes.py` — which planned follow-up to ask next, and the per-criterion coverage log.
- `calls.py` — the two model calls, their retries and their fallbacks.
- `service.py` — one exchange: receive, decide, speak, record.
- `state_store.py` — the live bundle and state in Redis.
- `fake_script.py` — the interview-aware stand-in for `LLM_PROVIDER=fake`.
- `router.py` — `POST /interview/advance`.
"""
