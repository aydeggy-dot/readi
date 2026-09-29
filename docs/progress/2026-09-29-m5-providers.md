# M5 — the five vendors, priced and configured (phase 2, part 1)

> Part 2 — the four adapters, the benchmark harness and the pre-screen — is
> `2026-09-30-m5-phase-2.md`. This file remains the reference for the rates and the vendors' terms.

**Branch `feat/m5-voice`.** The owner created accounts on 2026-09-29: **AssemblyAI**, **Deepgram**,
**ElevenLabs**, **LiveKit** and **Intron Health ("Sahara")** — all free tiers except ElevenLabs
Starter at $6/month. Every figure below was read from the vendor's own page **on 2026-09-29** and the
page is named beside it; the same figures are in `readi_worker/speech/pricing.py` and
`readi_worker/speech/providers.py` with their dates, because a rate in a handover rots and a rate in a
table can be re-read against the page it came from.

Nothing here has received candidate data. `VOICE_ENABLED` is false, `STT_PROVIDER` and `TTS_PROVIDER`
are `fake`, and the only real request made so far is one read-only voice listing (below).

## The rates

| | path | rate | basis | free tier |
| --- | --- | --- | --- | --- |
| Deepgram nova-3 | streaming | **$0.0077/min** (a "limited-time promotional" $0.0048 was live on the date checked, with no published end date) | audio | $200 credit |
| Deepgram nova-3 | batch | $0.0043/min | audio | ” |
| Deepgram flux-general-en | streaming | $0.0077/min | audio | ” |
| AssemblyAI universal-streaming-en | streaming | **$0.15/hour** | **session** | $50 credit |
| AssemblyAI universal-3-6-pro | streaming | $0.45/hour | session | ” |
| AssemblyAI universal-3-5-pro | batch | $0.21/hour | audio | ” |
| AssemblyAI universal-2 | batch | $0.15/hour | audio | ” |
| ElevenLabs flash v2.5 / v3 conversational | — | **$0.04 / 1k characters** | characters | Starter $6 |
| ElevenLabs multilingual v2 / v3 | — | $0.08 / 1k characters | characters | ” |
| LiveKit WebRTC participant | — | $0.0005/min beyond quota | participant-minutes | 5,000 min |
| LiveKit agent session (cloud-hosted agents) | — | $0.01/min | agent-minutes | 1,000 min |
| Intron / Sahara | — | **nothing published, anywhere** | — | unknown |

Sources: `deepgram.com/pricing`, `assemblyai.com/pricing`, `elevenlabs.io/pricing/api`,
`livekit.com/pricing`. **The regular Deepgram rate is what the code stores**, not the promotional one,
for the same reason `_billable_seconds` rounds up: an estimate should never come in under the invoice.

**A 15-minute voice session, on these accounts: ≈36¢** — the text baseline of 16.1¢ (2.4¢ interview +
13.7¢ evaluation) plus ~7¢ recognition, ~11¢ synthesis at Flash rates, ~1.5¢ LiveKit. That is the
bottom of the 40–60¢ the plan estimated, and it becomes ~49¢ if the LiveKit question below goes the
wrong way.

## Five things that are now facts in code rather than notes

1. **A rate belongs to a (provider, model, path), and it carries a basis.** Deepgram bills minutes of
   audio; AssemblyAI's streaming product bills minutes the **socket was open** — "A WebSocket open for
   60 minutes with 30 minutes of audio sent is billed for 60 minutes", and an un-terminated session
   auto-closes at three hours and bills all three. An interview is mostly silence while the candidate
   thinks, so reading one rate as the other is wrong by about threefold in the direction that flatters
   us. `stt_cost_micro_usd` **raises** rather than guessing when a session-billed vendor is priced on
   audio alone. It also means the agent closing its socket is an operational rule, not tidiness.
2. **No live path accepts our glossary.** Deepgram caps keyterms at 500 tokens ("up to 100 terms");
   AssemblyAI streaming is a hard 100, batch 1,000 on Universal-3.5 Pro and 200 on Universal-2. Our
   file holds **302**. `glossary_for(settings, path)` applies the vendor's own cap, so the file's
   priority order now decides which technical words a candidate can afford to have misheard — and
   Intron, which documents no custom-vocabulary feature at all, has a cap of 0 and gets nothing.
