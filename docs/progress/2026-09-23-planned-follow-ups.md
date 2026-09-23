# Planned follow-ups on the question — the decision, and why

**Owner's decision, 2026-09-23**, taken at the end of the QA question-bank pass and applying to every
bank and to M3. Nothing is implemented yet; this page is the shape that was agreed, so the next
session can build it without re-deriving the reasoning.

## The conflict this settles

Two rules the question-bank skill holds were in direct conflict, and each had been paid for.

**Every criterion must have a clause in the spoken prompt that asks for it.** Written because the
frontend critique passes found **nine** criteria charging 20–40% of a question's score for something
the prompt never requested, and the backend passes then found **eighteen** more. `check-bank.mjs`
counts the asks and warns when a prompt asks for fewer things than its rubric scores.

**The LLM generates follow-ups that probe missing rubric points** (CLAUDE.md §5, spec §78). The
engine's whole value over a quiz is the second question.

The QA passes made the collision the first finding of two of their four reviewers. A prompt that asks
for all three criteria up front is triple-barrelled — the senior-interviewer pass said it "asks its own
two follow-ups", and the nervous-junior pass said the last clause is the one they forget and it carries
a third of the marks. But cutting prompts to one clause would restore the defect the first rule exists
to prevent.

## The resolution: different moments, not one rule beating the other

> **The opening prompt asks one thing, like a real interviewer. The remaining criteria become planned
> follow-ups stored with the question. The check becomes: every criterion is asked for by the prompt
> **or** by a planned follow-up.**

The first rule was never really about the prompt. It was about nothing charging for something never
asked — and a planned follow-up asks it. The purpose survives intact while the prompt gets to sound
like a person.

It also turns a vague engine instruction into a concrete one. Today M3 would have to derive probes from
the rubric at runtime, which means sending the rubric to the interviewer model on every follow-up call.
Planned follow-ups let the engine send the question's own probes instead.

## What follows from it

### The rubric stops reaching the interviewer model

Because the probes are pinned on the question, a follow-up call needs the planned follow-ups and the
per-criterion coverage flags — not the criteria, the weights or the level descriptors. That takes the
answer key out of every interviewer-model call: a privacy improvement, a smaller prompt-injection
surface, and a cheaper prompt. The rubric still goes to the **evaluator** in M4, which is a different
call with a different prompt and a different model.

### Menu, not script — with a coverage log

The planned list is what the engine **may** ask, not what it **will**. A follow-up is asked only for a
criterion the answer has not already covered. A candidate whose first answer covers all three gets no
follow-up and moves on; asking the planned probes anyway would punish a complete answer with two
redundant questions, which is the failure mode this shape invites and the reason it is written down
here.

To make that auditable, every candidate turn carries a **per-criterion coverage log**
(`session_turns.criteria_covered`): one entry per criterion, whether this answer touched it, and which
follow-up the engine then chose. Without it, a session where the engine asked a redundant follow-up and
one where it correctly skipped both look identical afterwards. Three things read it — the engine, to
pick the next probe; M4's evaluator, as a prior and **never** as a score; and us, when a reviewer says a
follow-up was asked about something already answered. It is a model's judgement about an answer, so it
is stored as a record of what the engine decided, never as a substitute for the evaluator's own
per-answer scoring.

### The follow-ups are answer-key material

They tell a candidate what they are about to be asked next, so they are treated exactly like
`ideal_points`: never in a candidate-facing shape, in the session-question `snapshot` that does not
leave the API, and covered by `content-no-answer-key.int.spec.ts` — whose detector is marker-based, so a
new field costs one fixture marker rather than a new assertion.

**They live on the question, not the rubric.** Two rubrics already serve two questions each
(`risk-prioritisation`, `wait-strategy-reasoning`) and the right probes differ per question. They also
cannot follow `reviewer_notes`, which is **not stored in the database at all** — the reviewer page is
generated from the seed files. The engine has to read follow-ups, so they need a real column.

## Where the work goes: the field now, the wiring in M3

