# Technical product manager / Business analyst — question bank blueprint

**Wave 3. Status: planning only — no row in `roles.yaml`, no bank.**
Derived from `docs/role-catalogue.md` § Wave 3.

## What the role is

Decides what gets built and writes it down well enough that engineers can build it. The catalogue
calls it **the cheapest role on the whole list to add** — no tooling at all — with a large candidate
pool from bootcamps, and rates the fit **Full**.

It is also the first role on the catalogue that **is not an engineering role**, and that is the
interesting part of this blueprint.

## Levels

| Level         | Catalogue | Would offer | Notes                              |
| ------------- | --------- | ----------- | ---------------------------------- |
| intern-junior | junior    | yes         | Where the bootcamp pipeline lands. |
| mid           | yes       | yes         |                                    |
| senior        | yes       | no          |                                    |

## Stack variants — domains, not technologies

| Variant                  | Would write | Why                                                                                  |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------ |
| `generalist` _(default)_ | 2           |                                                                                      |
| `fintech`                | 3           | The largest employer of these roles here, and the domain knowledge is the interview. |
| `enterprise-banking`     | 2           | Process-heavy, regulated, and genuinely a different job.                             |

This is the first role whose "stack" is a **domain**. The catalogue already frames it that way, and
it works — the variant dimension means "the flavour of interview you will sit", not "the language
you write". Worth noticing before a fourth role makes the same move by accident: the field means
_variant_, not _technology_, and `stacks.yaml` should get a comment saying so when this role lands.

## Core topics

Two are reused: `metric-definition` from the analyst blueprint, and `collaboration`.

| Topic slug               | Core | New?                | Covers                                                                      |
| ------------------------ | ---- | ------------------- | --------------------------------------------------------------------------- |
| `discovery-research`     | yes  | new                 | Talking to users, and the difference between what they say and what they do |
| `writing-requirements`   | yes  | new                 | A story an engineer can build from and a tester can test                    |
| `prioritisation`         | yes  | new                 | Saying no, and the reason behind the order                                  |
| `metric-definition`      | yes  | shared with analyst | What success would look like, decided before the build                      |
| `stakeholder-management` | yes  | new                 | Disagreement, escalation, and the deadline someone else promised            |
| `agile-delivery`         | yes  | new                 | Ceremonies as means, scope as the variable                                  |
| `working-with-engineers` | yes  | new                 | Estimates, trade-offs, and technical debt described honestly                |
| `data-literacy`          | yes  | new                 | Reading a number without over-claiming it                                   |
| `collaboration`          | yes  | existing            | Shared behavioural rubric                                                   |

## What the engine can deliver

Proposed `supported_question_types`: `behavioral, scenario, technical`.

| Round a real interview has       | Can we?                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Product case, spoken             | **Yes** — the central round, and a good fit                                                               |
| Prioritisation and trade-off     | **Yes**                                                                                                   |
| Requirements written on the spot | **Partly** — spoken, not written down; a text session can take a short written answer, a voice one cannot |
| Behavioural / stakeholder        | **Yes**, and it is most of the interview                                                                  |
| Portfolio or artefact review     | **No** — and not planned                                                                                  |

**Nothing structural is missing.**

## The thing this role breaks

**The rubrics are not engineering rubrics, and the readiness formula notices.** Scoring a product
case means scoring judgement, framing and communication — not correctness. The formula's
`technical` / `behavioral` / `communication` split (spec §7) reads oddly when two thirds of a role's
score is judgement. It is an **M6** item, shared with the data analyst, and this role is the one
that makes it concrete.

The shared behavioural rubric, on the other hand, transfers unchanged: a behavioural answer is
judged the same way whoever gives it.

## Target counts

```yaml
# targets (read by check-bank.mjs)
role: tpm-ba
levels: [intern-junior, mid]
general_by_topic:
  discovery-research: { intern-junior: 2, mid: 2 }
  writing-requirements: { intern-junior: 2, mid: 3 }
  prioritisation: { intern-junior: 2, mid: 3 }
  metric-definition: { intern-junior: 2, mid: 2 }
  stakeholder-management: { intern-junior: 2, mid: 3 }
  agile-delivery: { intern-junior: 2, mid: 2 }
  working-with-engineers: { intern-junior: 2, mid: 2 }
  data-literacy: { intern-junior: 2, mid: 2 }
  collaboration: { intern-junior: 2, mid: 2 }
by_stack:
  generalist: 2
  fintech: 3
  enterprise-banking: 2
complete: false
```

|          | General | Stack-tagged | Total   |
| -------- | ------- | ------------ | ------- |
| TPM / BA | ~20     | ~7           | **~27** |

Cheap in tooling, **not** cheap in expertise: this bank needs a reviewer who has run product
interviews, and an engineering reviewer is not a substitute. That is the real cost of the role, and
it is worth saying before someone reads "cheapest on the list" and schedules it as a filler.

## Out of scope, deliberately

- **Senior**, and portfolio review.
- **Design questions.** UI/UX is a portfolio interview and a different product (catalogue, wave 4).

---

## Appendix A — fact-check log · Appendix B — critique passes · Appendix C — coverage

_Filled when the bank is written._
