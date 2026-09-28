# The gold set — human-scored answers

**This directory is empty of data, and that is the honest state.** Nothing in
`evals/datasets/synthetic` belongs here: those answers were written by a model and scored by a model,
and moving one across would turn the evaluator's agreement metric into a measurement of the drafter
agreeing with itself. `generated_by: ai_draft` is in every synthetic file for exactly that reason, and
it does not become `human` because somebody skimmed it.

Until a reviewer has scored answers here, **every agreement figure the harness prints means nothing
about quality.** It is a regression baseline: it says whether a fixed answer's score has moved. That
is worth having and is not the same claim.

## The format

Identical to a synthetic stress set, with three additions and one change:

```yaml
version: 1
generated_by:
  human # the change. `ai_draft` here is a contradiction and the loader is blind
  # to the difference, so the reviewer's own care is what enforces it
scored_by: <reviewer id or name> # who can be held to these numbers
scored_at: 2026-10-14 # when, so a rubric edited afterwards is visible
rubric: <slug, from content/seed>
question: <slug, from a content/seed bank>
role: <the directory this sits in>
answers:
  - kind: <any label; the five synthetic kinds are not required here>
    text: |
      What the candidate actually said.
    expected:
      - dimension: <as written in the rubric, in the rubric's order>
        score: 3
        because: <why this rung and not the one below>
```

`expected` carries one entry per criterion **in the rubric's order**, with the dimension repeated. The
loader checks those names against the rubric and refuses the file if they do not match, so a reordered
or renamed criterion breaks loudly instead of quietly scoring the wrong thing.

`*.template.yaml` files are skipped by the loader. `example.template.yaml` beside this README is the
worked shape to copy; it is not data and is never counted.

## Where these answers come from

**Not from a candidate's transcript unless that candidate consented and a signed reviewer agreement
exists** (ADR-0017, and the phase 6 blocker in `tasks/todo.md`). `transcript_review` is an opt-in
consent, default off, and nothing may sample an answer except through
`ConsentsService.usersGranting()`. Staff-authored answers need none of that and are the right way to
start.

## The two separations, for a gold set

The synthetic sets are built around five paired answers because the two separations and the fairness
band are comparisons _within_ one rubric. A gold set does not have to be shaped that way — a set of
real answers scored by a person is worth having on its own — but a gold set that keeps the shape
measures more. Where the labels are absent, the harness reports the separations as "not measured"
rather than passing them.
