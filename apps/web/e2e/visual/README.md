# Visual review screenshots

`capture.spec.ts` takes a full-page screenshot of every screen the app can render, at 360px and
1280px, in light and dark mode: 80 images per run. It exists so a visual change can be reviewed
screen by screen instead of by clicking through the app, and so two runs are comparable.

It is part of the e2e suite but skipped unless `E2E_SCREENSHOTS` is set, like `slow-network.spec.ts`.

```bash
git switch main
E2E_SCREENSHOTS=before pnpm test:e2e visual     # the base you are changing from

git switch your-branch
E2E_SCREENSHOTS=after  pnpm test:e2e visual     # the same 80 screens, after
```

Output goes to `screenshots/<label>/<screen>-<width>-<theme>.png` at the repo root, which is
gitignored — **screenshots are never committed**. Delete the folder when you are done with it.

## What it does

`pnpm test:e2e` builds the API and the web app into their own output folders and starts them on
their own ports (3010/4010/8010), so a run never disturbs `pnpm dev`. The spec then seeds three
accounts, each parked where a group of screens becomes reachable:

| State   | How it is left                      | Screens it unlocks                      |
| ------- | ----------------------------------- | --------------------------------------- |
| `fresh` | signed up, nothing filled in        | `/onboarding/profile`                   |
| `mid`   | profile done, no CV                 | `/onboarding/cv`, `/onboarding/consent` |
| `done`  | onboarded, CV parsed, admin granted | `/home`, `/profile/*`, `/admin`         |

The accounts are made once and replayed as cookies, so the 80 captures themselves change nothing.
Every context runs with `reducedMotion: "reduce"`, so each page is caught in its settled state
rather than mid-animation.

## Adding a screen

Add a row to `SCREENS` with its path and the state it needs (`null` for a signed-out page). If it
needs an account in a state none of the three are in, add a fourth rather than advancing an
existing one — later captures depend on the three staying where they are.

## What it cannot reach

`error.tsx`, `global-error.tsx` and the `loading.tsx` files render only during a failure or a
pending navigation, so they are not in the list. Check those by hand.
