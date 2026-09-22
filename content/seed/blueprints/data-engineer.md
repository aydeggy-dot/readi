# Data engineer — question bank blueprint

**Wave 3. Status: planning only — no row in `roles.yaml`, no bank, and none written until wave 3
starts.** Derived from `docs/role-catalogue.md` § Wave 3.

## What the role is

Builds the pipelines and the warehouse the analysts work on top of. It follows analyst demand, and
banks and fintechs here are building warehouses now.

An interview for it turns on **pipeline design** — where the data comes from, what it costs to move,
what happens when a day's load fails at 3 a.m. and someone has to re-run it without duplicating
everything.

## Levels

| Level         | Catalogue  | Would offer            | Notes                                                                                            |
| ------------- | ---------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| intern-junior | not listed | **no**                 | Like AI/LLM, nobody is hired into this as a first job; they arrive from analyst or backend work. |
| mid           | yes        | **yes — the only one** |                                                                                                  |
| senior        | yes        | no                     |                                                                                                  |

## Stack variants

| Variant                          | Would write | Why                                                         |
| -------------------------------- | ----------- | ----------------------------------------------------------- |
| `python-sql-airflow` _(default)_ | 3           | The common shape here.                                      |
| `dbt-warehouse`                  | 2           | BigQuery, Snowflake, Redshift — the modern-warehouse route. |
| `spark`                          | 2           |                                                             |
| `kafka`                          | 1           | Streaming is the narrowest of the four locally.             |

## Core topics

Three are reused from earlier waves, which is the pattern: a topic belongs to the catalogue, not to
a role.

| Topic slug                 | Core | New?               | Covers                                                                |
| -------------------------- | ---- | ------------------ | --------------------------------------------------------------------- |
| `data-modelling`           | yes  | new                | Star schemas, grain, and the model that survives the third question   |
| `etl-elt`                  | yes  | new                | Where the transformation happens and why it moved                     |
| `orchestration`            | yes  | shared with DevOps | Scheduling, dependencies, retries, backfills                          |
| `batch-vs-streaming`       | yes  | new                | Which problem is which, and the cost of getting it wrong              |
| `data-quality`             | yes  | new                | Tests on data rather than on code; what you do with the bad row       |
| `partitioning-performance` | yes  | new                | Partitions, clustering, and a query that scans a year to answer a day |
| `warehouse-cost`           | yes  | new                | The bill as a design constraint                                       |
| `sql-depth`                | yes  | new                | Window functions, set logic — **spoken, not written** (see below)     |
| `collaboration`            | yes  | existing           | Shared behavioural rubric                                             |

## What the engine can deliver

Proposed `supported_question_types`: `technical, scenario, behavioral`.

| Round a real interview has            | Can we?                                                  |
| ------------------------------------- | -------------------------------------------------------- |
| Pipeline design, spoken               | **Yes** — and it is the central round                    |
| "The nightly load failed — what now?" | **Yes**, the engine's best shape                         |
| Behavioural                           | **Yes**                                                  |
| Diagram the pipeline                  | **No** — Excalidraw is P2                                |
| Live SQL                              | **No** — the same missing surface that gates the analyst |

**The SQL gate applies here differently.** For the analyst, the live-query round _is_ the interview,
so the role waits. For the data engineer it is one round among several and the design round carries
the weight — so this role can launch without the surface, and its page says the SQL round is not
covered. That distinction should be checked with a reviewer who has actually run these interviews
before wave 3 commits to it.

## Target counts

Nine topics at one level, floor of two, `data-modelling` and `orchestration` earning three as the
two things the role is actually hired for:

```yaml
# targets (read by check-bank.mjs)
role: data-engineer
levels: [mid]
general_by_topic:
  data-modelling: { mid: 3 }
  etl-elt: { mid: 2 }
  orchestration: { mid: 3 }
  batch-vs-streaming: { mid: 2 }
  data-quality: { mid: 2 }
  partitioning-performance: { mid: 2 }
  warehouse-cost: { mid: 2 }
  sql-depth: { mid: 2 }
  collaboration: { mid: 2 }
by_stack:
  python-sql-airflow: 3
  dbt-warehouse: 2
  spark: 2
  kafka: 1
complete: false
```

|               | General | Stack-tagged | Total   |
| ------------- | ------- | ------------ | ------- |
| Data engineer | ~20     | ~8           | **~28** |

## Out of scope, deliberately

- **Junior and senior.**
- **Anything needing a notebook, a warehouse or a diagram surface.**

---

## Appendix A — fact-check log · Appendix B — critique passes · Appendix C — coverage

_Filled when the bank is written._