| Part                                                                       | When            | Why                                                                                        |
| -------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| Contract, column, service, CMS, leak-test marker, review-doc               | **before M3**   | Answer-key material shaped exactly like `ideal_points`, and cheap                          |
| The follow-ups themselves, per bank                                        | **before M3**   | They need the same critique and stress treatment as the questions they belong to            |
| Session bundle → worker → `interview_followup.v1.md`, and the coverage log | **M3**          | Nothing consumes them until the engine exists                                               |

The reason the field cannot wait: **M3 will build its follow-up prompt against whatever it finds.** If
planned follow-ups do not exist, `interview_followup.v1.md` is written to generate from the rubric and
ships — and a released prompt version is never edited in place, so retrofitting means a `v2` plus a
session-bundle change, with every M3 session and eval run still naming `v1`.

## The retrofit, measured

Counted across the three banks rather than estimated:

| Bank             | Questions | Follow-ups to write | Prompts to rewrite |
| ---------------- | --------- | ------------------- | ------------------ |
| Frontend         | 35        | 70                  | 35                 |
| Backend          | 34        | 68                  | 34                 |
| QA               | 35        | 70                  | 35                 |
| **Total**        | **104**   | **208**             | **104**            |

Every rubric in every bank has exactly three criteria, so it is uniformly two follow-ups per question.

**Filling gaps alone would cost nothing** — the existing prompt-clause check already passes on all 104
questions. So this is not gap-filling: it is a deliberate reshape of every prompt in the product, and
the 208 follow-ups are new content, not a transcription of clauses that already exist. Some will be
close to a clause being removed from a prompt; many will not, because "and how would you decide your
list is enough?" as a trailing clause is not the same thing as a probe worth asking a candidate who has
just answered.

The engineering surface is small: `SeedQuestionSchema`, the admin/candidate split in
`contracts/content.ts`, one Prisma column and migration, `content.service.ts`, `content.mappers.ts`,
`seed-import.ts`, the CMS question editor, `review-doc.ts`, one leak-test fixture marker, and
`check-bank.mjs`'s ask-counting check.

## Sequencing

1. **The field, plus QA's 70 follow-ups, as the pilot.** QA is the bank whose prompts the critique
   passes objected to most loudly, and 70 is enough to find out whether the shape is right before
   paying for 208. This is also where `check-bank.mjs` changes from "the prompt asks for N things" to
   "every criterion is asked for by the prompt or by a planned follow-up".
2. **Frontend and backend**, once the pilot has settled the shape.
3. **Full-stack**, which is a tagging pass and inherits whatever the other banks carry.

**The full-stack pass is held until this and the `behavioural-answer-quality` deletion are settled**
(owner, 2026-09-23). The deletion is done — `e912038`.

## What is still open

> **Answered by the pilot, 2026-09-23** — see `docs/progress/2026-09-23-planned-follow-ups-pilot.md`.
> A probe is `{ criterion, probe }` with no condition field; the check is an error; and, after the
> owner read the pilot, **two** probes per criterion rather than one — the paragraph below turned out
> to be wrong about the gain, because a criterion that scores two separable things otherwise has half
> of itself scored and never asked. The pilot also found a rule none of this anticipated — *a criterion may go without a probe
> only when the opening question asks for that criterion and nothing else* — and two questions where
> one-probe-per-criterion costs something. The three paragraphs below are left as they were written.


- **What a planned follow-up looks like on the page.** A single spoken sentence per criterion is the
  obvious shape, but a probe sometimes needs a condition attached ("if they have not mentioned the
  limit"), and that is either prose the model reads or structure the engine branches on. The pilot
  decides; the engine should not be branching on prose.
- **Whether a criterion can have more than one planned probe.** `max_followups` is 2 and rubrics have 3
  criteria, so the engine is already choosing between them; more than one probe per criterion multiplies
  that choice without an obvious gain.
- **What the check does about a criterion with neither a clause nor a probe.** Today the ask-count is a
  warning. Once follow-ups exist the condition is exact rather than heuristic, which is an argument for
  making it an error — and errors are how this project has stopped rules being broken eighteen times in
  a row.
