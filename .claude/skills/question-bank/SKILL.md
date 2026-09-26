---
name: question-bank
description: Build or extend a Readi role's interview question bank — blueprint, questions, rubrics, the four critique passes, the rubric stress test, and the offline checks — so every role is written the same way to the same standard. Use when drafting, extending or reworking anything under content/seed/<role>/.
---

# Writing a question bank

A bank is the questions a candidate practises on, the rubrics an AI evaluator scores them against,
and the reasoning that says why those and not others. It is the product. Everything else — the
engine, the report, the readiness score — is machinery for delivering it.

This skill is how one gets built, so that the twentieth role is written to the same standard as the
first and a reviewer's time goes to judgement rather than to obvious fixes.

**Read `content/seed/README.md` first** (the format and what the importer does), then
`content/seed/REVIEW.md` (what we ask a human expert to check — the bank is written to be reviewed
against those seven questions), then the role's row in `docs/role-catalogue.md`.

## The procedure

| Step           | Output                                                                    | Gate                                                   |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1. Blueprint   | `content/seed/blueprints/<role>.md`                                       | The owner reads it **before** any question is drafted  |
| 2. Catalogue   | rows in `roles.yaml`, `stacks.yaml`, `levels.yaml`, `topics.yaml`         | `check-bank.mjs` resolves every slug                   |
| 3. Draft       | `content/seed/<role>/{questions,rubrics}.yaml`, with `planned_follow_ups` | `check-bank.mjs`, then `pnpm db:seed -- --dry-run`     |
| 4. Critique    | edits, and `reviewer_notes` where it is a judgement call                  | `references/critique.md` — four passes, run separately |
| 5. Fact-check  | edits, and the blueprint's fact-check appendix                            | Current official docs, dated — **and the arithmetic**  |
| 6. Stress test | `evals/datasets/synthetic/<role>/<rubric>.yaml`                           | `references/stress-test.md` — five answers per rubric  |
| 7. Coverage    | the blueprint's closing section                                           | Bank against blueprint, and against a real interview   |
| 8. Hand over   | `pnpm --filter @readi/api content:review-doc`                             | The expert reads the generated page, not the YAML      |

Step 1 is not a formality. A bank drafted without a blueprint reliably ends up as "the questions the
drafter found interesting", uneven across topics and levels, and the gap is invisible until someone
counts. The blueprint is what `check-bank.mjs` reconciles the bank against.

## The hard rules

Each of these has a source, and none of them is a preference.

- **`status: draft` and `author: ai_draft` on every file a model wrote.** Publishing is an admin's
  decision in the CMS; `author` is written through to `ai_draft_unreviewed`, which production
  refuses to publish (`content/seed/README.md`, ADR-0014 decision 6). Never set `author: human` on
  your own work. That field is a human vouching for it.
- **`reviewer_notes` is the drafter's uncertainty**, addressed to the expert — a claim that may have
  aged, a level that may be wrong, a weight that was a judgement call. It is not a summary of the
  question, and "nothing to flag" is a legitimate answer that should be rare.
- **A question whose answer depends on what a named product currently does is marked
  version-sensitive**, by opening its `reviewer_notes` with the line

  ```
  **Version-sensitive: <the claim>, checked against <source> on <YYYY-MM-DD>.**
  ```

  and, where the claim needs someone who works in that stack, `— needs a <X> specialist, not a
generalist reviewer.` The seed contract has no field for this and does not need one:
  `grep -l 'Version-sensitive' content/seed/*/questions.yaml` finds every such question across every
  bank, and `grep -o '\*\*Version-sensitive:[^*]*'` prints the claims and their dates. The detail
  behind each one lives in the blueprint's fact-check appendix. Mark it when the answer would change
  if the vendor changed something — Angular's change detection, `NEXT_PUBLIC_` inlining, Vue's
  reactivity — and not merely because a framework is named. **These are re-checked on a cycle**, so a
  mark with no date is worse than no mark.

- **Only question types in that role's `supported_question_types`** (`roles.yaml`; M3 reads it).
- **Never write a question the engine cannot deliver.** No "write the code", no "draw the diagram",
  no "run this query", no lab. The catalogue names what each role needs beyond M3; the blueprint
  repeats it; the bank does not quietly include it anyway. Product principle 1.
- **The stack rule** (ADR-0015): no `stacks:` means general to the role and everyone is asked it;
  `stacks: [x]` means only candidates on that variant ever see it. Tag only what would be **unfair
  or meaningless** to a candidate on another variant — a JSX snippet is, "how would you decide what
  to test" is not. Tagging a general question shrinks what most candidates practise.
- **A question that genuinely transfers gets a second role, not a copy.** Copying makes two things
  that drift (`content/seed/README.md`).
- **No invented statistics, and no claims about a named company's interview process.** "Most
  candidates get this wrong" is not something we know.
