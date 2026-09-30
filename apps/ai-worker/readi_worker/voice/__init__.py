"""Voice mode: the LiveKit interviewer (M5 phase 3, ADR-0019).

**Voice is a transport.** The agent drives the *same* engine as text mode, in-process, and pushes
what happened to the API afterwards — there is no second state machine, no second copy of a budget
rule, and no second set of fallbacks. `interview/` decides and performs the interview; everything
here is about getting sound in and out of it, and about what only voice can know.

The split inside this package is the same idea as `machine.py`/`service.py`:

- `acknowledgements.py`, `barge_in.py`, `latency.py` — pure. No I/O, no LiveKit, `now` passed in.
- `session.py` — the leg: one exchange per answer, the silence prompt, the prefetch, the push. It
  depends on the `transport.py` protocols and never on LiveKit, so the timing logic, the barge-in
  rule and the whole state of a leg are tested with no room and no server.
- `agent.py` — the only module that imports `livekit`. It maps a real room onto those protocols.
- `pinned_audio.py`, `streaming.py`, `api_client.py` — the three things that talk to the outside:
  the interviewer's own words rendered once, the live speech providers, and the API.
"""
