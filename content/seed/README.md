# Seed content

The question banks, rubrics, lessons and tracks that `pnpm db:seed` imports (spec §4.2, ADR-0014).
Written by hand in YAML, reviewed by human experts, and imported idempotently.

**If you are here to review the content, read [REVIEW.md](REVIEW.md) instead.**

## Layout

```
topics.yaml            the shared taxonomy every question and lesson hangs from
rubrics.shared.yaml    rubrics used by more than one role
frontend/              track.yaml, rubrics.yaml, questions.yaml   (the full set)
backend/, qa/          the same three files, as skeletons
review/                generated review pages — do not edit by hand
```

Files refer to each other **by slug**: a question names its `topic` and its `rubric`, a track names
its `topics`. The importer resolves those to database ids, and fails with the file name if a slug
is not defined anywhere.

## Commands

```bash
pnpm db:seed -- --dry-run     # validate and print the plan; writes nothing
pnpm db:seed                  # import; running it twice changes nothing
pnpm db:seed -- --force       # also overwrite items that have been edited in the CMS
pnpm --filter @readi/api content:review-doc   # regenerate review/*.md after editing content
```

A validation failure names the file, line and column: `content/seed/frontend/questions.yaml:84:7 —
questions[2].ideal_points: expected array`.

## Rules the format enforces

- **`status: draft` is the only status a file may declare.** Publishing is a decision an admin
  takes in the CMS, with an audit entry against their name — never a line in a file.
- **`author`** is `ai_draft` or `human`. Change it when a human has actually been through the file.
- **`reviewer_notes` is required on every question**, and "nothing to flag" is a legitimate answer.
  An empty field usually means nobody looked.
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
- **Never overwrites a CMS edit.** Every row carries `seed_managed`, true while these files are
  still the source of its content and false from the first save in `/admin/content`. The importer
  creates what is missing, updates what is still `seed_managed`, and **names** everything else in
  its report. `--force` overwrites those too and takes them back for the files, with
  `seed import (forced)` in the version history. A status change is not an edit: publishing seeded
  content leaves it under these files (ADR-0014 decision 5).

The rule of thumb: **edit the YAML until the first expert review lands, and the CMS after.**

`reviewer_notes` and `author` are seed metadata: the importer validates them and leaves them in the
file. They have no column in the database. If the CMS should show them one day, that is a
migration, not a change to this format.