3. **Two privacy mechanisms live in code, and one does not.** Deepgram: `mip_opt_out=true` on every
   request (their page never says whether self-serve accounts are enrolled by default — an answer is
   owed in writing). AssemblyAI: the **EU host** is the mechanism, because that is the one
   configuration in which they say they do not train on submitted files, so changing that base URL
   changes what we have promised a candidate. ElevenLabs: nothing code can assert — Zero Retention is
   Enterprise-only and the opt-out is a dashboard toggle, which the owner switched off on 2026-09-29.
   A test asserts that every vendor declares something; silence is the one state not allowed.
4. **Intron's transcripts are LLM-post-corrected by default**, so `use_disable_llm_corrections=true`
   goes on every request. For a benchmark that correction is a confound — we would be scoring a
   language model's repair of a recogniser — and for this product it is a hallucination risk in the
   one place we cannot afford one, because the report quotes the candidate's exact words back to them.
5. **An unpriced provider cannot start**, and Intron is the live example rather than a hypothetical:
   they publish no rates at all, so the worker refuses to run with them configured however good their
   accent coverage proves to be. The benchmark will need the same rule with an explicit
   `--allow-unpriced` that stamps the report "cost unknown", or a free tier becomes an invisible bill.

## The owner's decisions, 2026-09-29

1. **AssemblyAI on EU is the live-path default** before the benchmark decides, with Deepgram
   implemented alongside as the comparison — chosen on the written no-training guarantee, not on
   accuracy, which is phase 6's to settle.
2. **ElevenLabs retention is a known gap accepted for development only.** "Improve the models for
   everyone" is off; Zero Retention needs Enterprise. Recorded as a gap in
   `docs/privacy/subprocessors.md`, to revisit before real users.
3. **Flash v2.5 for live turns, the higher-quality model for the pre-rendered lines.** Generating the
   ~1,240 fixed characters once costs about ten cents ever, so quality there is free.
4. **One read-only voice listing was approved and run** (below).
5. **Sahara is benchmark-only** — batch, labelled an accuracy ceiling, never the live path.

## What the voice listing found

`uv run python -m readi_worker.tools.list_voices --accent nigerian`: **168 voices** with
`accent=nigerian`, **22 of them tagged `conversational`**, all at rate 1.0 (no credit multiplier), and
most with a **730-day notice period**. So the phase-7 panel has a real shortlist, and
`en-nigerian` being a first-class filter is the reason ElevenLabs is the synthesizer: Cartesia
publishes nothing closer than `en-ZA`, at the same price.

The tool reads the key from the worker's own configuration, so it never reaches a command line, a
shell history or a transcript (CLAUDE.md §7.9 from the other side). Notice period matters more than it
looks: a library voice is somebody else's Professional Voice Clone and they may withdraw it — audio
already generated survives a withdrawal for good, **live synthesis does not**. Pre-rendering the
interviewer's fixed lines is therefore insurance as well as latency and cost.

## Open questions, owned by the owner

| | what | why it matters |
| --- | --- | --- |
| **LiveKit** | Is a **self-hosted** agent joining a Cloud room billed as a WebRTC participant minute or an agent session minute? Their docs define agent minutes for agents *deployed to LiveKit Cloud* and are silent on ours | $0.0005/min against $0.01/min — 20×, and the difference between rounding error and the second-largest line in the bill |
| **LiveKit** | Region pinning is not self-service; ask support, and ask what they recommend for Nigeria | Their Africa group is **one location in South Africa with no in-region redundancy**, and pinning removes failover. Europe is the alternative. Phase 8 measures it |
| **Intron** | Price, and a written answer on retention and training for the **voice API** | Their only policy and terms are dated January 2020, before the API existed. No consented human recording may be sent until this is answered |
| **Deepgram** | Are self-serve accounts enrolled in the Model Improvement Programme by default? | We opt out on every request regardless; the answer belongs in the subprocessor file |

## What is not done

- **No adapter is implemented yet.** The protocols, the fakes, the prices, the vendor facts and the
  refusals are in; the four HTTP clients and the benchmark harness are the rest of phase 2.
- **`apps/api` has no LiveKit credentials yet** — checked with `scripts/env-has.sh`, all three read
  `missing` on 2026-09-29. Nothing reads them until phase 4.
- **LiveKit's rates are not in `speech/pricing.py`**, deliberately: it prices recognition and
  synthesis, and media minutes are neither. They belong with M9's cost dashboard.
