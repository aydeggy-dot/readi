# Seed content

The question banks, rubrics, lessons and tracks that `pnpm db:seed` imports (spec §4.2, ADR-0014).
Written by hand in YAML, reviewed by human experts, and imported idempotently.

**If you are here to review the content, read [REVIEW.md](REVIEW.md) instead.**

## Layout

```
levels.yaml            the ladder: intern/junior, mid, and a senior no role offers yet
stacks.yaml            the variants a role is interviewed for         (the catalogue)
roles.yaml             the roles, and which levels and stacks each offers
topics.yaml            the shared taxonomy every question and lesson hangs from
rubrics.shared.yaml    rubrics used by more than one role
frontend/              track.yaml, rubrics.yaml, questions.yaml   (the full set)
backend/, qa/          the same three files, as skeletons
review/                generated review pages — do not edit by hand

A directory is one role's bank, and a role does **not** need one: `fullstack` has no directory,
because its questions are the frontend and backend ones that carry it as a second role. Which
roles exist is `roles.yaml`, never the directory listing — the review-doc generator reads the
catalogue and writes a page only for a role some directory actually holds content for.
```

Files refer to each other **by slug**: a question names its `topic`, its `rubric`, its `roles`, its
`levels` and — when it is specific to them — its `stacks`, a track names its `role`, its `level`
and its `topics`, and a role names its `levels` and `stacks`. The importer resolves those to database ids, and fails with the file name if a slug
is not defined anywhere. The catalogue is imported first, because a role cannot name a level that
does not exist yet.

**Roles, levels and stacks are content now** (ADR-0015), not enums: adding a role is an entry in
`roles.yaml` — or, just as legitimately, a form in `/admin/content` — and never a migration. The
same workflow applies to them as to a question: they arrive as drafts, and an admin publishes.

## Commands

```bash
pnpm db:seed -- --dry-run     # validate and print the plan; writes nothing
pnpm db:seed                  # import; running it twice changes nothing
pnpm db:seed -- --force       # also overwrite items that have been edited in the CMS
pnpm --filter @readi/api content:review-doc   # regenerate review/*.md after editing content
pnpm format                   # then this: the generator does not emit Prettier's markdown
```

A validation failure names the file, line and column: `content/seed/frontend/questions.yaml:84:7 —
questions[2].ideal_points: expected array`.

## Rules the format enforces

- **`status: draft` is the only status a file may declare.** Publishing is a decision an admin
  takes in the CMS, with an audit entry against their name — never a line in a file.
- **`author`** is `ai_draft` or `human`, and it is now load-bearing rather than a note: the
  importer writes it to the database as `ai_draft_unreviewed`, and **production refuses to
  publish** anything still marked (ADR-0014 decision 6). Change it when a human has actually
  been through the file.
- **`reviewer_notes` is required on every question**, and "nothing to flag" is a legitimate answer.
  An empty field usually means nobody looked.
- **`stacks:` on a question is a narrowing, so it is left out by default.** No `stacks` key means
  the question is general to its roles and everyone preparing for them is asked it; listing stacks
  means only candidates on one of those variants ever see it (ADR-0015). The test is whether the
  question would be unfair or meaningless to someone on another variant — a snippet of JSX is,
  "how would you decide what to test" is not. Two of the fourteen seeded questions are tagged
  today, both React ones in `frontend/`; a candidate who chose no variant at all gets the general
  set only.
- **A question's `roles:` is a list, and a second role costs nothing.** A question that genuinely
  transfers belongs to both roles rather than being copied — eleven of the fourteen carry
  `fullstack` for exactly that reason. Copying content makes two things that drift.
- **Rubric weights must total 100**, with 3–5 criteria and a descriptor for each level 0–4.
- Slugs are permanent: the importer matches on them. Renaming one creates a second item.

## What the importer does, and does not

- Writes through the same service the CMS uses, so a seeded change produces the same version
  snapshot and audit row as a human edit — recorded as the **system**, with no user attached.
- **Skips anything unchanged.** No version, no audit row, not even a touched timestamp. This is
  what makes it safe to re-run after editing one question in a file of forty.
- **Never deletes.** Content removed from a file stays in the database, because someone may have
  edited it in the CMS since.
- **Never publishes, and never embeds.** Embeddings are computed when a question is published
  (ADR-0006), which by then is a human's decision.
- **Never rewrites published content**, whatever authority it holds (ADR-0014 decision 7).
  Candidates are reading those words, and changing them is an admin's deliberate act — so the row
  is left exactly as it is and **named** under "left alone — published, and candidates are reading
  them". `--force` writes it anyway. Recording a review on a published row is not a rewrite and
  still happens.
- **Never overwrites a CMS edit.** Every row carries `seed_managed`, true while these files are
  still the source of its content and false from the first save in `/admin/content`. The importer
  creates what is missing, updates what is still `seed_managed`, and **names** everything else in
  its report. `--force` overwrites those too and takes them back for the files, with
  `seed import (forced)` in the version history. A status change is not an edit: publishing seeded
  content leaves it under these files (ADR-0014 decision 5).
- **Marks what a model drafted.** A file saying `author: ai_draft` marks every row it writes as an
  unreviewed AI draft; `author: human` clears the mark — **including on items whose words did not
  change**, which is what an expert approving a bank as it stands looks like. That one write
  touches the review columns only, writes no version, and is reported on its own line
  (`8 marked reviewed`) rather than counted as an update. Re-drafting the text of a reviewed question
  under `ai_draft` marks it again and forgets the stale review, because that review was of words
  the import replaced. The mark is otherwise cleared only by **Mark as reviewed** in the CMS —
  never by saving an edit, because a typo fix is not a review (ADR-0014 decision 6).

The rule of thumb: **edit the YAML until the first expert review lands, and the CMS after.**

`reviewer_notes` stays seed metadata: the importer validates it and leaves it in the file, with no
column in the database. If the CMS should show it one day, that is a migration, not a change to
this format. `author` used to be the same; as of ADR-0014 decision 6 it is written through to
`ai_draft_unreviewed`, which is what the production publish guard reads.
