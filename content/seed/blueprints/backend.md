# Backend engineer — question bank blueprint

**Wave 1. Status: blueprint drafted 2026-09-22; the bank is 3 questions and is being extended.**
Derived from `docs/role-catalogue.md` § Backend Engineer.

## What the role is

APIs, data, and the services behind them — the most requested hire in this market, local and remote.
An interview for it is trying to find out whether the candidate understands what happens between the
request arriving and the response leaving: what the database was actually asked, what happens when a
dependency is slow, and what the client is entitled to rely on. It is the role where "it works on my
machine" is most often the whole problem.

**It is also the thinnest bank we have**, and the one where the gap between what we advertise and
what we deliver is widest today.

## Levels

| Level         | Offered                                     | Written in this pass | Notes                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| intern-junior | yes                                         | yes                  | **Not one backend-specific question is offered at this level today** — all three are `mid`, and a junior backend candidate's practice consists of two shared behavioural questions. This is the single biggest content hole in wave 1. |
| mid           | yes                                         | yes                  | The existing three, and the track.                                                                                                                                                                                                     |
| senior        | no — the level exists and no role offers it | no                   | `levels.yaml` says why.                                                                                                                                                                                                                |

## Stack variants

Seven, from `roles.yaml` — the widest variant spread of any wave-1 role, and the one where a general
question most often turns out to be a Node question in disguise.

| Variant              | Own questions | Why                                                                                                                                 |
| -------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `nodejs` _(default)_ | 3             | The default and the most advertised here.                                                                                           |
| `java-spring`        | 2             | Banking and enterprise. A Spring candidate asked Node questions learns nothing.                                                     |
| `python-backend`     | 2             | Django and FastAPI, both common in local product work.                                                                              |
| `php-laravel`        | 2             | Very widely used here in agency and product work, and the variant a bank written by a JavaScript drafter is most likely to neglect. |
| `golang`             | 1             | Growing, still narrow locally.                                                                                                      |
| `dotnet`             | 1             | Enterprise and banking, narrow.                                                                                                     |
| `ruby-rails`         | 1             | Narrowest of the seven here.                                                                                                        |

**A variant with one question is a variant we are not really serving.** Three of these are at one
deliberately, and the reviewer's answer decides between two outcomes: it earns a second question, or
it comes off `roles.yaml` altogether. Offering a variant in the onboarding picker and then handing
that candidate the general set is worse than not offering it.

## Core topics

Eleven in the catalogue. Ten map to topics; `indexing and transactions` folds into `databases` as
subtopics rather than becoming a topic of its own, because a question about an index is a question
about the database.

| Topic slug             | Core     | In `topics.yaml` | General today (ij / mid) | Target (ij / mid) |
| ---------------------- | -------- | ---------------- | ------------------------ | ----------------- |
| `api-design`           | yes      | yes              | 0 / 1                    | 2 / 2             |
| `databases`            | yes      | yes              | 0 / 1                    | 2 / 2             |
| `caching`              | yes      | **new**          | 0 / 0                    | 2 / 2             |
| `async-work`           | yes      | **new**          | 0 / 0                    | 2 / 2             |
| `auth`                 | yes      | **new**          | 0 / 0                    | 2 / 2             |
| `concurrency`          | yes      | **new**          | 0 / 0                    | 1 / 2             |
| `backend-reliability`  | yes      | yes              | 0 / 0                    | 2 / 2             |
| `backend-testing`      | yes      | **new**          | 0 / 0                    | 2 / 2             |
| `observability`        | yes      | **new**          | 0 / 0                    | 2 / 2             |
| `system-design-basics` | mid only | **new**          | 0 / 0                    | 0 / 2             |
| `collaboration`        | yes      | yes              | 2 / 2                    | 2 / 2             |

Two deliberate deviations from the floor of two per core topic per level:

- **`concurrency` at intern-junior: one.** A junior is fairly asked what a race condition is and why
  two requests can both read "in stock"; they are not fairly asked about lock ordering. One question
  at that level, two at mid.
- **`system-design-basics` at intern-junior: none.** It is a mid topic, and it is the one that most
  often gets asked of juniors as a way of failing them.

**New topic rows this bank needs:** `caching`, `async-work`, `auth`, `concurrency`,
`backend-testing`, `observability`, `system-design-basics` — seven, added to `topics.yaml` in the
same change as the questions that hang from them. Topics are shared across roles by design, and five
of these seven will be reused by DevOps, data engineering and full-stack.

