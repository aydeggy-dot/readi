# M5 — Voice mode: the LiveKit interviewer, the accent benchmark, and a latency budget that can be tested

**Branch `feat/m5-voice`, from `main` at `9afb977`.** Plan agreed by the owner on 2026-09-29 with two
amendments (decisions 3 and 6 below). ADRs written at phase 0: **ADR-0019** (transport, who drives,
the latency ladder) and **ADR-0020** (the benchmark's method).

Read with `docs/PROMPTS.md` "M5", spec §4.3 and §8, CLAUDE.md §5 ("Interview engine", "AI provider
adapters", "Performance & low bandwidth", "Data & privacy"), and ADR-0016, whose open question this
milestone answers.

## Context

M3 built a deterministic engine in the worker and a chat screen; M4 scored what it produced. M5
changes the transport and nothing about the interview: the same state machine, the same budgets, the
same probes, the same fallbacks — reached by speech.

Three things make it harder than "add audio".

1. **There is no API request to answer.** In text mode every exchange is initiated by the API, so
   everything to be persisted rides the response home. When the candidate stops speaking, nobody
   asked us anything. ADR-0016 left that push direction open for here.
2. **Spec §8's ~1 s turn target is not reachable as written**, and the arithmetic is in ADR-0019 §5.
   The honest answer is two numbers — first audio, and the substantive reply — and a ladder of levers
   applied cheapest first.
3. **Choosing a speech-to-text provider is a fairness decision** (spec §8, product principle 3), and
   M4 has already shown what happens when a model's idea of Nigerian English stands in for the real
   thing. ADR-0020 is the method that keeps the two apart.

## The owner's decisions, taken 2026-09-29 before any code was written

1. **The agent drives the engine in-process and pushes turns to the API** — ADR-0016's recorded
   intent, not a new idea. Rejected alternative: the agent calls `/advance` and the API stays the
   driver, which puts an HTTP hop and a database write between the model's answer and the first audio
   byte. See ADR-0019 §1–§3.
2. **Spec §8's latency target is amended to two measurable numbers**: first audio under 250 ms p50,
   the substantive reply within 1.5–2.5 s p50, measured end-of-speech to first audio byte. A target
   the stages cannot produce is not a target; it is a line nobody will ever test against.
3. **The interviewer acknowledges immediately, in the engine's own pre-rendered words — a rotated
   set, never evaluative.** *(Amended by the owner.)* Not one fixed line: a small set of short
   neutral acknowledgements ("Okay.", "Mm-hm, got it.", "Thanks.", "Alright.") chosen deterministically
   from the session id and the turn, as `transitions.py` already chooses a connective, so it does not
   sound robotic by the third question. **Nothing in the set may sound like approval**: a candidate
   who has just answered badly must not hear praise that their report then contradicts. A test asserts
   the set contains no evaluative word.
4. **Levers 1 and 2 now; 3 and 4 only if phase 8's numbers ask for them; the two calls are never
   merged.** Pre-rendered engine audio and prefetching the next opening are free and carry no risk.
   Interim-transcript coverage and speculative probe phrasing cost tokens and are held until there is
   a measurement to justify them. Merging coverage and phrasing into one call would let the model
   effectively choose the probe, which is what `planned_follow_ups` exists to prevent.
5. **Synthetic audio may eliminate a provider; it may never choose one.** And only on a wide margin
   across at least two text-to-speech sources. ADR-0020 §2.
6. **The reference transcripts are made by a person listening to every clip.** *(Amended by the
   owner.)* Two providers' output is a draft; a person listens to every clip end to end and corrects
   the whole draft. The disagreement-only shortcut is rejected because **when two recognizers mishear
   a Nigerian accent the same way they agree** — so the error is never surfaced and nobody checks it,
   which is precisely the failure the benchmark exists to find. ADR-0020 §4.
7. **Build the throwaway staging deployment.** One small VM in the chosen region running the existing
   compose stack plus the agent, HTTPS through a Cloudflare Tunnel (a microphone needs a secure
   context, so an IP address will not do), one seeded staff account, `noindex`, no sign-up, torn down
   after the measurement. Without it the milestone's acceptance criterion cannot be met, and WSL's NAT
   makes local timing meaningless.
8. **The M5/M6 line on delivery coaching**: M5 stores the word timings and computes the metrics at
   session end while they are hot; M6 owns the filler list, the report section, the coaching copy and
   the `communication` component of readiness. Versioning coaching copy twice is waste.
9. **No audio is stored at all unless `recording_storage` is granted**, and the `audio_processing`
   consent copy goes to **v2 now**, while re-consent costs nothing because there are no real accounts.
   After the pilot it would send every candidate back to the consent screen.
10. **One default Nigerian-accented interviewer voice**, chosen by a blind panel, plus one alternative
    behind a flag.

## The latency budget, and what each lever buys

| Stage | p50, estimated | After levers 1–2 |
| --- | --- | --- |
| turn detection (VAD + semantic turn detector) | 250–700 ms | unchanged |
| STT final after endpoint | 100–300 ms | unchanged |
| first audio the candidate hears | — | **pre-rendered acknowledgement, tens of ms** |
| coverage call | 800–1,500 ms | unchanged (on the path) |
| phrasing call | 700–1,200 ms | **0 for an opening** (prefetched) |
| TTS first byte | 150–400 ms | 0 for pinned audio |
| **end-of-speech → substantive audio** | **2.0–4.1 s** | **~1.2–2.5 s** |

Levers 3 (coverage on the interim transcript) and 4 (speculative probe phrasing) would take the
follow-up path towards the opening path's number, at the cost of tokens. They are phase 8 decisions
with measurements in front of them, exactly as `tasks/todo.md` said M5 should treat them.

## Cost per session, beside the text figure

Text today, measured: **15 min ≈ 16¢** (2.4¢ of interview, 13.7¢ of evaluation); 30 min ≈ 32¢.

Voice adds, for 15 minutes — the structure is firm, the prices are order-of-magnitude until phase 2
checks the vendor pages, which is a task and not an assumption:

| | unit | estimate |
| --- | --- | --- |
| STT | ~15 streamed minutes (≈11 if the stream pauses while the interviewer speaks) | 9–13¢ |
| TTS | ~2,400–3,000 characters of interviewer speech | 5–25¢ — **the widest lever; the voice choice decides it** |
| LiveKit | ~30 participant-minutes | 1–2¢ |
| levers 3–4, if built | extra short calls | +2–4¢ |
| **voice, 15 minutes, all in** | | **≈ 40–60¢, or 2.5–3.5× text** |

The headline for M8: **voice cost is dominated by the speech vendors, not by the model**, which makes
how much the interviewer says a cost lever as well as a product one.

## Phases

Stop at the end of each (working agreement). Phases 0–5 need nothing from the owner but the provider
accounts at phase 2.

### Phase 0 — the decisions, the ADRs and the contracts · **done 2026-09-29**

ADR-0019, ADR-0020, this plan, and the cross-language contracts phases 3 and 4 will implement: the
voice token the browser gets, the three internal routes the agent uses, word timings and barge-in
facts on a turn, and the per-turn latency sample. No providers, no migration, no routes yet.

### Phase 1 — the adapters and their fakes · **done 2026-09-29**

`SpeechToText` and `TextToSpeech` protocols beside `LLMClient` and `EmbeddingProvider`, with
deterministic fakes (a scripted transcript with word timings; a silent WAV of a plausible length), the
`stt`/`tts` prices, and `/content/glossary/tech_terms.txt`. Every call reports an `AiCallRecord` with
`unit_kind` `seconds` or `characters` — the enum already has both, and so does the database.

**The protocols are batch, and that is a decision taken here.** A live conversation needs streaming
recognition with interim results and endpointing, and that path is LiveKit Agents' plugin for the
chosen provider: writing our own streaming stack beside it would be two implementations of one thing,
and the plugin is what `AgentSession` expects to be handed. What phase 3 wraps around the plugin is
provider selection and `AiCallRecord` reporting — the two jobs this interface does — so the seam
CLAUDE.md asks for is kept without pretending we hand-rolled a realtime pipeline. What is left for the
batch interfaces is not small: the benchmark transcribes files (phase 2), the pinned interviewer audio
is synthesized once and cached (lever 1), the voice panel compares voices (phase 7), and the fakes are
what let an end-to-end voice test run with no key and no cost (phase 5).

**An unpriced provider cannot start** (owner's instruction, 2026-09-29). `Settings` refuses a
configuration whose STT or TTS provider and model have no rate in `speech/pricing.py`: a language
model bills per call and an unpriced one is a zero somebody notices that day, while recognition and
synthesis bill per minute and per character, monthly, in arrears — so an unpriced one is a cost nobody
sees until the invoice.

### Phase 2 — the benchmark harness, and the synthetic pre-screen

`readi_worker/stt_benchmark/` behind `/evals/stt_benchmark`: the manifest, the pinned normalizer with
its tests, WER overall and per speaker, the tech-term error rate over the glossary, time-to-final,
cost per minute, and the provenance rule that refuses a mixed figure. `--smoke` inside `pnpm test` so
it cannot rot, `--dry-run` that prices before spending, `--max-cost`. Then generate the synthetic set
from two TTS vendors and run the pre-screen (paid, priced, approved, capped). Also: the recording kit
for phase 6 — script, consent form, phone instructions — for the owner to review.

### Phase 3 — the voice agent

`readi_worker/voice/`: a LiveKit agent driving `InterviewService.advance()` in-process; the pinned
acknowledgement set with its no-praise test; pre-rendered engine audio; the next opening prefetched;
turn detection, barge-in, the silence prompt, reconnection; per-turn latency samples; the push to the
API. Unit-tested through a transport-agnostic session driver, so the engine and the timing logic need
no LiveKit to test.

### Phase 4 — the API's half

The voice token route (ownership, `audio_processing` consent, voice-minute allowance, short-lived),
the three internal routes, the `usage_ledger` table and a `VoiceAllowance` service with one seam for
M8's entitlements, the migration for word timings and latency samples, the fallback bookkeeping and
its analytics event, and p50/p95 per session in the admin view.

### Phase 5 — the web voice UI

Mic permission, device check with a level meter, captions always visible (interim grey, finals
committed), connection-quality indicator, mute, end, automatic fallback to text with a spoken and
written explanation. 360px, reduced motion, e2e driven by Chrome's fake media device against the fake
STT and TTS, so a run costs nothing and reaches no vendor.

### Phase 6 — the real accent set, and the provider decision

Recordings in, references transcribed by a person against the convention, the confirm run, the
provider chosen with the real numbers beside it, ADR-0020's decision recorded, subprocessors updated.

### Phase 7 — the interviewer's voice

The same five real interviewer lines in 4–6 candidate voices across two vendors; a blind panel rating
naturalness, warmth, clarity at low bitrate and technical pronunciation; first-byte latency and cost
per 1k characters beside each; licensing checked. The pinned audio is then rendered in the chosen
voice.

### Phase 8 — latency, measured

Stage 1: a static page reporting RTT, jitter, loss and bitrate from `getStats()`, run by the owner on
MTN, Airtel, Glo and home broadband. Stage 2: provider legs measured from a worker deployed in the
candidate region. Stage 3: the throwaway staging environment, the paid end-to-end run, the per-turn
table, the verdict on the budget, and whether levers 3 and 4 are justified.

### Phase 9 — delivery timings, metering, privacy, handover

The pure delivery module and what it stores, voice minutes on the ledger at session end and on
disconnect, `audio_processing` v2 copy, the retention and erasure path for stored audio, the
subprocessor rows, spec amendments, and the milestone handover.

## What only the owner can do, in the order it blocks

1. **LiveKit Cloud account and a region choice** — blocks phase 3's realistic half and all of phase 8.
2. **2–3 STT accounts and 1–2 TTS accounts** — blocks phase 2. Nothing before it needs a key.
3. **Review the recording kit, then recruit 5–8 speakers** — the longest lead time in the milestone;
   it runs in parallel with phases 3–5.
4. **Stage 1 carrier measurements** — needs only the static page, and the region decision wants them
   early.
5. **The human transcription pass** (decision 6) — 5–8 hours of careful listening.
6. **Approve the staging deployment** — region and a small monthly cost.
7. **Approve each paid run** — the pre-screen, the confirm run, the end-to-end voice session: priced
   with `--dry-run`, capped with `--max-cost`, started by the owner in their own terminal, one at a
   time (CLAUDE.md §7.8–7.9).
8. **The listening panel** — the owner plus 3–5 Nigerian listeners, phase 7.
9. **Ten minutes on the voice screen at 360px**, after phase 5.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check:contracts`, `pnpm format:check` green at
  every phase boundary.
- Voice e2e with a fake media device, fake STT and fake TTS: a full session, captions, barge-in, the
  silence prompt, a forced fallback to text that resumes at the same turn, and the answer-key
  boundary asserted over every payload that enters the room.
- The leak fixture extended to the room: a probe may appear in a turn the interviewer has spoken and
  nowhere else.
- The benchmark's `--smoke` inside `pnpm test`; the normalizer's tests; the acknowledgement set's
  no-praise test.
- The latency table from phase 8, with its sample size on its face, in `docs/progress/`.
