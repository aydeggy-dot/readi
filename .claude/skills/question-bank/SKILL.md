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
| 5. Fact-check  | edits, and the blueprint's fact-check appendix                    | Current official docs, dated                           |
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

**Rubrics.** Three criteria; five if the answer genuinely has five separable parts. Weights total
exactly 100 and are a claim about what matters most. Each criterion carries five descriptors, 0
(absent) to 4 (excellent), and the test is that **two readers scoring the same answer pick the same
number**. If 2 and 3 differ only in tone, or 4 is "as 3, but more confident", the rubric is
defective — sharpen it before the stress test finds it.

**Level 4 must contain something that cannot be bluffed.** "Would keep a sample of awkward content
around", "checks the error rate afterwards", "tests on a real device" — a claimed habit costs
nothing to say, so the top band separates the coached from the good. Make level 4 a distinction, a
trade-off, or a case where the candidate's own answer would be the wrong call.

**Every criterion needs a descriptor that fits a confident, specific, wrong answer.** The low
descriptors get written for vagueness — "a rule with no mechanism", "with nothing behind it",
"without saying why" — because that is what a weak answer looks like. A fluent wrong answer is the
opposite of vague: it is detailed, it uses the vocabulary correctly, and the detail is wrong. Scored
against a descriptor written for absence, it lands on the right _number_ and the evaluator's
evidence quote then contradicts the descriptor it was scored against — the candidate is told they
were vague about something they were specific and wrong about. **M4's feedback is built on those
evidence quotes**, so this is the difference between feedback a candidate trusts and feedback that
tells them we were not listening. Name the wrong belief this question actually attracts, and put it
at level 0, 1 or 2 beside the vague one:

> `"1": Relies on the request rejecting — a `try`/`catch`only, or a confident claim that`fetch`
throws on a 404 or a 500.`

The `fluent-but-wrong` answer in the stress test is where the wrong belief comes from, which is why
the test is worth running before the rubric is finished rather than after. Applied across all 34
frontend and shared rubrics on 2026-09-22; every bank after that is written this way from the start.

**A shared rubric must be able to score its questions.** A behavioural answer is judged the same way
whatever the role, so the shared rubric is right — until a question is written about a _specific_
judgement, at which point the shared criteria have nowhere to put it and the question quietly scores
storytelling form instead. If a question's `ideal_points` name something no criterion touches, one of
the two is wrong.

**Prose.** Say the thing. No marketing, no "leverage", no em-dash-joined lists of adjectives. The
reviewer is a working engineer whose time we are spending.

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
node .claude/skills/question-bank/scripts/check-stress.mjs        # the rubric stress tests, and the two separations
pnpm db:seed -- --dry-run                                         # the contract, against the database
pnpm --filter @readi/api content:review-doc                       # regenerate the reviewer's pages
pnpm format                                                       # the generator does not emit Prettier's markdown
```

`check-bank.mjs` enforces what the seed contract does not: house style (3–5 criteria, five
distinguishable descriptors), that a question's `type` is one its roles support, that its stacks and
levels are ones its roles offer, and the bank against its blueprint's targets. `pnpm db:seed --
--dry-run` is the authority on everything the contract owns — run both.

## References

- `references/format.md` — the seed format, the stack rule, the review workflow, what the importer does
- `references/critique.md` — the four critique passes, who each reviewer is, what they look for
- `references/stress-test.md` — the five sample answers, and the eval files they become
- `templates/blueprint.md` — the blueprint, including the `targets` block `check-bank.mjs` reads
- `templates/questions.yaml` — a commented question and rubric in house style