## What the engine can deliver

`supported_question_types` for backend is `technical, scenario, behavioral`.

| Round a real backend interview has      | Can we?                                                                         | Consequence                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API and data modelling discussion       | **Yes**                                                                         | The bulk of this bank.                                                                                                                                                                  |
| "Why is this slow / why did this break" | **Yes** — the engine's best shape                                               | `n-plus-one-diagnosis` is the template.                                                                                                                                                 |
| Behavioural                             | **Yes**                                                                         | Shared rubric.                                                                                                                                                                          |
| Live coding                             | **No** — needs a code editor (P2)                                               | No question asks for code to be written.                                                                                                                                                |
| System design                           | **Partly** — the trade-offs as conversation, never a diagram (Excalidraw is P2) | `system-design-basics` questions ask _when_ you would add a cache or a queue and what it costs, not "design a URL shortener". The role's page must say the design round is not covered. |
| SQL written live                        | **No** — no query surface exists                                                | Questions about queries ask what the database did and why, never "write the query".                                                                                                     |

## Target counts

Forty-one general slots (the table above, summed), of which six are filled — one API question, one
database question, and the two shared behavioural questions covering both levels. Filling the
remaining 35 takes **about 20 new general questions**, most carrying both levels.

Twelve stack slots, all empty: **about 12 new tagged questions**, with little overlap between
variants because that is the point of tagging them.

```yaml
# targets (read by check-bank.mjs)
role: backend
levels: [intern-junior, mid]
general_by_topic:
  api-design: { intern-junior: 2, mid: 2 }
  databases: { intern-junior: 2, mid: 2 }
  caching: { intern-junior: 2, mid: 2 }
  async-work: { intern-junior: 2, mid: 2 }
  auth: { intern-junior: 2, mid: 2 }
  concurrency: { intern-junior: 1, mid: 2 }
  backend-reliability: { intern-junior: 2, mid: 2 }
  backend-testing: { intern-junior: 2, mid: 2 }
  observability: { intern-junior: 2, mid: 2 }
  system-design-basics: { mid: 2 }
  collaboration: { intern-junior: 2, mid: 2 }
  # Added after the frontend pass, which created both topics and wrote the first question of each.
  # The second of each is role-general and was written here, as that blueprint said it would be.
  written-communication: { intern-junior: 2, mid: 2 }
  own-work: { intern-junior: 2, mid: 2 }
by_stack:
  nodejs: 3
  java-spring: 2
  python-backend: 2
  php-laravel: 2
  golang: 1
  dotnet: 1
  ruby-rails: 1
complete: false
```

|         | General | Stack-tagged | Total   | Today |
| ------- | ------- | ------------ | ------- | ----- |
| Backend | ~22     | ~12          | **~34** | 3     |

About 30 new rubrics — one per new technical and scenario question.

## The existing three

- `api-error-shape` — its notes ask whether 409 vs 422 is a reasonable expectation or obscurity
  wearing a suit. The fairness pass should answer it.
- `n-plus-one-diagnosis` — its notes ask whether "fast locally, slow in production" gives the answer
  away. Worth testing with the **fluent but wrong** sample answer: if a candidate can score well by
  repeating the hint, it does.
- `incident-you-contributed-to` — mid, shared behavioural rubric, and the notes worry it measures
  interview coaching rather than judgement. It is also the only backend question at mid that is not
  technical, which is a ratio the bank needs to keep as it grows: roughly one behavioural question
  in four.

## Out of scope, deliberately

- **Senior**, and any question that only makes sense above mid.
- **Live coding and live SQL.** Named on the role's page rather than quietly missing.
- **A full system-design round.** Two conversational questions about trade-offs are not a design
  round, and the bank should not pretend otherwise.
- **An `intern-junior` track.** Backend's only track is at `mid`; the junior one is lessons work, not
  question-bank work. `check-bank.mjs` reports it every run.

---

## Appendix A — fact-check log

Every version-sensitive claim in the bank, checked against the vendor's own current documentation on
**2026-09-22**. All nine are in the stack-tagged set, which is where a bank goes stale: nothing in
the general set names a product. Each of the nine questions opens its `reviewer_notes` with the
marker `**Version-sensitive: <claim>, checked against <source> on <date>.**`, so
`grep -l 'Version-sensitive' content/seed/*/questions.yaml` finds them across every bank
(`SKILL.md`, hard rules).

**Four of the nine had moved, and one of those was a defect in the question rather than in a note.**

