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
against those six questions), then the role's row in `docs/role-catalogue.md`.

## The procedure

| Step           | Output                                                            | Gate                                                   |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| 1. Blueprint   | `content/seed/blueprints/<role>.md`                               | The owner reads it **before** any question is drafted  |
| 2. Catalogue   | rows in `roles.yaml`, `stacks.yaml`, `levels.yaml`, `topics.yaml` | `check-bank.mjs` resolves every slug                   |
| 3. Draft       | `content/seed/<role>/{questions,rubrics}.yaml`                    | `check-bank.mjs`, then `pnpm db:seed -- --dry-run`     |
| 4. Critique    | edits, and `reviewer_notes` where it is a judgement call          | `references/critique.md` — four passes, run separately |
| 5. Fact-check  | edits, and the blueprint's fact-check appendix                    | Current official docs, dated — **and the arithmetic**  |
| 6. Stress test | `evals/datasets/synthetic/<role>/<rubric>.yaml`                   | `references/stress-test.md` — five answers per rubric  |
| 7. Coverage    | the blueprint's closing section                                   | Bank against blueprint, and against a real interview   |
| 8. Hand over   | `pnpm --filter @readi/api content:review-doc`                     | The expert reads the generated page, not the YAML      |

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

## House style

**Questions.** One question asks one thing. The prompt is what an interviewer would actually say out
loud, in the second person, without preamble — the engine speaks it. Context (a snippet, a log, a
report) goes in `context`, never in the prompt. Prefer "here is a situation, what do you do" over
"define X": the engine's strength is the follow-up, and a definition has nowhere to go. Set
`difficulty` against the level it is offered at, not against the field. `ideal_points` is the answer
key: what a strong answer covers, each point checkable, three to six of them.

**Every criterion must have a clause in the spoken prompt that asks for it.** This is the defect a
critique pass found nine times in one bank: the prompt asks for a diagnosis and the rubric charges
35% for a fix, or 20% for a keyword the prompt never says. The candidate answers the question they
were asked, completely, and loses a third of the score. Read each criterion, find the words in the
prompt that ask for it, and if there are none, add them or drop the criterion.

**An open tension, not yet resolved.** The first finding of both the senior-interviewer and the
nervous-junior pass on the QA bank was that a prompt shaped this way is triple-barrelled, and the
senior pass gave the argument that matters: it **pre-empts the engine**, whose job is to generate
follow-ups that probe missing rubric points (CLAUDE.md §5). The junior's version is that the last
clause is the one they forget and it carries a third of the marks. Both are right, and the rule below
is also right — it was written because the frontend pass found nine criteria charging for something
never asked and the backend pass eighteen. The resolution is probably that the prompt must raise every
criterion's **subject** while the follow-up draws out the detail, which would mean changing this rule
and the check together. Until the owner decides, write the clauses plainly and short, and do not
resolve it inside one bank.

**`check-bank.mjs` counts the asks** — a rubric with three criteria needs a prompt that asks for
three things — and warns where a prompt asks for fewer. It was made a check after the rule was
written down, made a hard rule here, and then broken **eighteen times in the next bank by the same
drafter**. A rule that has to be remembered once per criterion is a rule that needs a check. The
warning is not always a defect: a prompt may have one deliberately broad clause covering two
criteria, and then the drafter says which in `reviewer_notes` and moves on. It is never ignored
silently.

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
the manner rather than the answer**, and **a prompt that asks for fewer things than its rubric
scores**. The last two exist because both defects got past a written rule and a human reading. `pnpm db:seed --
--dry-run` is the authority on everything the contract owns — run both.

## References

- `references/format.md` — the seed format, the stack rule, the review workflow, what the importer does
- `references/critique.md` — the four critique passes, who each reviewer is, what they look for
- `references/stress-test.md` — the five sample answers, and the eval files they become
- `templates/blueprint.md` — the blueprint, including the `targets` block `check-bank.mjs` reads
- `templates/questions.yaml` — a commented question and rubric in house style
