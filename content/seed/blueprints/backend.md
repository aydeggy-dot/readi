# Backend engineer — question bank blueprint

**Wave 1. Status: drafted, critiqued, fact-checked and stress-tested 2026-09-22; the owner's six
decisions applied 2026-09-23. The bank is 34 questions — 25 general and 9 stack-tagged — and goes
next to a human expert.**
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
| ~~`golang`~~         | —             | **Off `roles.yaml` 2026-09-23.** One question is not a variant we are serving.                                                      |
| ~~`dotnet`~~         | —             | **Off `roles.yaml` 2026-09-23.** Same.                                                                                              |
| ~~`ruby-rails`~~     | —             | **Off `roles.yaml` 2026-09-23.** Same. (Full-stack still offers it; nothing is tagged for it now.)                                  |

**A variant with one question is a variant we are not really serving**, and the owner's decision on
2026-09-23 was to take all three off `roles.yaml` rather than leave them advertised and unserved.
`dotnet-blocking-on-async`, `go-the-error-nobody-checked` and `rails-callback-that-did-too-much`
went with them, along with their rubrics and stress sets. `tasks/todo.md` carries the question for
the reviewers: **which of the three does this market actually hire for?** Whichever they name comes
back with a real bank of its own, not one question.

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
complete: false
```

|         | General | Stack-tagged | Total  | Was |
| ------- | ------- | ------------ | ------ | --- |
| Backend | 25      | 9            | **34** | 3   |

About 30 new rubrics — one per new technical and scenario question.

## The existing three

- `api-error-shape` — its notes ask whether 409 vs 422 is a reasonable expectation or obscurity
  wearing a suit. The fairness pass should answer it.
- `n-plus-one-diagnosis` — its notes ask whether "fast locally, slow in production" gives the answer
  away. Worth testing with the **fluent but wrong** sample answer: if a candidate can score well by
  repeating the hint, it does.
- `incident-you-contributed-to` — mid, and the notes worried it measures interview coaching rather
  than judgement. It now has `incident-ownership` (Appendix B2).

**The ratio, changed 2026-09-23.** This blueprint used to say "roughly one behavioural question in
four", counting the `behavioral` **type**. That was the wrong thing to count: the two best
judgement questions in the bank (`the-ticket-nobody-can-explain`,
`a-change-you-are-not-sure-about`) are typed `scenario`, because they are hypotheticals rather than
"tell me about a time". The target is now **one question in four, counted over what a candidate is
actually offered, hanging from `collaboration`, `written-communication` or `own-work`** — what it
tests, not what it is called. Backend is at **9 of 38, 24%**, against 3 of 37 before this pass.

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

| Question                               | Claim                                                                                                      | Checked against                                     | Outcome                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spring-default-error-body`            | The `{timestamp, status, error, trace, message, path}` body is what a default Boot app returns             | docs.spring.io, Spring Boot 4.1                     | **Moved, and the question was wrong.** `trace`, `message` and `errors` are **off by default** and the keys are omitted entirely, so a default app returns only `{timestamp, status, error, path}` — the body in the snippet was not plausible out of the box. The prompt now says the service has switched those settings on. Also: in Boot 4.0 the properties moved from `server.error.*` to `spring.web.error.*` |
| `spring-transaction-did-not-roll-back` | Self-invocation bypasses the `@Transactional` proxy; the docs prefer moving the boundary to self-injecting | docs.spring.io, Spring Framework 7.0                | **Half moved.** The mechanism holds verbatim — "only external method calls coming in through the proxy are intercepted". But the docs rank _three_ fixes and **document self-injection as an alternative**; only `AopContext.currentProxy()` is "highly discouraged". The rubric scored a self reference at level 1 and now credits it at 3, with the refactor preferred at 4                                      |
| `laravel-mass-assignment`              | `protected $guarded = []` disables mass-assignment protection                                              | laravel.com, Laravel 13                             | **Behaviour holds, syntax moved.** Laravel 13 documents PHP attributes — `#[Fillable]`, `#[Guarded]`, `#[Unguarded]` — and no longer shows the properties, though the upgrade guide lists no breaking change so they still work. The snippet stays in the property form, which is what an existing codebase looks like, and the answer key and rubric now credit either form                                       |
| `node-blocked-event-loop`              | `worker_threads` and streaming are the documented remedies for CPU work in a handler                       | nodejs.org API docs vs the "Don't Block" learn page | **Unresolved, and Node's own docs disagree.** The API docs call `worker_threads` stable and useful for CPU-intensive JavaScript; the learn guide never mentions it and still points at C++ addons, an abandoned npm package, child processes and cluster. A worker thread and a separate process are credited equally                                                                                              |
| `python-blocking-call-in-async`        | A plain `def` path operation runs in a threadpool; `async def` runs on the loop                            | fastapi.tiangolo.com                                | Holds, verbatim, and the guidance ("if you just don't know, use normal `def`") is unchanged — which is what makes the last answer-key point true                                                                                                                                                                                                                                                                   |
| `django-save-overwrote-a-change`       | `save()` writes all fields; `update_fields` writes some; `QuerySet.update()` writes without reading        | docs.djangoproject.com                              | Holds. Two nuances worth crediting that the answer key does not yet name: a model loaded with `only()`/`defer()` writes only the loaded fields, and the docs point at `F()` expressions for avoiding exactly this race                                                                                                                                                                                             |
| `laravel-worker-running-old-code`      | A queue worker holds the booted application in memory and misses deployed changes                          | laravel.com, Laravel 13                             | Holds, verbatim: "queue workers are long-lived processes and store the booted application state in memory… they will not notice changes in your code base after they have been started"                                                                                                                                                                                                                            |
| `dotnet-blocking-on-async`             | No synchronisation context on ASP.NET Core, so `.Result` starves the thread pool rather than deadlocking   | learn.microsoft.com, rule CA2007                    | Holds, and the citation changed: the ASP.NET Core best-practices page no longer uses the term, CA2007 does. **Caveat added:** Blazor _does_ have a synchronisation context, so a candidate who asks which part of ASP.NET Core is ahead of the question                                                                                                                                                            |
| `rails-callback-that-did-too-much`     | `after_save` runs inside the save, so `deliver_now` blocks it; the guide cautions against side effects     | guides.rubyonrails.org, Rails 8.1                   | Holds. The guide's current answer for reaching outside the record is `after_commit`, "most useful when your Active Record models need to interact with external systems", and its own example uses `deliver_later`                                                                                                                                                                                                 |

