# ADR-0017 — A person reading a candidate's transcript is a consented purpose of its own

- **Status:** accepted
- **Date:** 2026-09-26
- **Context:** M4 phase 0 (evaluation, the session report, the eval harness, calibration)
- **Relates to:** ADR-0008 (Langfuse is a personal-data store), ADR-0011 (export and deletion),
  ADR-0014 decision 6 (a model's draft needs a human before production). **Supersedes:** nothing.
- **Amended:** 2026-09-26, decision 6, while this ADR is still unmerged. CLAUDE.md §7.4 says an
  accepted ADR is superseded rather than edited; decision 6 as first written did not *decide*
  anything — it asked the owner which contractual arrangement applied and said the answer had to be
  recorded before any reviewer was given access. The answer arrived the same day and is filled in
  below. That is the ADR answering its own open question, not a decision being changed, and it
  follows the precedent ADR-0014 set for the same situation. **Once this is merged, a change becomes
  a new ADR.**

## Context

Spec §4.4 commits the MVP to an "internal calibration tool: admins/experts blind-score sampled
answers; dashboard of AI-vs-human agreement", and it is the only honest way to know whether the
evaluator scores fairly. Without it, "our feedback is fair" is a claim with nothing behind it, and
product principle 1 makes the quality of feedback the thing we are actually selling.

But it is **a member of staff reading prose a candidate wrote about their own working life**, and
that is a processing purpose we had never named. `CONSENT_TYPES` held `audio_processing`,
`recording_storage`, `camera_coaching` and `marketing`; none of them covers it, and none of them is
close. Everything else that touches a transcript is machinery: a model provider under an API
agreement (ADR-0008 already treats its traces as a personal-data store), and us reading rows while
debugging, which is operating the service.

It surfaced on 2026-09-26 while `interview_intro` was being rewritten. v1 of that prompt had been
telling candidates "there is nothing to look up and nobody else is listening"; v2 retired the claim
as untrue and deliberately said **nothing** about who else reads a transcript, because until this
decision was taken we did not know what we were allowed to promise. Its header recorded that the
silence was "silent, not settled" and had to be re-read here. This is that reading.

## Decision

### 1. The basis is the candidate's consent, and it is a consent they can refuse

A new type, `transcript_review`. Opt-in, **default off**, revocable at any time from
`/profile/consent`, and refusing it costs the candidate nothing: the same interviews, the same
questions, the same report, the same score. The only consequence of a refusal is that our calibration
sample is smaller.

Legitimate interest was the alternative and was rejected. It would very likely carry legally — the
processing is narrow, internal, and in the candidate's own interest — but "a stranger read what you
typed about being stuck at work, and we decided you would not mind" is not a sentence we want to be
able to write. Consent also gives us something legitimate interest cannot: a number, per candidate,
that the sampler can be *built* to respect rather than trusted to.

### 2. It joins `allDecided`, so every existing account is asked once

`ConsentsService.allDecided()` gates onboarding on every type having an answer at its current
version, so adding one sends existing accounts back to the consent screen. That is the intended
behaviour, not a cost we absorbed: an unanswered optional permission is not a refusal, and we would
rather ask once than treat silence as either answer. (Today there are no production users, so the
practical cost is zero — which is exactly why this is the moment to add it.)

The wording is versioned like every other consent text (`CONSENT_VERSIONS`), so changing what we ask
for asks again, and a grant against older wording stops counting.

### 3. One rule for "granted", in one function

`isCurrentGrant` (`apps/api/src/consents/consent-eligibility.ts`) is the only place that decides
whether a stored decision counts: the latest row for that type, granted, at the current version.
Three callers need exactly that rule — `list()` renders it as a tick, `allDecided()` gates
onboarding, and the sampler asks it before showing a person somebody else's words — and the third one
fails **silently** if it gets it wrong. `ConsentsService.usersGranting(type)` is the set a sampler
may draw from, and it filters through the same predicate rather than restating it in SQL, so the set
and the single-user check cannot disagree. A truth table covers both, including the stale-yes case.

### 4. The interview says it aloud, and says nothing when it was refused

`interview_intro.v3` gains one sentence, **conditional on the grant**: two candidates in the same
session length now hear two different intros, which is correct, because they agreed to two different
things. A permission buried on a consent screen and never mentioned again is the kind of consent that
is technically obtained and practically forgotten.

When the consent was refused or never given, the sentence is simply absent. Nothing replaces it. We
do **not** reassure the candidate that nobody reads their answers, because a model provider does and
we do while debugging — that is the exact claim v1 was retired for, and putting it back in a quieter
voice would be the same mistake. Absence is the honest state.

The decision is read when the bundle is built rather than pinned on the session: the intro is spoken
once and `session_turns` already holds the words, so **the transcript is the record of what we
claimed**. A column saying what we would have said is a worse record than the sentence we did say.

### 5. What the consent does not permit

It permits a reviewer to read a sampled answer, with its question and rubric, in order to score it.
It does not permit:

- **identifying the candidate.** The tool shows ids, not names, emails, phone numbers or CV content.
- **reading transcripts for any other reason** — not curiosity, not a support enquiry, not marketing
  research. Debugging a broken session is operating the service and is not this consent; it is also
  not a licence to read a working one.
- **anything leaving the tool.** A sampled answer is not exported, quoted in a document, or used as
  training or demo material. The gold-standard eval set (`evals/datasets/gold/`) is written from
  answers **staff-authored for that purpose**, not harvested from candidates.
- **surviving erasure.** A calibration score references the answer it scored, so account erasure
  removes it with the rest (ADR-0011).

### 6. The reviewers are contractors, and therefore processors

**Answered by the owner, 2026-09-26.** Reviewers are senior engineers outside the company, paid per
review and engaged under contract rather than employed. They are processors acting on our behalf, and
three things follow:

- **Each signs a data-processing and confidentiality agreement before being given access.**
  `docs/privacy/reviewer-agreement.md` is the template. It is a **draft**: it says on its own face
  that a lawyer familiar with the NDPA 2023 must review it before anybody signs, because nothing in
  this repository is a legal opinion and an agreement that has not been read by a lawyer is worth
  less than the trouble it took to write.
- **Phase 6 does not go live with real reviewers until an agreement is signed.** That is a gate on
  the milestone, not a note in it. The tool can be built, tested and demonstrated against staff-
  authored answers in the meantime — which is what the eval harness's gold set is made of anyway —
  so nothing about the schedule depends on the paperwork arriving first.
- **`docs/privacy/subprocessors.md` records the arrangement**, because a DPA we sign with a customer
  or a cohort partner has to be able to say who reads candidate answers and under what terms.

Access is audited, like every other privileged action, and the agreement says so: a reviewer should
know that which answers they opened is recorded, and why that protects them as much as the candidate.

## Consequences

- Nothing may sample a transcript except through `usersGranting("transcript_review")`. The calibration
  tool (M4 phase 6) is built on it rather than remembering to check.
- The calibration sample is self-selected, and that is a real limitation on the agreement metric
  rather than a rounding error: candidates who opt in may not answer like those who do not. It is
  recorded with the metric, not hidden behind it.
- Every new consent type from here on costs one round of "everybody is asked again". That is the right
  price and the right time to notice it is while the product has no users.
- `interview_intro` is now the one prompt whose rendered text depends on a privacy decision, so a
  change to either has to be read against the other.

## Alternatives considered

**Legitimate interest with no checkbox.** Cheaper, probably lawful, and it would leave the intro
permanently silent about who reads a transcript. Rejected: see decision 1.

**Reviewers score only staff-written answers.** No consent needed at all, and it is exactly what the
eval harness's gold set will do. But it cannot answer the question calibration exists to answer —
whether the evaluator is fair to **real** answers, in the idiom real candidates use, which is the
fairness risk the synthetic stress sets were built to expose (`nigerian-english`). Staff-written
answers measure the evaluator against our own imagination.

**Consent implied by a term in the privacy policy.** Not consent under the NDPA 2023 or the GDPR, and
not honest either.
