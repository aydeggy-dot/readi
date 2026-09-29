# ADR-0020 — The accent benchmark: synthetic speech pre-screens, real speech decides, and the reference is human

- **Status:** accepted
- **Date:** 2026-09-29
- **Context:** M5 phase 0 (voice mode; the benchmark runs in phases 2 and 6)
- **Supersedes:** nothing. **Relates to:** spec §8 ("STT benchmark on Nigerian-accented speech
  before choosing a provider"), product principle 3, ADR-0011 (erasure), ADR-0017 (a person reading
  what a candidate said).

## Context

Choosing a speech-to-text provider is a fairness decision, not a procurement one. Every vendor
publishes a word error rate; none of them publishes one for a Nigerian engineer saying "idempotent"
over MTN on a mid-range Android phone. If we choose on the published figure we will have chosen on
somebody else's test set.

M4 already taught this lesson in the other modality and it cost a milestone's worth of caveats. The
`nigerian-english` answers in `evals/datasets/synthetic` were **written by the same family of model
that then scored them**, so "0 of 36 criteria outside the fairness band" is fairness to a model's idea
of the idiom. It is the strongest thing measurable without real candidates and it is not the claim the
product makes. Synthetic Nigerian-accented *audio* is the identical trap: cleaner than real speech,
fluent, evenly paced, no room noise, no code-switching, and likely to flatter every provider.

But waiting for recordings blocks the whole pipeline, and recordings have a lead time nobody controls.

## Decision

### 1. Two sets, two provenances, and a report that never mixes them

Every clip in the manifest declares `provenance: synthetic | real`. Every report states which it is
reading, per figure, and **refuses to print a combined figure over mixed provenance** — the same rule
`/evals` applies to an unmeasurable pair. A reader must never have to ask which set a number came
from.

### 2. Synthetic may eliminate. It may never choose

Synthetic audio is a pre-screen: it proves the pipeline works, exercises the normalizer, and finds the
provider that is plainly unfit. A provider is **eliminated on synthetic evidence only if it is worse
by a wide margin on every synthetic source**, and the winner is **never** decided there.

The synthetic set is generated from **at least two different text-to-speech vendors**, so no
provider's recognizer is tested chiefly on its own vendor's audio, and results are reported per
source. One source would make a vendor's own pipeline look like an accent result.

### 3. What the real set is

5–8 consented speakers, about 10 minutes each, recorded **on their own phones in normal conditions** —
the device and the room the product will actually meet. A mix of first languages (Yoruba, Igbo, Hausa
and others), and some natural Pidgin, because candidates code-switch and a recognizer that collapses
on it is a recognizer that fails mid-interview.

Each recording is in two parts, for two different reasons:

- **Read sentences** dense in technical terms. The reference transcript is known in advance, so this
  part is cheap and measures pronunciation of the vocabulary that matters.
- **Spoken answers** of about a minute to real interview questions, one invited in Pidgin. This is
  the only part that measures what the product actually receives: hesitation, self-correction,
  filler, and a sentence that changes direction half way.

### 4. The reference transcript is made by a person listening to every clip

Two providers' output is used as a **draft**, and a person then listens to **every clip end to end**
and corrects the whole draft (owner's decision, 2026-09-29).

The tempting shortcut — have the person adjudicate only where the two providers disagree — is
rejected, and the reason is the point of the whole benchmark: **when two recognizers mishear a
Nigerian accent in the same way, they agree**, so the error is never surfaced and nobody checks it.
Reviewing only disagreements would systematically hide exactly the failures this exercise exists to
find, and would do it while looking thorough.

### 5. One normalizer, pinned and tested; the convention is written down

Word error rate is a function of what counts as the same word: case, punctuation, numbers ("k8s" /
"kubernetes"), contractions, fillers, and Pidgin orthography, where there is no single spelling.
There is **one** normalizer module with tests, and the human transcription convention is a document
the transcriber follows. Two notions of sameness would make every figure in the report unreadable,
and the difference between providers is smaller than the difference between conventions.

### 6. The codec path is part of the test

The product receives Opus over WebRTC at a low bitrate; a phone's recorder produces something better.
Every clip is therefore also scored after being passed through the product's own codec and bitrate,
and both figures are reported. Benchmarking pristine audio would measure a path no candidate uses.

### 7. What is scored, and what the winner is chosen on

Word error rate overall and **per speaker** — an average hides the one speaker a provider fails, and
the speaker is the fairness unit here, exactly as the criterion is in `/evals`. Then a **technical-term
error rate** over `/content/glossary/tech_terms.txt`, which is also the custom-vocabulary list loaded
into the provider. Then time-to-final and cost per minute, because a provider two points better and
400 ms slower loses a conversation.

**Streaming is a hard filter.** Voice mode needs interim results and endpointing; a batch-only engine
can be benchmarked as an accuracy ceiling but cannot serve a turn, and the report labels it as such
rather than ranking it alongside.

### 8. The speakers are not users, and their audio is not product data

They have no account, so this consent is not a `consent_records` row: it is a plain-language form,
signed once, kept outside the application. The audio lives outside the product's database and
buckets, is never committed to the repository, and is deleted on request or at the end of the
retention the form states. The form says plainly that clips are sent to speech-recognition vendors
for testing and are not used to train anybody's model — which means the vendor terms must actually
say that, checked and recorded in `docs/privacy/subprocessors.md` before a clip is uploaded.

## Consequences

- **Phases 2 and 6 are separate milestones of evidence.** Phase 2 can eliminate and cannot choose;
  phase 6 chooses. The provider decision is recorded with the real set's numbers beside it.
- **The transcription is the schedule risk.** About an hour of spontaneous audio is 5–8 hours of
  careful human work, and decision 4 deliberately buys accuracy with that time rather than saving it.
- **The glossary earns its keep twice** — as custom vocabulary at runtime and as the tech-term subset
  in the report, so a provider cannot be tuned for the test without also being tuned for the product.
- **The report is a document, not a leaderboard.** It states provenance per figure, the normalizer
  version, the codec path, and the conventions, because the next person to run it will get different
  numbers if any of those move.

## Alternatives considered

**Public corpora only** (Common Voice, AfriSpeech-200 and similar). Cheap, larger, and useful as a
supplement — and rejected as the basis of the decision: read speech from a different task, different
devices and no technical vocabulary, and a provider may well have trained on them. They can be added
as a labelled third provenance; they cannot replace the real set.

**A vendor's declared accent support.** Rejected: it is marketing about a distribution we cannot see.

**Skip synthetic and wait for the recordings.** Honest, and it idles the pipeline for weeks while
leaving the normalizer, the manifest and the report untested on any audio at all. The pre-screen
earns its place by being labelled.

**Have the model that recognizes also judge the transcript.** Rejected for the reason M4 wrote down:
a model reading its own output is not a measurement.