Nothing in the general set names a product, a version, a price or a benchmark, so nothing there can
go stale silently. **The nine above are the re-check list**, and `tasks/todo.md` carries the open
decision on how often that happens and who does it — the marking makes them findable, which is not
the same as making them checked.

## Appendix B — what the critique passes changed

Four passes, run separately as parallel subagents, each given the bank and its own brief and nothing
about the other three (`.claude/skills/question-bank/references/critique.md`).

| Pass                         | Raised | Applied as edits | Left in `reviewer_notes` |
| ---------------------------- | ------ | ---------------- | ------------------------ |
| Senior interviewer (Nigeria) | 26     | 12               | 6                        |
| Hiring manager (remote)      | 26     | 9                | 8                        |
| Nervous junior               | 31     | 24               | 2                        |
| Fairness reviewer            | 27     | 19               | 3                        |

**Two passes independently named the same worst problem, and it was the drafter's own from that
morning.** The house rule added after the frontend stress test read "a descriptor that fits a
**confident**, specific, wrong answer" — and writing it that way put the word _confident_,
_confidently_ or _with conviction_ into **34 level-1 descriptors across both banks**. Every word in
a descriptor is a scoring instruction, so that one told the evaluator to attend to how an answer
sounded: the exact defect `rubrics.shared.yaml` had been reworked to remove that same day,
reintroduced by the fix for a different problem. It also did no work — what separates level 1 from
level 2 is that **level 1 names a specific wrong mechanism and level 2 is vague**, and a hesitant
candidate naming the same wrong mechanism has to land in the same band. All 34 are rewritten to name
the belief, and `SKILL.md` now carries "name the belief, never the manner" with the story attached
so the next bank does not repeat it.

**Two factual defects in questions the drafter wrote**, both found by reading rather than by
checking a vendor:

- `db-money-as-a-float` asked why daily naira totals drift a few kobo and get worse over a month.
  `double precision` carries fifteen to sixteen significant digits, so a total would have to reach
  about ₦10^14 before losing a kobo — **and float errors are signed and largely cancel rather than
  accumulating**, so the rubric's second criterion was charging 30% for an explanation that is not
  true. The fairness pass found the same thing from the other end: the example value, 1500.50, is
  exactly representable in binary, so the premise was false of the number on screen and the
  candidate who understands floating point best was the one most likely to be marked down. The
  question now turns on an equality comparison, which is what binary floats actually break, and the
  criterion was replaced.
- `node-async-error-never-caught` said the request hangs until it times out. Since Node 15 an
  unhandled rejection is an uncaught exception and **the process exits**, taking every other request
  in flight with it. That is the better question, and the prompt now asks it.

