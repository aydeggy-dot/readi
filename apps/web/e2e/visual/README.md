# Visual review screenshots

`capture.spec.ts` takes a full-page screenshot of every screen the app can render, at 360px and
1280px, in light and dark mode: four images per screen. It exists so a visual change can be reviewed
screen by screen instead of by clicking through the app, and so two runs are comparable.

It is part of the e2e suite but skipped unless `E2E_SCREENSHOTS` is set, like `slow-network.spec.ts`.

```bash
git switch main
E2E_SCREENSHOTS=before pnpm test:e2e visual     # the base you are changing from

git switch your-branch
E2E_SCREENSHOTS=after  pnpm test:e2e visual     # the same screens, after
```

Output goes to `screenshots/<label>/<screen>-<width>-<theme>.png` at the repo root, which is
gitignored — **screenshots are never committed**. Delete the folder when you are done with it.

## What it does

`pnpm test:e2e` builds the API and the web app into their own output folders and starts them on
their own ports (3010/4010/8010), so a run never disturbs `pnpm dev`. The spec then seeds four
accounts, each parked where a group of screens becomes reachable:

| State          | How it is left                                     | Screens it unlocks                      |
| -------------- | -------------------------------------------------- | --------------------------------------- |
| `fresh`        | signed up, nothing filled in                       | `/onboarding/profile`                   |
| `mid`          | profile done, no CV                                | `/onboarding/cv`, `/onboarding/consent` |
| `done`         | onboarded, CV parsed, admin granted                | `/home`, `/profile/*`, `/admin`         |
| `expert`       | content_expert, with `/content/seed` imported      | `/admin/content/*`                      |
| `interviewing` | one finished, scored interview and one running     | `/practice`, `/interview/*`, the report |
| `reviewer`     | an admin, with somebody else's answer in the queue | `/admin/calibration/*`                  |

`expert` runs `pnpm db:seed` against the e2e database first: an empty CMS is not worth looking at,
and the seeded bank is what the screens will really hold.

`reviewer` needs a **sixth** account that is never photographed: the author of the answer in the
queue. It has to be a different person, because a reviewer is never offered their own answer, and it
has to be **staff** that granted transcript review on the ordinary consent screen —
`CALIBRATION_ALLOW_CANDIDATE_TRANSCRIPTS` is off until a reviewer agreement is signed (ADR-0017), and
nothing is sampled except through that grant. If the queue is empty the run says so and photographs
the empty state rather than a 404.

The accounts are made once and replayed as cookies, so the captures themselves change nothing.
Every context runs with `reducedMotion: "reduce"`, so each page is caught in its settled state
rather than mid-animation.

## Adding a screen

Add a row to `SCREENS` with its path and the state it needs (`null` for a signed-out page). If it
needs an account none of the existing states is in, add another rather than advancing one of
them — later captures depend on the others staying where they are.

## Switching commits breaks the build until you clear `.next/types`

`apps/web/tsconfig.json` includes `.next/types/**/*.ts` — the **dev** build's generated route
validator — and `next build` type-checks against it even when it is writing to `.next-e2e`. So the
two-capture workflow above fails on the second run with errors naming routes that do not exist at
that commit:

```
.next/types/validator.ts(53,39): error TS2307: Cannot find module
  '../../src/app/(admin)/admin/calibration/[id]/page.js'
```

They look like missing source files and are not. Clear the generated types and run again — the
directory is a cache and `next dev` rebuilds it:

```bash
rm -rf apps/web/.next/types apps/web/.next/dev/types
```

Left as a documented trap rather than fixed: adding `.next-e2e/types` to the include produces the
same failure in the other direction, and the alternatives (a second tsconfig, or dropping the
generated types from the type-check) are each a bigger change than this deserves.

## What it cannot reach

`error.tsx`, `global-error.tsx` and the `loading.tsx` files render only during a failure or a
pending navigation, so they are not in the list. Check those by hand.

The CMS's **editors** are not in the list either: their paths carry an id that changes every run.
The `new` forms cover the same components with empty fields; an editor with content in it, its
workflow buttons and its history is worth a look by hand after a change to those screens.
