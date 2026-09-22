# The seed format, as a drafter needs it

The authority is `packages/shared-types/src/contracts/seed.ts` (the Zod schema the importer
validates against) and `content/seed/README.md` (what the importer does with it). This page is the
subset you hold in your head while writing, plus the traps.

## Where things live

```
content/seed/
  levels.yaml          the ladder: intern-junior, mid, and a senior no role offers yet
  stacks.yaml          every variant any role is interviewed for
  roles.yaml           the roles, and which levels and stacks each offers
  topics.yaml          the shared taxonomy every question, lesson and track hangs from
  rubrics.shared.yaml  rubrics used by more than one role
  blueprints/*.md      the plan behind each bank (markdown — the loader only reads .yaml)
  <role>/track.yaml    one track: modules, lessons
  <role>/rubrics.yaml  that role's rubrics
  <role>/questions.yaml
  review/<role>.md     generated — never edited by hand
```

A directory is one role's bank, and **a role does not need one**: `fullstack` is made of the
frontend and backend questions that carry it as a second role. Which roles exist is `roles.yaml`,
never the directory listing.

Every file opens with the same three lines, and `draft` is the only status a file may declare:

```yaml
version: 1
author: ai_draft
status: draft
```

## A question

```yaml
- slug: js-async-ordering # permanent; the importer matches on it. Renaming makes a second question.
  roles: [frontend, fullstack] # slugs from roles.yaml. A second role costs nothing; a copy costs a drift.
  levels: [intern-junior, mid] # slugs from levels.yaml — hyphens, not underscores
  stacks: [react-typescript] # OMIT unless genuinely variant-specific (see below)
  type: technical # must be in every listed role's supported_question_types
  topic: javascript-fundamentals # slug from topics.yaml
  subtopic: event loop # free text, or null
  difficulty: 3 # 1–5, against the level it is asked at
  prompt: >- # what the interviewer says out loud
  context: | # a snippet, a log, a report — or null
  rubric: async-ordering-understanding
  ideal_points: [...] # the answer key: what a strong answer covers
  reviewer_notes: >- # what YOU are unsure about, addressed to the expert
```

`prompt` ≤ 2 000 characters, `context` ≤ 4 000, each ideal point ≤ 300 with at most 10 of them,
`reviewer_notes` ≤ 1 000, at most 6 roles, 4 levels and 8 stacks (`CONTENT_LIMITS`). The limits are
generous; the house style is much tighter.

## A rubric

```yaml
- slug: async-ordering-understanding
  name: Understanding of asynchronous ordering
  criteria:
    - dimension: Gets the order right
      description: One sentence on what this criterion is scoring.
      weight: 30 # the weights total exactly 100
      levels: # all five, "0" to "4", quoted — they are YAML keys
        "0": No answer, or an order with no reasoning behind it.
        "1": ...
        "4": ...
```

The contract allows 2–8 criteria. The house style is 3, up to 5, and `check-bank.mjs` enforces the
house style.

## The stack rule (ADR-0015)

No `stacks:` key means **general to the role** — everyone preparing for it is asked it, including a
candidate who has chosen no variant at all. That is what most questions are.

`stacks: [react-typescript, nextjs]` means **only** candidates on one of those variants ever see it.

The test is whether the question would be **unfair or meaningless** on another variant. A component
shown in JSX is. "How would you decide what to test" is not, however many React projects you were
thinking of when you wrote it. Both mistakes cost: an unnecessary tag shrinks what most candidates
practise; a missing one hands a Vue developer a React snippet.

A stack must be one that a role on the question actually offers (`roles.yaml`), or no candidate can
ever be asked it. `check-bank.mjs` catches that.

## What the importer does, in one line each

- Writes through the same service the CMS uses, as the system: same version snapshot, same audit row.
- **Skips anything unchanged** — no version, no audit, no touched timestamp.
- **Never deletes, never publishes, never embeds.** Embedding happens when an admin publishes.
- **Never rewrites published content**, and **never overwrites a CMS edit** (`seed_managed`). It
  names both in its report; `--force` takes them back.
- **Marks what a model drafted**: `author: ai_draft` sets `ai_draft_unreviewed` on every row it
  writes, which production refuses to publish. `author: human` clears it.

The rule of thumb: **edit the YAML until the first expert review lands, and the CMS after.**

## Traps

- **`levels` uses hyphens** (`intern-junior`). The old enum used an underscore; nothing does now.
- **`senior` exists as a level and no role offers it.** Do not write senior questions until a role
  offers the level and the content behind it exists (`levels.yaml` says why).
- **A slug is permanent.** Correcting a typo in a slug creates a second question and orphans the first.
- **`review/` is generated.** Edits there are lost on the next `content:review-doc`.
- **Blueprints are `.md` on purpose.** The loader validates every `.yaml` under `content/seed` as a
  seed file, so a blueprint written as YAML would fail the import.
- **The catalogue is imported before the banks**, because a role cannot name a level that does not
  exist yet. Add the topic, the stack and the role rows in the same change as the questions that
  need them.
