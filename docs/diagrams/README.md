# Diagrams

The twelve figures from `docs/status-and-dependencies.md`, as SVG — text, diffable, and about
18× smaller than the PNGs they replaced (276 KB against 3.1 MB). They render in Markdown, in an
editor preview and on GitHub.

Filenames follow the figure order in that document.

| File | Figure | What it shows |
| --- | --- | --- |
| `figure-01-system-architecture.svg` | 1 | The three services, the database, the worker and every third party — built vs. planned |
| `figure-02-contract-pipeline.svg` | 2 | Zod as the single source of truth, and the two generation chains CI checks for drift |
| `figure-03-delivery-map.svg` | 3 | Every milestone M0–M10 and phase 2, with its state |
| `figure-04-candidate-journey.svg` | 4 | What a candidate can do today, and exactly where it stops |
| `figure-05-data-model.svg` | 5 | The 28 tables today, clustered, and the ones M3–M8 add |
| `figure-06-content-workflow.svg` | 6 | Seed files → importer → draft → in_review → published → retired, and the rules around it |
| `figure-07-question-bank-status.svg` | 7 | Questions and follow-up probes per role, and what is still owed |
| `figure-08-privacy-lifecycle.svg` | 8 | Consent, export, deletion, the grace period and tombstoned records |
| `figure-09-interview-state-machine.svg` | 9 | The M3 engine, and the split between what our code decides and what the model decides |
| `figure-10-evaluation-to-readiness.svg` | 10 | Transcript → per-answer evaluation → report → readiness score, with its guardrails |
| `figure-11-voice-mode-latency.svg` | 11 | The M5 voice path and the sub-one-second turn budget |
| `figure-12-dependencies-by-milestone.svg` | 12 | What the owner must provide, sorted by when it is needed |

## Conventions

They use the Margin palette (ADR-0013), so they sit beside the product rather than beside a
template: DegRon grey `#4B5563` for structure, `#C2410C` as the pen, `#374151` for text.

- **Solid outline, white or cream fill** — built and tested today.
- **Dashed outline, grey fill** — planned, not written.
- A pill on a box (`BUILT`, `PART BUILT`, `PLANNED`, `MERGED`, `IN FLIGHT`) states it in words too,
  so the distinction never rests on colour alone.

## Regenerating them

The figures are drawn, not exported from a drawing tool: `src/kit.js` is a small SVG kit and each
`src/dN.html` is one figure's content. Edit the figure, then:

```bash
node docs/diagrams/src/render.mjs          # SVG, into this folder — what the repo keeps
node docs/diagrams/src/render.mjs --png    # PNG at 2x, for slides or a Word export
```

The PNGs are not committed: they are 3 MB of binary that regenerates in seconds. Render them when
something needs raster, and leave them out of git.

It needs the Chromium that Playwright installs for the end-to-end suite
(`pnpm --filter @readi/web exec playwright install chromium`). Everything is rendered from one
page, so a change to the kit changes all twelve consistently.