- **Write for the audience**: mid-range Android phones, unreliable mobile data, and the teams
  hiring here (`content/seed/REVIEW.md`). A question that assumes a fast laptop and a stable
  connection is not neutral — it is wrong for the reader.
- **Assume no employer.** A large part of this audience is self-taught and has never had a code
  reviewer, an error-reporting dashboard, a staging environment, a designer or a test suite. A
  question may describe those things; it may not require having had them. Where a scenario needs a
  workplace, the prompt supplies it (a report on screen, the fields the tool shows) rather than
  asking the candidate to recall one.
- **A question must not hand over a criterion it then scores.** `the-test-that-always-passes` told
  the candidate, in its context, the very fact criterion 1 was worth 40% for noticing — and the stress
  test measured the cost: a `weak` answer read the line back, scored 3, and the rubric failed its
  separation. The drafter had already written the worry into `reviewer_notes` ("it now gives the first
  criterion away, which I do not like but prefer to an unfair question") and left it. Where fairness
  really does require stating the fact, the criterion has to score the _consequence_ drawn from it
  rather than the fact itself. Conversely, a rubric may not require what the question never supplies:
  `api-collection-repeatability` scored "the token expires" at level 3 against a context that never
  said the token had a lifetime, so the band was reachable only by guessing.
- **The evaluator reads descriptors. It does not read your comments.** Every fairness promise has to
  live in a `dimension`, a `description` or a descriptor, because that is the only text that reaches
  the model that scores the answer. `rubrics.shared.yaml` carries eleven such clauses — "a team that
  treats asking as weakness is a fact about the workplace, not a fault in the candidate"; "a candidate
  with no colleagues says who they would have told". The QA bank was drafted with **none**, and its
  whole promise — that an answer from a personal project scores the same as one from a job — sat in a
  YAML comment at the top of `questions.yaml` which said, in so many words, that the seed format had
  nowhere to put it. It has somewhere: the descriptor of every criterion that asks for recall, access
  or standing. A promise the model cannot read is not a promise.
- **A criterion that assumes a workplace needs a route for someone without one** (owner's decision,
  2026-09-24, after the frontend retrofit). Count the protective clauses in the file you are writing:
  `rubrics.shared.yaml` has eleven across thirty criteria and `frontend/rubrics.yaml` had **two**
  across ninety. That asymmetry was survivable while a prompt asked three things at once and a
  candidate could answer around the criterion they had no standing to answer. **Planned follow-ups
  remove that escape route by design** — every criterion is now asked by name, of the candidate who
  did not volunteer it, with no second chance — so a criterion that quietly assumes a colleague, an
  employer or a paid tool is a fairness bug pointed at the bootcamp graduate this bank is written
  for. The worst example found: `help-seeking-judgement` criterion 3, 40% of its question, scoring
  "judgement about when to ask" with no route above level 0 for a candidate who has never had anyone
  to ask. **Where the act itself is the criterion, widen what counts as the act** rather than
  excusing its absence: asking includes posting in a community, finding someone who hit the same
  error, a Discord or WhatsApp group, an issue thread. Recognising you are stuck and reaching outward
  is the signal; a colleague is one way to do it, not the thing being scored.
- **A level descriptor defined by the absence of what a probe supplies is unreachable.** Three
  frontend descriptors were made dead by the format itself: `state-placement-reasoning` criterion 2
  level 1 is "notices the duplication **only when prompted**", and the probe _is_ the prompting, so
  every candidate reached by it caps at 1 on a 30% criterion. `url-state-reasoning` criterion 3 and
  `client-boundary-reasoning` criterion 2 have level 0s defined by not having been told the thing the
  probe tells them. After writing a probe, read its criterion's level 0 and level 1 and ask whether
  the probe has just made them impossible.
- **A protective clause belongs on a behavioural criterion, and rarely anywhere else.** A scenario or
  technical prompt _supplies_ the workplace — the report on screen, the snippet, the provider outage
  — and a rubric written in the hypothetical ("what they would do") needs no route however much
  workplace furniture it mentions. The bug is a criterion that requires the candidate to have **had**
  one: a past-tense criterion, or a level reachable only by recalling a real job. Check the question's
  `type` and `prompt` before calling a criterion unfair. This is why counting clauses is a poor signal
  and reading is the only one that works: the 2026-09-25 sweep expected backend to be the worst file
  in the repo on a clause count of zero across eighty-seven criteria, and found three real ones,
  because nearly every backend question hands the candidate an artefact instead of asking for recall.
  `rubrics.shared.yaml` is the best-covered file precisely because it is where the behavioural
  questions live.
- **A clause in a description is guidance; a clause in a level descriptor is a score** (owner's
  decision, 2026-09-25). Both reach the evaluator, but only the descriptor is what it lands on and
  quotes evidence against, so a fairness clause belongs in the descriptors of the levels it is meant
  to make reachable — and a `description` clause is the summary of it, not the promise itself. There
  is a practical reason too: `criterionDescriptionMaxLength` is **300 characters**, and a clause
  written as a paragraph does not fit beside the sentence explaining the criterion. Four of the six
  clauses written on 2026-09-24 were refused by `check-bank.mjs` for exactly that, and two of them
  were better for being moved down. Write the route into level 3 — "doing it, or saying who has to"
  — and let the description say in one line what the criterion is not scored on.
- **When a rubric changes to include a case, the stress set needs an answer from that case**
  (owner's decision, 2026-09-25) — otherwise the change is untested and the green run is telling you
  nothing. `help-seeking-judgement` was widened so that asking a community counts, and all five of
  its stress answers had a colleague to ask: every separation still passed, and not one of them went
  near the new clause. The repair is not a sixth answer — `check-stress.mjs` scores the five kinds
  and ignores anything else — but rewriting the kind that fits. There, the
  `correct-poorly-explained` candidate became self-taught and asked in their cohort's WhatsApp
  group, with the same substance said just as badly, and still scored 3 / 3 / 3. Ask, after every
  descriptor change: which of the five answers now lands somewhere it did not before? If the answer
  is none, the set does not test the change.

**And it must not evict the case it already had.** The same 2026-09-25 sweep narrowed three level 1s
to the wrong answer a _probed_ candidate gives, and all three stranded the stress answer that used to
land there — on `rule-interaction-test-design` the `weak` answer tests Resend as its own case and
never meets the collision the probe hands over, so the sharper descriptor had nowhere to put it. All
three were widened to hold both shapes. Read the set in both directions after every descriptor
change: which answer now lands somewhere new, and which answer no longer lands anywhere.

## House style

**Questions.** One question asks one thing, and means it — see the next rule for where the rest of
the rubric gets asked. The prompt is what an interviewer would actually say out
loud, in the second person, without preamble — the engine speaks it. Context (a snippet, a log, a
report) goes in `context`, never in the prompt. Prefer "here is a situation, what do you do" over
"define X": the engine's strength is the follow-up, and a definition has nowhere to go. Set
`difficulty` against the level it is offered at, not against the field. `ideal_points` is the answer
key: what a strong answer covers, each point checkable, three to six of them.

**Every criterion is asked for by the prompt or by a planned follow-up.** This is the defect a
critique pass found nine times in one bank and the next pass eighteen times in the next: the prompt
asks for a diagnosis and the rubric charges 35% for a fix, or 20% for a keyword the prompt never
says. The candidate answers the question they were asked, completely, and loses a third of the
score. Read each criterion and find where it is asked for — in the prompt, or in a probe.

**The prompt asks one thing; the rest become planned follow-ups** (owner's decision, 2026-09-23;
`docs/progress/2026-09-23-planned-follow-ups.md`). The rule above used to say "a clause in the
spoken prompt", and that collided head-on with the engine: a prompt with a clause per criterion is
triple-barrelled and asks the engine's own follow-ups for it, which the senior-interviewer and the
nervous-junior passes on the QA bank both made their first finding. The resolution is **different
moments, not one rule beating the other** — the opening prompt asks one thing, the way a real
interviewer does, and every other criterion carries a probe in `planned_follow_ups`. The purpose is
untouched: nothing charges for something the candidate was never asked. What moved is where the
asking happens.

So, writing a question:

- **The prompt is one clause.** No "and", no "also", no trailing "and how would you know your list
  is enough?". Read it aloud; if you run out of breath or lose the thread, it is still two questions.
  **`check-bank.mjs` enforces this as an error, and only in its sharpest form** (2026-09-26): a
  second ask coordinated onto the first with an explicit `and`/`or`/`then`, inside a sentence that is
  doing the asking. Ten openings across the three banks still did that after the 2026-09-25 retrofit
  cut the three-clause prompts — "Explain what the check that is there does, **and what it does not
  do**", "Which is the more serious, **and what makes it so**" — and one of them was the question
  whose answer went un-probed in the first paid run. The check is narrow on purpose, because counting
  asks lexically does not work as a ceiling: the counter behind the arithmetic rule above reports
  more than one ask for 56 of 104 openings, almost all of them relative pronouns ("accounts **where**
  money left one") and existentials ("the check that **is there**"), and two passes at sharpening it
  moved 48 clean to 50. Coordination is clean on 94 of 104 with every flag genuine. So a two-part
  opening the check does not catch is still a defect; it is just one a reader has to catch.
- **One accepted exception, and it is a shape rather than a wording** (owner's decision,
  2026-09-26, on the evidence of the second paid run —
  `docs/progress/2026-09-26-m3-second-paid-run.md` §5.2). `api-list-that-grew` opens "What is going
  wrong, **and for whom**? Take me through it." That is **one diagnosis with two sides**, answered
  in one breath and scored by one criterion — not two questions — and it produced one of the two
  best follow-ups of that run. It stays exactly as it is. The exception licenses that shape and
  nothing more: a second clause that asks a **second criterion** is the defect the retrofit removed
  and remains an error. `check-bank.mjs` does not flag this prompt and **is not to be widened until
  it does** — the coordinator here is followed by `for`, not by an interrogative, which is the
  narrowness of the rule earning its keep rather than a gap in it. The runtime ask counter
  (`interview/asks.py`) _does_ read it as two, and that is the right answer on that side: it sets
  the ceiling the phrasing guard compares against, and counting `whom` is what stopped the guard
  rejecting a faithful "who it affects" and lurching into the next question.
- **Cutting the second half does not mean losing it.** Three places it can go, in this order of
  preference: it is usually the _same_ criterion as the first half, in which case the opening simply
  loses a clause it did not need — and a house **depth cue** restores the shape of the answer that
  the second clause used to carry as a side effect ("Which is the more serious? Take me through
  it."). Where it is genuinely a different criterion, it becomes that criterion's probe, which is
  better than the opening: it reaches exactly the candidate who did not volunteer it. And where it
  was asking a criterion that _already_ had a probe, it was being asked twice — `selenium-stale-element`
  and `pushing-back-on-a-release` were both doing that on 2026-09-26.
- **Each remaining criterion gets a probe**, `{ criterion, probe }`, where `criterion` is that
  criterion's position in the rubric counting from 0 — not the criterion's name, because two
  questions can share a rubric and positions are what the engine pins into a session.
- **A criterion that scores two separable things gets two probes, and never three** (owner's
  decision, 2026-09-23, after the QA pilot). One per criterion was the first rule, and the pilot
  measured what it cost: `test-case-selection`'s third criterion is "thinks past the happy path
  **and** says where the list stops" at 45%, so a single probe left half of it scored and never
  asked — which is the defect this field exists to remove. The engine prefers a criterion nothing
  has probed yet and reaches a second probe on the same criterion only when no other criterion is
  uncovered, so **list a criterion's primary probe first**. Needing a third is the rubric telling
  you the criterion should have been two criteria.
- **Write the probe for a candidate who answered the prompt well and said nothing about this.**
  That is the only case in which it is asked: the planned list is a **menu, not a script**, and the
  engine skips a probe for a criterion the answer already covered. A probe that a good first answer
  would always have pre-empted is a clause that belonged in the prompt.
- **One sentence, spoken, second person.** No condition attached ("if they have not mentioned the
  limit…"): that condition is the engine's rule, and it should not be branching on prose.
- **Not a rephrasing of the criterion.** "Tell me about your prioritisation" is the dimension read
  back; "which of those would you cut if you had a day?" is a question.

**A criterion may go without a probe only when the opening question asks for that criterion and
nothing else.** This is the load-bearing rule, and it was the one finding all four critique passes
made independently on the QA pilot. One criterion is left un-probed because the prompt asks for it —
but if the prompt is open ("What would you do?", "What do you tell them?"), two criteria compete to
be the answer, and a candidate who leads with a **probed** criterion silently forfeits the un-probed
one. There is no second chance by construction: the engine probes what the answer missed, and the
criterion with no probe cannot be probed. Six QA questions had exactly this shape, three of them on a
criterion worth 40% or more. The fix is to narrow the opening until it asks one criterion, not to
hope. Where the opening genuinely cannot be narrowed, the question needs a probe on every criterion
and the skill's "one per criterion the prompt does not ask" stops being enough — say so in
`reviewer_notes` rather than shipping the gap.

**A prompt cut to its first clause is not a prompt cut to its first criterion.** This is the check to
run first when retrofitting a bank, and it is the defect all four critique passes on the frontend
retrofit found from different directions. Deleting the trailing clauses of a triple-barrelled prompt
is the obvious move and it was right in 22 of 35 questions — but in six the criterion left without a
probe was then **not** the one the opening asked, and because it has no probe there is no recovery by
construction. `fetch-failure-states` asked "everything that screen has to handle", which any of its
three criteria answers. `what-to-test-on-a-login-screen` asked for the subjects of tests while the
un-probed criterion was about how a test is written. `stuck-and-asked-for-help` lost the word
"asked", so both probes presumed a story the candidate may never have told. Per question: name the
criterion the opening asks, check it is the one without a probe, and check nothing else answers the
opening as well. `check-bank.mjs` cannot do this — it counts asks and probes and cannot tell which
criterion an opening names.

**A diagnosis question opens on the diagnosis, and that is not a defect to be fixed** (owner's
decision, 2026-09-25). After the backend retrofit every snippet question opened on "what is
happening" and none on a decision, so the guaranteed-asked share of the score fell to about 37% and
in nine questions the heaviest criterion sat behind a probe. The remote-manager critique pass wanted
them inverted — decision first, diagnosis as the probe. **They stay as they are**, for two reasons
that are about the interview rather than about the arithmetic: a candidate cannot decide about a bug
they have not diagnosed, and an opening of "what would you change?" rewards pattern-matching on the
snippet's _shape_ — the reflex that recognises a `@Transactional` gotcha without reading what the
method does. The arithmetic complaint has a different answer, and it is not a content one: **if a
prompted answer scores slightly below a volunteered one, "the heaviest criterion sits behind a probe"
largely dissolves across all three banks without a single prompt being rewritten.** That is what M4
owes; see `tasks/todo.md`.

**Give a diagnosis opening a depth cue** (owner's decision, 2026-09-25). "Take me through it", "walk
me through what you see", or the equivalent — one short clause that is not a second ask, because it
asks for nothing new. A one-clause opening tells a candidate _what_ is wanted and nothing about _how
much_, and the nervous-candidate pass put the cost plainly: the grammar asks for one thing and the
rubric charges for three, so the under-confident candidate gives two sentences and stops. The old
triple-barrelled prompts carried the shape of the answer as a side effect of carrying its content;
cutting them to one clause took the shape away with it. A cue restores it for nothing.

Two things follow from "asks for nothing new". **The cue is a closed list** — "Take me through it",
"Walk me through it", "Walk me through what you see" — because anything with a noun in it ("walk me
through how that state comes about") _is_ the ask, and is counted as one. And **`check-bank.mjs` does
not count a cue towards the asks**: if it did, every diagnosis opening would hand its question a free
ask and a criterion could go unasked behind it, which is the one thing that count exists to catch.
What the checker cannot do is notice a diagnosis opening that has no cue — that needs the opening
read as a diagnosis or a decision, the same judgement the mis-aim check needs and for the same
reason. It is a rule to remember once per question, with no check behind it; say so in the pass.

**Ask the criterion in the order the work happens.** A probe about what the candidate would decide
_before starting_ cannot follow an answer describing what they did. Two QA questions had the plan
criterion as a probe under an opening that asked how the hour or the work was spent, and three passes
called it incoherent; both had their opening and first probe swapped.

**A probe must not name the thing its criterion scores them for noticing.** The rule against a
question handing over a criterion applies with more force to a probe, because a probe arrives after
the candidate has already failed to say it. "Which of these rules brush against each other?" gives
away that the rules interact, which was the whole of a 40% criterion; "your code arrives, you tap
Resend, then you type the first one — what should happen?" walks them to the same place and lets them
find it.

**And it is worse than the clause it replaced, not merely as bad.** A clause in a triple-barrelled
prompt was asked of everyone; a probe is asked **only** of the candidate whose answer missed that
criterion. So a leading probe does not test a miss — it converts a miss into a gift, to precisely the
candidate who had not earned it. Eleven of the backend bank's seventy probes needed rewriting on this
in one pass: `mocking-what-you-do-not-own` asked "what would have caught this that is _not a test_",
which made both of its bottom bands unreachable because they are defined by reaching for another
test; `cache-key-that-leaked` asked "_before_ you get anywhere near the code", which told the
candidate that something comes before the fix, and that is the whole judgement. The repair is always
the same: extend the scenario instead of narrowing the answer — "Two days went by before anyone knew
— what would have shortened that?", "That fix takes you an hour to write and ship — what happens in
that hour?" — so the weak answer can still arrive and be scored.

**Never read a scoring constraint out loud.** "…explained without quoting a regulation at them" is an
instruction to the evaluator that ended up in the candidate's ear, and it told the one candidate whose
data-protection training is their strongest asset not to use it. Three of the four passes caught that
single clause. A constraint on how an answer is scored lives in the descriptor; a probe asks for
substance.

**`check-bank.mjs` counts the asks** — a rubric with three criteria needs three things asked for,
in the prompt or in a probe — and it is an **error**, not a warning. It was made a check after the
rule was written down, made a hard rule here, and then broken **eighteen times in the next bank by
the same drafter**. A rule that has to be remembered once per criterion is a rule that needs a
check. The old warning had an escape hatch — one deliberately broad clause covering two criteria,
named in `reviewer_notes` — which existed only because there was nowhere else to put the second ask.
There is now.

**Rubrics.** Three criteria; five if the answer genuinely has five separable parts. Weights total
exactly 100 and are a claim about what matters most — **and if every rubric in the file carries the
same split, the file is making no claim at all.** The QA bank was written with 21 of 30 rubrics at
exactly 35/35/30 and 8 at 35/30/35, against 11 distinct patterns across frontend's 30 and 12 across
backend's 29. The consequence is not cosmetic: the criterion that carries the judgement which
actually transfers ends up the lightest one, because it is the one written last. Decide each split
against the question, and expect a defensible bank to contain 25/30/45 and 45/25/30 and 30/20/50.
`check-bank.mjs` warns when one split covers more than half a file. Each criterion carries five descriptors, 0
(absent) to 4 (excellent), and the test is that **two readers scoring the same answer pick the same
number**. If 2 and 3 differ only in tone, or 4 is "as 3, but more confident", the rubric is
defective — sharpen it before the stress test finds it.

**Two checks now catch what a pass used to** (2026-09-23, owner's decision). `check-bank.mjs` warns
when one weight split covers more than half a rubric file, and when a criterion keeps its specificity
in level 4 instead of level 3. `check-stress.mjs` prints **calibration notes** — a rubric whose
`strong` takes the ceiling everywhere has no headroom, and one whose `weak` clears 2 on every
criterion has a bottom that is not anchored. **Both are proxies, and the level-4 one needs reading
rather than obeying**: of its seven hits in the QA bank only two were real defects, because length is
not specificity — a tersely written level 3 can be perfectly calibrated, and a scoring instruction
inside level 4 ("either verdict reaches 4 if that comparison is made") inflates the ratio without
asking the candidate for anything. What is deliberately **not** checked is whether level 4 is phrased
"As 3, and …": it is in **308 of 309** descriptors across three banks, because that is the house
style, so a check on the shape would flag the style and nothing else.

**Put the thing you would hire on at level 3, not level 4.** Level 4 is the rare answer; level 3 is
"this person can do the job". If the behaviour that makes a candidate worth hiring sits in the level-4
clause, then a candidate scoring 3 across the bank reads as competent while missing the whole point of
every criterion — which is what a critique pass found in six QA criteria at once, and what the nervous
junior found from the other end ("I would understand the 0s and the 3s, but not one of the 4s"). The
test is to read level 3 alone and ask whether you would hire someone who answered exactly that.

**Level 4 must contain something that cannot be bluffed.** "Would keep a sample of awkward content
around", "checks the error rate afterwards", "tests on a real device" — a claimed habit costs
nothing to say, so the top band separates the coached from the good. Make level 4 a distinction, a
trade-off, or a case where the candidate's own answer would be the wrong call.

**Every criterion needs a descriptor that fits a specific, wrong answer.** The low descriptors get
written for vagueness — "a rule with no mechanism", "with nothing behind it", "without saying why" —
because that is what a weak answer looks like. A fluent wrong answer is the opposite of vague: it is
detailed, it uses the vocabulary correctly, and the detail is wrong. Scored against a descriptor
written for absence, it lands on the right _number_ and the evaluator's evidence quote then
contradicts the descriptor it was scored against — the candidate is told they were vague about
something they were specific and wrong about. **M4's feedback is built on those evidence quotes**, so
this is the difference between feedback a candidate trusts and feedback that tells them we were not
listening. Name the wrong belief this question actually attracts, and put it at level 0, 1 or 2
beside the vague one — "Relies on the request rejecting: a try/catch only, or the claim that `fetch`
throws on a 404 or a 500."

**And a level 0 that reads only "Not addressed." is silence, not a wrong answer.** It described a
real situation while a prompt asked three things at once and the candidate answered two of them —
the criterion never came up. **A planned follow-up removes that situation**: the criterion is now
asked by name, of the candidate who did not volunteer it, so the only way to reach that band is to
be asked and still say nothing. Write what that actually sounds like — "Nothing happens to it: it
stops being their problem once it is not the one chosen", "Nothing about what was lost: the answer
goes back to the fifteen tests and how to make them pass" — or the evaluator uses the band as a
dustbin for answers it cannot place, and the evidence quote contradicts the descriptor again.
`check-bank.mjs` enforces it: a bare non-answer at level 0 is an **error** on a criterion some
question probes, and a **warning** everywhere else, because every bank is getting probes. Found on
2026-09-25 by the fairness sweep — eleven errors and eight warnings across three banks, in a file
where 149 of the level 0s are under forty characters and nearly all of the rest are the house style
working ("Sees nothing wrong", "Everything odd is a defect", "No fix, or a longer wait").

**Name the belief, never the manner.** The first version of this rule said "a _confident_, specific,
wrong answer", and writing it that way put the word _confident_ into thirty-four descriptors across
two banks before two critique passes independently caught it. Every word in a descriptor is a
scoring instruction, so that one told the evaluator to attend to how an answer sounded — the exact
defect `rubrics.shared.yaml` had just been reworked to remove, reintroduced by the fix for a
different problem. It also does no work: what separates level 1 from level 2 is that **level 1 names
a specific wrong mechanism and level 2 is vague**, and a hesitant candidate naming the same wrong
mechanism has to land in the same band. No descriptor contains "confidently", "with conviction",
"however fluently" or "argued in detail".

**And never the quantity, either.** The rule was written twice and broken a third time, in a form
neither version covered: nine level-1 descriptors in the QA bank defined the wrong answer by how
_much_ was said — "a detailed plan that starts with PIN validation", "a thorough set of flows", "Names
the wrong culprit in detail", "Prices it accurately in minutes". It reads as harmless, because the
point being made is that a wrong answer is specific rather than absent. It is not harmless: a terse
correct answer in a second language matches neither that level 1 nor the level 3 above it, and drifts
down, while a long wrong one is at least recognised. The same check found seven more across the
frontend, backend and shared files, so it was never a QA problem. **Name the belief. Not how
confidently it was held, and not how long it took to say.**

**`check-bank.mjs` enforces this as an error.** `confiden*`, `conviction`, `articulat*`, `fluen*`,
`eloquen*`, `polish*`, `rambl*`, `waffl*`, `hesitan*`, `well-spoken`, `glib` and `smooth-talking`
are banned outright in a dimension, a description or any descriptor — there is no reading on which
they belong. `vague*`, `concise*`, `coherent*`, `succinct*`, `detailed`, `in detail`, `thorough*`,
`accurately` and `at length` warn instead, because they can describe the _content_ being unspecific
or specific, which is legitimate and is exactly what separates level 1 from level 2 — but they are the
words the defect arrives through, so a human confirms each one.
`clear` is deliberately on neither list: it does too much ordinary work in a descriptor ("clearing
the cache", "one clear misuse") for a lexical check to be worth the noise, and "every criterion's
top band turned on _clear_" is a defect the **fairness critique pass** caught by reading, in
context, which is where it has to be caught.

**One descriptor per criterion is not enough.** Two scorers on the QA bank named the same shape
independently: _the level-1 descriptor was written for a wrong answer, not for **this** wrong answer._
Twenty-four times, a writer who could not see the rubric reached for a different wrong belief of equal
plausibility, and the scorer then had to land on a descriptor that was _literally_ satisfied while the
answer's actual error went unnamed — which is exactly the case the rule exists to prevent. Three times
the wrong belief scored **3** on the heaviest criterion, because by the letter of level 3 it had done
what level 3 asked. So: when the stress answers come back, read each `fluent-but-wrong` against the
descriptor you expected it to hit, and if it hits a different one, the descriptor is the thing that
changes.

**Check that levels 1 and 2 are ordered on one axis.** Two QA rubrics had level 1 as "recommends the
shortcut as the fix" and level 2 as "mentions a shortcut without saying what it costs" — so an answer
that recommended it _and_ named a cost fitted neither, and two readers would split. If a real answer
can satisfy parts of both, they are measuring two different things.

**Anchor the bottom of the scale, not only the top.** `references/stress-test.md` says the `weak`
answer should not score above 1 on the content criteria. In the QA bank it reached 2.00 in seven
rubrics, because the level-2 descriptors were reachable by naming the right topic with no content
behind it — "right number, wrong number" satisfying "valid and invalid cases without a stated reason",
a single empty-field check satisfying "some boundaries". A floating `weak` does not fail the
separations, so nothing catches it but reading.

The `fluent-but-wrong` answer in the stress test is where the wrong belief comes from, which is why
the test is worth running before the rubric is finished rather than after. Applied across every
frontend, shared and backend rubric on 2026-09-22; every bank after that is written this way from
the start.

**A shared rubric must be able to score its questions.** If a question's `ideal_points` name
something no criterion touches, one of the two is wrong. Sharing works where two questions really do
score the same dimensions against different material — several `test_design` questions do, and share
one rubric on purpose.

**A behavioural question needs its own rubric. Do not write a generic one.** This is settled, and it
cost four questions to settle. `behavioural-answer-quality` — situation, actions, outcome — was the
rubric every behavioural question started on, and it lost four times out of four:

| Question                      | What it is really about           | How it was caught                                                                                                                                               |
| ----------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stuck-and-asked-for-help`    | judgement about _when_ to ask     | frontend critique passes, 2026-09-22                                                                                                                            |
| `feedback-on-your-code`       | a comment they did not agree with | frontend critique passes, 2026-09-22                                                                                                                            |
| `incident-you-contributed-to` | owning a share of the fault       | two backend passes argued it; the **stress test proved it** — a polished story about somebody else's outage scored 3.70, identical to the candidate's own break |
| `pushing-back-on-a-release`   | how they made the case            | all four QA passes, 2026-09-23                                                                                                                                  |

The reason is structural, not bad luck. Situation / actions / outcome describes the _shape_ of a
story, and story shape is coachable in an afternoon — so a generic behavioural rubric scores the one
thing that does not distinguish candidates, while the specific judgement the question was written to
find has nowhere to land. The first two criteria of a good behavioural rubric can stay close to that
shape; **the criterion that carries the most weight has to be the judgement itself.** The rubric was
deleted on 2026-09-23 (owner's decision) so that nobody starts from it again. Where a behavioural
question is asked of several roles, its own rubric lives in `rubrics.shared.yaml` — shared across
roles, never across questions.

**Prose.** Say the thing. No marketing, no "leverage", no em-dash-joined lists of adjectives. The
reviewer is a working engineer whose time we are spending.

## Check the arithmetic, not only the vendor

A fact-check asks a vendor's documentation whether a claim about their product is still true. It
cannot tell you that a claim about **numbers** is false, and the two worst defects in the first two
banks were both of that kind. Neither was caught by the fact-check; both were caught by a critique
pass doing the sums.

- `db-money-as-a-float` asked why daily naira totals drift a few kobo and get worse over a month.
  `double precision` carries fifteen to sixteen significant digits, so a total would have to reach
  about ₦10^14 before losing a kobo — **and floating-point errors are signed and largely cancel**
  rather than accumulating, so the rubric was charging 30% for an explanation that is not true. The
  example value, 1500.50, is also exactly representable in binary, so the premise was false of the
  number on screen and the candidate who understands floating point best was the one most likely to
  be marked down.
- `node-async-error-never-caught` said the request hangs until it times out. Since Node 15 an
  unhandled rejection is an uncaught exception and the **process exits**.

- `testing-without-a-spec` gave two renderings of a date and its `reviewer_notes` claimed they
  "cannot both be right". They can: `03/11/2026` **is** `11 March 2026` if the list puts the month
  first. The question was fine — better than described, because what it really tests is which
  convention the product means — but the note and one answer-key point described a question that had
  not been written, and a blind stress writer found it by taking the same wrong turn in the other
  direction. **The claim to check is sometimes in your own prose about the question, not in the
  question.**

So: before the critique passes, go through every question and rubric and **verify each quantitative
or behavioural claim by working it out**, not by recognising it. Then do it again to the sentences you
wrote _about_ them.

1. **Do the sum.** Every number in a prompt, a context block, an `ideal_point` or a descriptor —
   row counts, timings, percentages, money, sizes, limits, precision. Does the stated consequence
   follow from the stated numbers? `node .claude/skills/question-bank/scripts/check-bank.mjs
--numbers` prints them all as a worklist.
2. **Check the example value.** A question about a type that cannot represent something must use a
   value it cannot represent. Run it if you can.
3. **Check the direction.** "Gets worse over time", "scales with traffic", "compounds" — say why,
   and check the mechanism actually has that shape. Errors that cancel do not accumulate; a fixed
   window with more arrivals does lose a rising _fraction_.
4. **Check the default.** "It hangs", "it retries", "it is on by default" — a behaviour claim about
   a runtime is a version-sensitive claim, so it gets the marker and a source.
5. **Write the outcome in the blueprint's fact-check appendix** beside the vendor rows, so the
   next pass can see that the arithmetic was checked and when.

A claim you recognised is not a claim you checked. The drafter who wrote both defects above had
read the right things about floating point and about Node, and still wrote them down backwards.

## Coverage: how many questions

The floor is **two questions per core topic, available to a candidate at each level the role
offers** — because a candidate who practises a topic twice should not meet the same question twice.
A question carrying both levels counts for both. Central topics earn a third; a topic that is core
only in name earns its two and no more.

Stack-tagged questions are a second, smaller set: **two per variant that justifies its own
questions**, and a variant that does not is named in the blueprint as not justifying them rather
than padded to match its neighbours.

Derive the number, topic by topic, in the blueprint. Padding to a round number is the failure this
section exists to prevent.

## Order of work, and where to stop

Draft **general, core-topic questions first** and hand those to the reviewer as round one; the
stack-tagged set is round two. Nobody reads eighty questions in one sitting, and a systemic defect
found in round one is fixed once rather than eighty times.

Stop after each role, not after each wave.

## Checks

```bash
node .claude/skills/question-bank/scripts/check-bank.mjs          # offline: no database, no network
node .claude/skills/question-bank/scripts/check-bank.mjs --strict # blueprint shortfalls become errors
node .claude/skills/question-bank/scripts/check-bank.mjs --numbers # the arithmetic worklist: every quantitative claim, to work out
node .claude/skills/question-bank/scripts/check-stress.mjs        # the rubric stress tests, and the two separations
pnpm db:seed -- --dry-run                                         # the contract, against the database
pnpm --filter @readi/api content:review-doc                       # regenerate the reviewer's pages
pnpm format                                                       # the generator does not emit Prettier's markdown
```

`check-bank.mjs` enforces what the seed contract does not: house style (3–5 criteria, five
distinguishable descriptors), that a question's `type` is one its roles support, that its stacks and
levels are ones its roles offer, the bank against its blueprint's targets, **descriptors that score
the manner rather than the answer**, and **a criterion asked for by neither the prompt nor a planned
follow-up**. The last two exist because both defects got past a written rule and a human reading. `pnpm db:seed --
--dry-run` is the authority on everything the contract owns — run both.

## References

- `references/format.md` — the seed format, the stack rule, the review workflow, what the importer does
- `references/critique.md` — the four critique passes, who each reviewer is, what they look for
- `references/stress-test.md` — the five sample answers, and the eval files they become
- `templates/blueprint.md` — the blueprint, including the `targets` block `check-bank.mjs` reads
- `templates/questions.yaml` — a commented question and rubric in house style