**The systemic defect the frontend pass found nine times, found here eighteen times**: a criterion
carrying 20–40% for something the spoken prompt never asks for. `api-error-shape` charged 35% for
status codes in a prompt that never said the word; `what-to-cache-and-for-how-long` scored level 0
for treating caching as the fix for a struggling database, which is the premise it handed the
candidate; `cache-key-that-leaked` asked "what would you do first" and scored the obvious answer at
level 0. All eighteen prompts fixed. Five snippets were also wrong or gave the game away: an
undefined Rails callback that would raise on every save, a Go handler whose return type decided the
whole first criterion and was not shown, a Node comment that labelled the expensive line, Django
comments that pre-answered a criterion, and a Spring snippet that did not say whether the exception
was checked.

**The fairness pass's findings were, almost without exception, the bank scoring employment rather
than competence**, and all of these are applied:

- `cache-key-diagnosis` required standing to turn a feature off; "take it straight to whoever owns
  this and ask" now scores the same as doing it yourself.
- `duplicate-job-reasoning` asked a junior to contact a vendor about money, which in many places
  would be a firing offence; it now asks that the vendor be told by whoever the right person is.
- `alerting-judgement` scored a free uptime check at 1, when it is often the only monitoring this
  audience has ever had access to — it is now a 2, "a real signal that would not have caught this
  one". The same rubric required converting "one in twelve" to "eight percent" aloud.
- `sync-over-async-diagnosis` scored the .NET deadlock answer at 1, although it is what almost all
  freely available material still teaches; it is out of date rather than misunderstood, and is now
  a 2 — which is also what that question's own `reviewer_notes` already claimed.
- `authorisation-reasoning` and `mass-assignment-diagnosis` both scored code review at 1 as a
  quality mechanism, when it is the one many of this audience have seen work.
