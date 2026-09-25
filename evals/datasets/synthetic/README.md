# Synthetic rubric stress tests

Five sample answers per rubric, written against the question that rubric belongs to and scored
against its criteria. They exist to answer one question about each rubric: **would two readers
scoring the same answer pick the same number?**

> **These answers are model-written and model-scored.** They are a rubric test and a regression
> baseline — if the evaluator's score for a fixed answer moves, something changed. They are **not**
> the human-scored gold set the M4 agreement metric needs (CLAUDE.md §3: "Gold-standard answers
> with human scores"). Nothing in here has been read by a person who could be held to it.

Keeping those two apart matters more than either of them. A synthetic set quietly counted as gold
would turn the evaluator's agreement metric into a measurement of the drafter agreeing with itself.
`generated_by: ai_draft` is in every file for that reason, and it does not become `human` because
someone skimmed it.

## The five answers

| `kind`                     | What it is                                                                                     | What it is for                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `strong`                   | What a good candidate at this level actually says — missing a point or two, as real answers do | Anchors the top. If this cannot reach 3s, the rubric is unreachable        |
| `weak`                     | Willing, not knowledgeable                                                                     | Anchors the bottom                                                         |
| `fluent-but-wrong`         | Confident, well-structured, correct vocabulary, **wrong substance**                            | A rubric that cannot tell this from `strong` is scoring fluency            |
| `correct-poorly-explained` | Right, and badly said — out of order, hedged, one long sentence                                | A rubric that cannot tell this from `weak` is scoring articulacy           |
| `nigerian-english`         | The same substance as `strong`, in the idiom a Nigerian candidate actually uses                | Catches a rubric that rewards a particular English rather than engineering |

**The two separations are the whole point**: `fluent-but-wrong` must score clearly below `strong`,
and `correct-poorly-explained` clearly above `weak`, on the criteria that carry the content. The
fifth answer must land within one point of `strong` on every criterion; where it does not, the
descriptor it lost points on is rewarding phrasing, and it is the descriptor that changes.

## File shape

```
evals/datasets/synthetic/<role>/<rubric-slug>.yaml
```

```yaml
version: 1
generated_by: ai_draft
role: frontend
rubric: <rubric slug, from content/seed/<role>/rubrics.yaml>
question: <the question the answers were written against>
answers:
  - kind: strong
    text: |
      Spoken, not written — contractions, restarts, "sorry, let me start again".
    expected:
      - dimension: <as written in the rubric, in the rubric's order>
        score: 3
        because: <which descriptor this lands on, and why>
```

`expected` carries one entry per criterion in the rubric's order, with the dimension repeated so the
file reads on its own and breaks loudly if the rubric is ever reordered.

## The check

```bash
node .claude/skills/question-bank/scripts/check-stress.mjs [--role frontend]
```

Enforces the two separations and the fifth answer's one-point band, and checks each file's
dimensions against the rubric it names, in order. It prints the rubrics sorted by narrowest
separation first: that is the list to look at again whenever the bank changes.

## How they were produced

`.claude/skills/question-bank/references/stress-test.md` is the procedure. The answers are written
**with the rubric out of sight** — writing them from the descriptors produces five answers shaped
like the descriptors, which tests nothing — and scored afterwards. Where a rubric failed to
separate, the **rubric** changed, and what changed is recorded in that role's blueprint appendix.
