# Data analyst — question bank blueprint

**Wave 2. Status: blueprint only, and it stays that way. No bank is written for this role until
there is a SQL practice surface** (owner's launch gate, 2026-09-22). No row in `roles.yaml`.
Derived from `docs/role-catalogue.md` § Wave 2 and § On data analyst at launch.

## Why this blueprint exists and the bank does not

Demand is real — BI and analytics have grown quickly on the back of fintech and banking, and it is
one of the few well-paid tech roles reachable without a CS background, which matches a large part of
this audience. The owner moved it to wave 2 anyway, and then gated it:

> **Data analyst does not launch until there is a SQL practice surface.**

The reason is product principle 1, not demand. **The centre of an analyst interview is a live query
round.** Without somewhere to write and run a query, a text-only analyst track would sell
preparation it does not provide. A bank, its rubrics and an expert review are all necessary and none
of them is sufficient: the surface is the gate.

**Specifying that surface is the first task of the analyst wave, not an afterthought at the end of
it.** It is not in `PRODUCT_SPEC.md` today. Until it is specified and built, this page is the whole
of the role's content, and it says on its face what we cannot yet do.

## Levels

| Level         | Catalogue | Would offer | Notes                                                                                                         |
| ------------- | --------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| intern-junior | junior    | yes         | The widest entry route of any role on the catalogue — much of it from spreadsheet work, not from programming. |
| mid           | yes       | yes         |                                                                                                               |
| senior        | yes       | no          |                                                                                                               |

## Stack variants

| Variant                 | Would write | Why                                                                          |
| ----------------------- | ----------- | ---------------------------------------------------------------------------- |
| `sql-excel` _(default)_ | 2           | Where most people here start, and still what a great many jobs actually are. |
| `sql-powerbi`           | 2           | The most advertised BI tool in local banking.                                |
| `sql-tableau`           | 2           |                                                                              |
| `python-pandas-sql`     | 2           | The route from analyst towards data engineering.                             |
| `looker`                | 1           | Narrow locally.                                                              |

SQL itself is **not** a variant. It is the topic every one of these has in common, and it is the one
we cannot examine properly yet.

## Core topics

| Topic slug                | Core | Covers                                                                | Deliverable in text?                                                                                                                                                      |
| ------------------------- | ---- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sql`                     | yes  | Joins, aggregation, window functions                                  | **No — this is the gate.** Conversation can ask what a window function is for; it cannot ask whether the candidate can write one under pressure, which is the whole round |
| `data-cleaning`           | yes  | Missing values, duplicates, types that lie                            | Yes                                                                                                                                                                       |
| `descriptive-statistics`  | yes  | Distributions, averages that mislead, significance claimed too easily | Yes                                                                                                                                                                       |
| `metric-definition`       | yes  | What "active user" means, and who decides                             | Yes — and it is the best conversational round the role has                                                                                                                |
| `dashboard-design`        | yes  | What a dashboard is for, and what to leave off it                     | Partly — no drawing surface                                                                                                                                               |
| `data-storytelling`       | yes  | Telling a non-technical stakeholder what the data says                | Yes                                                                                                                                                                       |
| `business-case-reasoning` | yes  | The case round: here is a drop in sign-ups, what do you look at       | Yes                                                                                                                                                                       |
| `spreadsheet-modelling`   | yes  | Lookups, pivots, and a model someone else can follow                  | Partly                                                                                                                                                                    |
| `collaboration`           | yes  | Shared behavioural rubric                                             | Yes                                                                                                                                                                       |

## What the engine can deliver, and what it does not

Proposed `supported_question_types`: `technical, scenario, behavioral`.

| Round a real analyst interview has             | Can we?                                |
| ---------------------------------------------- | -------------------------------------- |
| Live SQL                                       | **No. This is the launch gate.**       |
| Case / business reasoning                      | **Yes**, and well                      |
| Metric definition and stakeholder conversation | **Yes**, and it is the role's best fit |
| Dashboard critique                             | **Partly** — spoken, no surface        |
| Take-home dataset exercise                     | **No**                                 |

## Two things this role changes beyond itself

1. **Rubric dimensions are not universal.** Query correctness, metric definition, business framing
   and communicating to non-technical stakeholders are not what the engineering rubrics score. The
   rubric model already supports it — dimensions are free text — but the readiness formula's
   `technical` / `behavioral` / `communication` split (spec §7) assumes an engineering shape. It is
   tracked as an **M6** item, because M6 builds the formula and that is the cheapest moment to get
   the split right.
2. **A role whose central round we cannot deliver must say so on its own page.** Whatever we ship
   for this role, the page says what it does not prepare you for. That rule is in the catalogue and
   this is the role that will test it.

## Target counts

```yaml
# targets (read by check-bank.mjs)
role: data-analyst
levels: [intern-junior, mid]
general_by_topic:
  data-cleaning: { intern-junior: 2, mid: 2 }
  descriptive-statistics: { intern-junior: 2, mid: 2 }
  metric-definition: { intern-junior: 2, mid: 3 }
  dashboard-design: { intern-junior: 2, mid: 2 }
  data-storytelling: { intern-junior: 2, mid: 2 }
  business-case-reasoning: { intern-junior: 2, mid: 3 }
  spreadsheet-modelling: { intern-junior: 2, mid: 1 }
  collaboration: { intern-junior: 2, mid: 2 }
by_stack:
  sql-excel: 2
  sql-powerbi: 2
  sql-tableau: 2
  python-pandas-sql: 2
  looker: 1
complete: false
```

`sql` carries **no target**, deliberately: writing conversational questions about SQL would be the
exact thing the gate exists to prevent. When the surface is specified, this blueprint is superseded
by one that includes it.

|              | General | Stack-tagged | Total | When                             |
| ------------ | ------- | ------------ | ----- | -------------------------------- |
| Data analyst | ~18     | ~9           | ~27   | **After the SQL surface exists** |

## Out of scope, deliberately

- **The whole bank**, until the gate is met.
- **Senior.**
- Writing "SQL questions the candidate answers in prose" as a workaround. That is the failure mode
  this page is here to name.

---

## Appendix A — fact-check log · Appendix B — critique passes · Appendix C — coverage

_Not applicable until the gate is met._
