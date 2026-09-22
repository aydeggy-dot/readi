# The rubric stress test

A rubric is a claim that two readers scoring the same answer will pick the same number. The stress
test is the cheapest way to find out that they would not — before an expert spends an hour on it and
long before a candidate is scored by it.

**Five sample answers per rubric** (owner's decision, 2026-09-22), written against the question that
rubric belongs to, because the rubric is the thing under test. A rubric shared across a role's
questions — the behavioural one — gets **one set per role**, not one per question.

## The five answers

| Answer                           | What it is                                                                                                                                                                                 | What it is for                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **strong**                       | What a good candidate at this level actually says. Not a model answer: it misses a point or two, as real answers do.                                                                       | Anchors the top of the scale. If this does not score 3s and 4s, the rubric is unreachable.                                                     |
| **weak**                         | A candidate who has not met the material. Willing, not knowledgeable.                                                                                                                      | Anchors the bottom. Should not score above 1 on the content criteria.                                                                          |
| **fluent but wrong**             | Confident, well-structured, uses the vocabulary correctly, and the substance is **wrong**.                                                                                                 | The important one. A rubric that cannot tell this from **strong** is scoring fluency.                                                          |
| **correct but poorly explained** | Right, and badly said: out of order, hedged, thin on the reasoning, one long sentence.                                                                                                     | The other important one. A rubric that cannot tell this from **weak** is scoring articulacy.                                                   |
| **correct in Nigerian English**  | The same substance as **strong**, in the idiom and phrasing a Nigerian candidate actually uses — "I now check am", "the thing was not showing", "we now tell them say the deploy go wait". | Catches a rubric that rewards a particular English rather than engineering. It should score within one point of **strong** on every criterion. |

Write the answers as speech, not prose: this is a spoken interview, so contractions, restarts and
"sorry, let me start again" belong in them.

## The rule that makes it worth doing

> **A rubric that cannot separate "fluent but wrong" from "strong", or "correct but poorly
> explained" from "weak", is a defect and gets sharpened.**

Sharpening means the descriptors, not the weights. The usual repairs:

- A descriptor that says _how well_ something was said, not _what_ was said. Delete the manner.
- Levels 3 and 4 differing only in confidence. Give 4 a thing to contain that 3 does not.
- A criterion that scores the whole answer rather than one dimension of it — so a fluent wrong
  answer picks up the same score as a correct one on two of the three criteria.
- No descriptor that a wrong-but-fluent answer would land on. Add it at level 1.

If the fifth answer scores more than one point below **strong** anywhere, the descriptor it lost
points on is rewarding phrasing. Fix it and score again.

## Procedure

1. Write the five answers against the question, with the rubric **out of sight**. Writing them from
   the descriptors produces five answers shaped like the descriptors, which tests nothing.
2. Score each answer against each criterion, and write down the number **and the descriptor you
   landed on**. If you cannot name one descriptor, that criterion is the defect.
3. Check the two separations above, and the fifth answer against the first.
4. Sharpen and re-score. Record what changed, in the blueprint's critique appendix.
5. Save the set as an eval file.

## The eval files

```
evals/datasets/synthetic/<role>/<rubric-slug>.yaml
evals/datasets/synthetic/README.md
```

```yaml
version: 1
generated_by: ai_draft # model-written and model-scored. Never "human".
role: frontend
rubric: async-ordering-understanding
question: js-async-ordering # the question the answers were written against
answers:
  - kind: strong # strong | weak | fluent-but-wrong | correct-poorly-explained | nigerian-english
    text: |
      So it prints 1, then 2, then 3, then 4. The two console.logs run first because…
    expected:
      - dimension: Gets the order right # as written in the rubric, in order
        score: 4
        because: Correct order, and calls out that a zero-delay timer is not immediate.
      - dimension: Explains the mechanism
        score: 3
        because: Distinguishes tasks from microtasks; does not say the stack must empty first.
      - dimension: Connects it to the user
        score: 3
        because: Names a concrete consequence, no remedy.
```

`expected` carries one entry per criterion, **in the rubric's order**, with the dimension repeated
so the file reads on its own and breaks loudly if the rubric is reordered.

## What these are, and are not

`evals/datasets/synthetic/README.md` must say, on its face:

> These answers are **model-written and model-scored**. They are a rubric test and a regression
> baseline — if the evaluator's score for a fixed answer moves, something changed. They are **not**
> the human-scored gold set the M4 agreement metric needs (CLAUDE.md §3: "Gold-standard answers with
> human scores"). Nothing in here has been read by a person who could be held to it.

Keeping the two apart matters more than either of them. A synthetic set quietly counted as gold
would make the evaluator's agreement metric a measurement of the drafter agreeing with itself.