- `escalating-early` capped a candidate who has never owned a committed date at 60%, and its
  level 1 scored waiting-for-certainty as a judgement failure — which is learned behaviour where
  raising a slip early marks you as unreliable. Reweighted 40/30/30 toward the message, with the
  `help-seeking-judgement` construction ("a fact about the workplace, not a fault in the
  candidate") copied into the description.

**Weights both the senior and the hiring-manager pass wanted moved**, applied:
`transaction-boundary-reasoning` criterion 3 (dealing with the rows that are already wrong) from 25%
to 35%, because it is the most predictive criterion in the question and carried the least;
`spring-transaction-diagnosis` criterion 1 from 45% to 35%, because self-invocation is the
most-published Spring interview answer in existence and a listicle read the night before scores the
same as having debugged it; `framework-error-body-judgement` criterion 2 from 30% to 20%, because a
framework version in a stack trace is a minor exposure and enforcing one error shape is not.

## Appendix B2 — what the rubric stress test changed

Five answers per rubric — **37 rubrics, 185 answers** — written from the prompts alone by seven
subagents that never opened a rubric file, then scored against the criteria.
`check-stress.mjs` enforces the two separations mechanically. **Every rubric passes**:
`fluent-but-wrong` falls between 1.25 and 3.35 points below `strong`, `correct-poorly-explained`
sits 1.70 to 3.00 above `weak`, and `nigerian-english` is within one point of `strong` on every
criterion of every rubric.

**The exercise broke one rubric outright and sharpened twenty-three descriptors.**

The outright break was `behavioural-answer-quality` on `incident-you-contributed-to`. Two critique
passes had already said independently that the shared rubric could not score what that question asks
— owning a share of the fault, telling someone early, a change that outlived the incident all sat in
`ideal_points` with no criterion to land on — and it was left as a judgement for the reviewer. The
stress test then proved it: a polished, specific, well-told story about diagnosing **somebody
else's** Friday-evening outage, with real actions and a real durable change, scored **3.70 against
`strong`'s 3.70**. Identical. The question now has `incident-ownership`, built the way
`help-seeking-judgement` and `handling-review-feedback` already were — the middle criterion stays
close to the shared one, and the first and last become what this question is actually about. The
same answer now scores 2.75, which is the narrowest separation in the bank and honestly so: it is a
good answer to a different question, and criterion 1 is the only thing that catches it.

The twenty-three sharpenings were all the same shape — **a wrong answer with nowhere to land**:

- `query-performance-diagnosis` demanded an execution plan at level 3, so a `strong` answer that
  counts the queries — which is the right move for an N+1 — was capped at 2 on a 40% criterion.
- `lost-update-reasoning` had no descriptor for a durability setting; `event-loop-blocking-diagnosis`
  none for tuning the infrastructure around work that never left the thread;
  `collection-endpoint-design` none for a migration plan that is _believed_ compatible and quietly
  gives the old app two hundred rows of forty thousand.
- `scaling-out-reasoning` level 0 read "expects it to work"; the fluent-wrong answer names every
  breakage correctly and argues each one away with sticky sessions, which is not the same thing.
- `two-people-bought-the-last-one` had no home for "routes the read somewhere fresher", and
  `go-the-error-nobody-checked` none for "skips the error and tests the returned value instead".

**The three narrowest separations are the three to watch**: `incident-ownership` (+1.25),
`mass-assignment-diagnosis` (+1.55) and `async-error-path-diagnosis` (+1.70). The last is the
interesting one — its fluent-wrong answer is _right_ about where the error goes and about Node 15
making an unhandled rejection fatal, and wrong only about the fix (Express 5 will not rescue a
handler that never returns its promise). A rubric that separated that answer further would be
punishing a correct diagnosis.

Three rubrics were reached by `correct-poorly-explained` scoring **above** `strong` —
`collection-endpoint-design`, `query-performance-diagnosis` and `test-isolation-diagnosis` were all
within 0.3, and in each case the rambling answer genuinely contains more (the sunset plan for the
old route; changing the assertion as well as the isolation). That is the rubrics working: a rubric
with delivery in its descriptors would have reversed them.

## Appendix C — coverage after drafting

**37 questions, 25 general and 12 stack-tagged**, against a blueprint that asked for about 34. A
backend candidate is offered **41**, because four role-general questions live in the frontend bank
and carry this role too; stack tagging means any one candidate actually sees about **28**. Every
target in the `targets` block is met, including the two topics the frontend pass created and said
would be finished here — `written-communication` and `own-work` each gained their second question
(`the-estimate-that-slipped`, `the-part-you-did-not-write`), which closes both shortfalls that
`check-bank.mjs` had been reporting since that pass.

Seven new topic rows (`caching`, `async-work`, `auth`, `concurrency`, `backend-testing`,
`observability`, `system-design-basics`), five of which DevOps, data engineering and full-stack will
reuse.

**All six were decided by the owner on 2026-09-23 and are applied.** What follows is what was
done and what it cost, so a reviewer can disagree with any of it knowingly.

1. **The level tag now does work.** Twenty of twenty-five general questions carried both levels, so
   the two pools were nearly the same bank. Ten are now offered at `intern-junior` and the rest are
   `mid` only, and **the shortfall was accepted rather than padded**: `databases`, `caching`,
   `backend-reliability` and `backend-testing` have nothing at intern-junior, `async-work` and
   `observability` have one, and `concurrency` has one at mid. `check-bank.mjs` reports all seven
   every run. That is the honest state of a bank written mid-first, and it is a worklist rather
   than a defect — the next junior questions go to those topics. **The QA bank is to be drafted the
   same way**: decide the level per question, and let the floor report a gap rather than meeting it
   with a question that is a mid question wearing a junior label.
2. **`api-error-shape` and `the-counter-that-lost-updates` are cut**, with their rubrics and stress
   sets. The first was subsumed by `api-status-code-choice`, which asks it better with a real
   response body, and its rubric duplicated `status-code-honesty` almost line for line; the second
   was the same read-modify-write as `two-people-bought-the-last-one` at lower stakes, and a
   `python-backend` candidate was meeting the pattern three times.
   **`what-happens-when-it-is-down` was narrowed rather than cut** — to the one thing nothing else
   in the bank asks: what a user is told when we do not know what happened. Its rubric is now three
   facets of that, and its stress answers predate the narrowing (noted in its `reviewer_notes` and
   in the eval file).
3. **The ratio changed**, above: one in four of what a candidate is offered, counted by topic
   rather than by `type`. Backend is at 9 of 38. Two of the six judgement-and-communication slots
   are spent below; the remaining four are in `tasks/todo.md`.
4. **Two questions added**, both role-general, both needing no code and no employer:
   `the-ticket-nobody-can-explain` (a brief nobody can explain, its author offline for eight hours)
   and `a-change-you-are-not-sure-about` (reviewing a change on a hunch you have not measured). The
   bank covered receiving a code review and had nothing on giving one.
5. **`golang`, `dotnet` and `ruby-rails` came off `roles.yaml`**, with their three questions. See
   the variant table above.
6. **Nine untagged questions now say "JavaScript" in the prompt** — "it is in JavaScript, but the
   idea is the same wherever you work" — so a Laravel, Spring or Django candidate is not reading
   somebody else's language unannounced. Pseudocode was the alternative and reads as nobody's
   language.

What this bank still does not prepare a candidate for: a live coding round and live SQL (out of
scope by the engine, stated on the role's page), a full system-design round (two conversational
questions are not one), and an `intern-junior` track — backend's only track is at `mid`, which
`check-bank.mjs` reports every run.