| Question                             | Claim                                                                                          | Checked against                                     | Outcome                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spring-default-error-body`          | The `{timestamp, status, error, trace, message, path}` body is what a default Boot app returns | docs.spring.io, Spring Boot 4.1                     | **Moved, and the question was wrong.** `trace`, `message` and `errors` are **off by default** and the keys are omitted entirely, so a default app returns only `{timestamp, status, error, path}` — the body in the snippet was not plausible out of the box. The prompt now says the service has switched those settings on. Also: in Boot 4.0 the properties moved from `server.error.*` to `spring.web.error.*` |
| `spring-transaction-did-not-roll-back` | Self-invocation bypasses the `@Transactional` proxy; the docs prefer moving the boundary to self-injecting | docs.spring.io, Spring Framework 7.0                | **Half moved.** The mechanism holds verbatim — "only external method calls coming in through the proxy are intercepted". But the docs rank *three* fixes and **document self-injection as an alternative**; only `AopContext.currentProxy()` is "highly discouraged". The rubric scored a self reference at level 1 and now credits it at 3, with the refactor preferred at 4                           |
| `laravel-mass-assignment`            | `protected $guarded = []` disables mass-assignment protection                                  | laravel.com, Laravel 13                             | **Behaviour holds, syntax moved.** Laravel 13 documents PHP attributes — `#[Fillable]`, `#[Guarded]`, `#[Unguarded]` — and no longer shows the properties, though the upgrade guide lists no breaking change so they still work. The snippet stays in the property form, which is what an existing codebase looks like, and the answer key and rubric now credit either form |
| `node-blocked-event-loop`            | `worker_threads` and streaming are the documented remedies for CPU work in a handler           | nodejs.org API docs vs the "Don't Block" learn page | **Unresolved, and Node's own docs disagree.** The API docs call `worker_threads` stable and useful for CPU-intensive JavaScript; the learn guide never mentions it and still points at C++ addons, an abandoned npm package, child processes and cluster. A worker thread and a separate process are credited equally                                             |
| `python-blocking-call-in-async`      | A plain `def` path operation runs in a threadpool; `async def` runs on the loop                | fastapi.tiangolo.com                                | Holds, verbatim, and the guidance ("if you just don't know, use normal `def`") is unchanged — which is what makes the last answer-key point true                                                                                                                                                                                                              |
| `django-save-overwrote-a-change`     | `save()` writes all fields; `update_fields` writes some; `QuerySet.update()` writes without reading | docs.djangoproject.com                              | Holds. Two nuances worth crediting that the answer key does not yet name: a model loaded with `only()`/`defer()` writes only the loaded fields, and the docs point at `F()` expressions for avoiding exactly this race                                                                                                                                       |
| `laravel-worker-running-old-code`    | A queue worker holds the booted application in memory and misses deployed changes              | laravel.com, Laravel 13                             | Holds, verbatim: "queue workers are long-lived processes and store the booted application state in memory… they will not notice changes in your code base after they have been started"                                                                                                                                                                       |
| `dotnet-blocking-on-async`           | No synchronisation context on ASP.NET Core, so `.Result` starves the thread pool rather than deadlocking | learn.microsoft.com, rule CA2007                    | Holds, and the citation changed: the ASP.NET Core best-practices page no longer uses the term, CA2007 does. **Caveat added:** Blazor *does* have a synchronisation context, so a candidate who asks which part of ASP.NET Core is ahead of the question                                                                                                        |
| `rails-callback-that-did-too-much`   | `after_save` runs inside the save, so `deliver_now` blocks it; the guide cautions against side effects | guides.rubyonrails.org, Rails 8.1                   | Holds. The guide's current answer for reaching outside the record is `after_commit`, "most useful when your Active Record models need to interact with external systems", and its own example uses `deliver_later`                                                                                                                                             |

Nothing in the general set names a product, a version, a price or a benchmark, so nothing there can
go stale silently. **The nine above are the re-check list**, and `tasks/todo.md` carries the open
decision on how often that happens and who does it — the marking makes them findable, which is not
the same as making them checked.

## Appendix B — what the critique passes changed

| Pass                         | Findings | Applied | To `reviewer_notes` |
| ---------------------------- | -------- | ------- | ------------------- |
| Senior interviewer (Nigeria) |          |         |                     |
| Hiring manager (remote)      |          |         |                     |
| Nervous junior               |          |         |                     |
| Fairness                     |          |         |                     |

## Appendix C — coverage after drafting

_Filled at the end of the role's pass._
