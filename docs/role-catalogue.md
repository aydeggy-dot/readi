# The role catalogue

**Status: wave order decided by the owner, 2026-09-22.** This is a planning document, not content.

**Wave 1 is now in the catalogue** (M2.5, 2026-09-22): frontend, backend, QA and full-stack are
`career_roles` rows with their levels and their stack variants, and `docs/adr/0015` records why they
are content rather than an enum. They arrive from `content/seed` as **drafts** — the importer never
publishes, so a freshly seeded database has a catalogue no candidate can see until an admin publishes
it in `/admin/content` (ADR-0014 decision 5). The drafts are also marked `ai_draft_unreviewed`, which
production refuses to publish at all until an expert has been through them. Everything from wave 2
down is still planning only: no row, no bank.

The owner's decisions on 2026-09-22: launch content is **frontend, backend, QA and full-stack**;
**data analyst moves to wave 2** and may not launch until there is a SQL practice surface;
**AI/LLM Engineer moves from wave 3 to wave 2**, ahead of DevOps and Mobile. The order below remains
**argued, not measured** — the owner is validating it with bootcamp contacts.

It answers four questions per role: what the role is, what a candidate is actually asked in an
interview for it, what we would have to build beyond the M3 text interview to prepare someone for it,
and when it is worth doing. The wave order at the end is the recommendation.

**On the demand claims.** The ordering leans on public 2026 market write-ups for Nigeria and for
African remote hiring (sources at the end), plus judgement about content cost and fit with our engine.
The write-ups agree on the broad shape — full-stack and backend are the most-requested hires,
cloud/DevOps demand outruns supply, data/BI has grown fast on the back of fintech and banking,
cybersecurity has the largest reported skills gap, and AI/ML commands the biggest pay premium — but
none of them is a survey we should quote as a number. **The ordering is argued, not measured**, and
should be read that way everywhere it appears in this document: it is a reasoned starting point to be
checked against people who hire and train here, not evidence. The owner is validating it with bootcamp
contacts; when that comes back, supersede this section with what they said.

---

## How to read the tables

- **Levels** — the ladder we would offer. `intern-junior` and `mid` are seeded and offered by every
  wave-1 role; `senior` is listed below wherever the role is commonly hired at that level here, and
  exists as a **draft row that no role offers yet** — the content behind it (system design, rubric
  dimensions for scope and influence, longer sessions) is not written. See `tasks/todo.md`.
- **Stacks** — the variant dimension M2.5 introduced (ADR-0015). A question is either general to the
  role, and everyone preparing for it is asked it, or tagged to one or more stacks and asked only of
  candidates on one of them. A candidate who picks "Not sure yet" is offered the general set only.
- **Interview types** — from `QUESTION_TYPES` today (`behavioral`, `technical`, `scenario`,
  `test_design`) plus the two the spec defers to P2: **coding** (Monaco + Judge0) and **system design**
  (Excalidraw + vision review).
- **Beyond M3** — what the role needs that a text (M3) or voice (M5) conversation cannot give it.
- **Fit** — how much of a real interview for this role we can honestly prepare someone for with the
  text/voice engine alone. **Full** = the conversation *is* the interview. **Most** = the conversation
  covers the majority; one round needs tooling. **Partial** = a core round is tooling, and text-only
  prep would oversell itself.

---

## Wave 1 — launch content

These four are the launch set. The first three are what M2 drafted; full-stack is the fourth because it
costs almost nothing.

### Frontend Engineer

| | |
|---|---|
| **What it is** | Builds what runs in the browser: interfaces, state, performance on the devices people actually own. |
| **Levels** | intern-junior, mid, senior |
| **Stacks** | React + TypeScript *(default)* · Next.js · Vue / Nuxt · Angular · Vanilla JS + a CSS framework |
| **Core topics** | JavaScript fundamentals (event loop, async) · React state and rendering · CSS layout · browser rendering and performance · web networking and HTTP · accessibility · frontend testing · debugging · collaboration |
| **Interview types** | technical · scenario · behavioral · *(P2)* coding · *(P2)* component/UI design discussion |
| **Beyond M3** | A code editor for the "build this component" round. |
| **Fit** | **Most** — concepts, debugging walkthroughs and behavioral rounds are all conversation. |
| **Content today** | 8 drafted questions, 3 modules, 6 lessons (`content/seed/frontend`). Two are tagged React + TypeScript / Next.js / React + Node; the other six are general. |

### Backend Engineer

| | |
|---|---|
| **What it is** | APIs, data, and the services behind them. The most-requested hire in this market, local and remote. |
| **Levels** | intern-junior, mid, senior |
| **Stacks** | Node.js (Express / NestJS) *(default)* · Java / Spring · Python (Django / FastAPI) · PHP / Laravel · Go · .NET · Ruby on Rails |
| **Core topics** | HTTP and API design · databases and SQL · indexing and transactions · caching · queues and async work · authentication and authorisation · concurrency · error handling · testing · observability · system design basics |
| **Interview types** | technical · scenario · behavioral · *(P2)* coding · *(P2)* system design |
| **Beyond M3** | A code editor; a diagram surface for the design round. |
| **Fit** | **Most** |
| **Content today** | 3 drafted questions (2 technical, 1 shared behavioral) — the thinnest of the three. All three are general to the role; none is stack-tagged. |

### QA Engineer

| | |
|---|---|
| **What it is** | Designs the tests, finds what breaks, and says clearly why it matters. |
| **Levels** | intern-junior, mid, senior |
| **Stacks** | Manual / exploratory testing *(default)* · Selenium + Java · Cypress · Playwright · API testing (Postman / RestAssured) · Appium (mobile) · Performance testing (k6 / JMeter) |
| **Core topics** | Test design techniques · risk-based testing · bug reporting · API testing · automation fundamentals · CI and test pipelines · exploratory testing · test data management |
| **Interview types** | test_design · scenario · behavioral · technical |
| **Beyond M3** | Almost nothing. A QA interview is mostly "here is a feature — how would you test it?", which is exactly what our engine does. |
| **Fit** | **Full** — the best fit on this entire list. |
| **Content today** | 3 drafted questions, all general to the role. None of the seven QA variants has a question written for it yet. |

### Full-stack Engineer — *added 2026-09-22*

| | |
|---|---|
| **What it is** | Owns a feature end to end. The most advertised title in Nigerian job posts, and the default shape of a startup hire. |
| **Levels** | intern-junior, mid, senior |
| **Stacks** | React + Node *(default)* · Next.js · Django + React · Laravel + Vue · Ruby on Rails · .NET + React. Next.js and Ruby on Rails are the same rows frontend and backend already offer — a stack belongs to as many roles as offer it |
| **Core topics** | The frontend and backend core topics, plus: where logic belongs, data flow across the boundary, deployment basics, working without a specialist beside you |
| **Interview types** | technical · scenario · behavioral · *(P2)* coding · *(P2)* system design |
| **Beyond M3** | Same as frontend and backend. |
| **Fit** | **Most** |
| **Content cost** | **Near zero, and that was the argument for it — which held.** |
| **Content today** | **11 questions, none of them new**: the eight frontend and three backend questions that genuinely transfer, each carrying `fullstack` as a second role. The two React ones also gained the React + Node variant, so a full-stack candidate on that stack is asked them and one on Laravel + Vue is not. **No track yet**, so `GET /api/content/track` answers `track_not_found` for a full-stack candidate — the track and the boundary questions (where logic belongs, data flow across the boundary, deploying a whole feature, working without a specialist beside you) are the question-bank pass, `docs/plans/content-catalogue-banks.md`. |
| **How it was added** | Four rows in `stacks.yaml`, one block in `roles.yaml`, a second role tag on eleven questions, `pnpm db:seed`, and an admin pressing Publish in `/admin/content`. **No code change and no migration** — this was M2.5's acceptance criterion, and it is recorded in ADR-0015 §9. |

### On data analyst at launch

The owner asked whether data analyst should join the launch set. **Decided 2026-09-22: wave 2, not
wave 1** — and the reason is content, not demand.

Demand is genuinely there: BI and analytics roles have grown quickly on the back of fintech and banking,
and it is one of the few high-paying tech roles a non-programmer can reach, which matches a large part
of our audience. But:

- It needs a **bank written from scratch**. Nothing in `content/seed` transfers. M2 spent a phase
  producing 14 drafted questions for three roles; a credible analyst bank is comparable work, and it
  needs a reviewer who has actually run analyst interviews.
- Its central round is **live SQL**, which needs a query surface we do not have. Text-only prep for an
  analyst would quietly promise something it cannot deliver — against product principle 1.
- Its rubric dimensions differ enough (query correctness, metric definition, business framing,
  communicating to non-technical stakeholders) that it is not a reuse of the engineering rubrics.

So: it belongs early, it does not belong in the same breath as the three roles we already have drafts
for. Adding it to wave 1 means M2.5 grows a content phase; adding full-stack does not.

**Launch condition (owner, 2026-09-22): data analyst does not launch until there is a SQL practice
surface.** A live-query round is the centre of an analyst interview; without somewhere to write and run
a query, a text-only analyst track would sell preparation it does not provide, which product principle 1
forbids. The bank, its rubrics and its expert review are necessary but not sufficient — the surface
gates the launch. It is not in `PRODUCT_SPEC.md` today; specifying it is the first task of the analyst
wave, not an afterthought at the end of it.

---

## Wave 2 — first expansion

| Role | Why here | Levels | Stacks | Core topics | Interview types | Beyond M3 | Fit |
|---|---|---|---|---|---|---|---|
| **Data Analyst** | High and growing local demand (fintech, banking, telco); reachable without a CS background. **Gated on a SQL practice surface** — see "On data analyst at launch" above | junior, mid, senior | SQL + Excel · SQL + Power BI · SQL + Tableau · Python (pandas) + SQL · Looker | SQL (joins, aggregation, window functions) · data cleaning · descriptive statistics · defining a metric · dashboard design · telling the story · business case reasoning · spreadsheet modelling | technical · scenario (case) · behavioral | A SQL surface for the live-query round; a case/dataset exercise format | **Partial** |
| **AI / LLM Engineer** | **Moved here from wave 3 by the owner, 2026-09-22, ahead of DevOps and Mobile:** the best conversational fit on the list and almost no prep competition anywhere. Still needs its own bank and expert review, so no content for it in M2.5 | mid, senior | Python + Anthropic / OpenAI APIs · TypeScript + the same · LangChain / LlamaIndex · vector stores (pgvector, Pinecone) · agent frameworks | Prompt design · structured output and validation · RAG (chunking, embeddings, retrieval quality) · evaluation and regression testing · guardrails and prompt injection · latency and cost · tool use and agents · fine-tuning vs prompting · tracing and observability | technical · scenario (design an LLM feature) · behavioral | Nothing structural — this is a conceptual interview | **Full** |
| **DevOps / Cloud Engineer** | Demand consistently outruns supply; strong remote market | junior, mid, senior | AWS · Azure · GCP · Docker + Kubernetes · Terraform · GitHub Actions / GitLab CI | Linux fundamentals · networking · containers · orchestration · infrastructure as code · CI/CD · observability · incident response · cloud cost · security basics | technical · scenario (incident) · behavioral | Hands-on labs are spec'd as P3 (ephemeral containers) | **Most** — incident walkthroughs are excellent conversation |
| **Mobile Engineer** | Nigeria is phone-first; local product work and a real remote market | junior, mid, senior | React Native · Flutter · Android (Kotlin) · iOS (Swift) | App lifecycle · state management · navigation · offline and local storage · networking on unreliable connections · performance and battery · release and store review · push notifications · testing | technical · scenario · behavioral · *(P2)* coding | A code editor for the component round | **Most** |

---

## Wave 3 — the specialists

| Role | Why here | Levels | Stacks | Core topics | Interview types | Beyond M3 | Fit |
|---|---|---|---|---|---|---|---|
| **Data Engineer** | Follows analyst demand; banks and fintechs are building warehouses | mid, senior | Python + SQL + Airflow · dbt + warehouse (BigQuery / Snowflake / Redshift) · Spark · Kafka | Data modelling (star schema) · ETL vs ELT · orchestration · batch vs streaming · data quality · partitioning and performance · warehouse cost · SQL depth | technical · scenario · behavioral · *(P2)* system design | A diagram surface for pipeline design | **Most** |
| **Cybersecurity / SOC Analyst** | The largest reported skills gap in the country; strong entry-level demand | junior, mid | SOC / SIEM (Splunk, Sentinel) · application security (OWASP, Burp) · cloud security · GRC and compliance | OWASP Top 10 · network fundamentals · threat detection and triage · incident response · identity and access · cryptography basics · compliance (NDPA, ISO 27001, PCI DSS) · secure SDLC | technical · scenario (triage an alert) · behavioral | Nothing structural. **Content boundary:** defensive and analytical only — no offensive tooling walkthroughs (spec §10) | **Most** |
| **Technical Product Manager / Business Analyst** | **The cheapest role on this list to add** — no tooling at all, and a large candidate pool from bootcamps | junior, mid, senior | Generalist · fintech · enterprise / banking | Discovery and user research · writing requirements · prioritisation · defining success metrics · stakeholder management · agile delivery · working with engineers · basic data literacy | behavioral · scenario (case) · technical (light) | Nothing | **Full** |
| **Technical Support Engineer** | Huge entry-level market, very remote-friendly, and often the first rung into tech | junior, mid | Helpdesk / ITSM · SaaS support · cloud support | Troubleshooting method · networking basics · operating systems · ticketing and escalation · reading logs · customer communication · documentation | scenario · behavioral · technical (light) | Nothing | **Full** |

---

## Wave 4 — later, or on demand

| Role | Note |
|---|---|
| **Machine Learning Engineer / Data Scientist** | Real demand and a big premium, but the interview leans on statistics and live coding, and the honest prep needs a notebook surface. Distinct from AI/LLM engineer, which is far more conversational. |
| **Site Reliability Engineer** | Scenario-heavy and an excellent conversational fit (SLOs, on-call, postmortems), but hired at senior level by a small number of employers here. |
| **Platform Engineer** | Golden paths, internal developer platforms, GitOps, policy as code. Same fit as SRE, same narrow local market; mostly a remote-role play. |
| **MLOps Engineer** | Model packaging, CI/CD for models, feature stores, drift and retraining, GPU cost. Follows ML engineer; pointless to add before it. |
| **Database Administrator** | Steady demand in banks and telcos. Narrow, and largely displaced by cloud managed services. |
| **Salesforce / low-code Developer** | Genuine Nigerian demand and well paid, but a closed ecosystem whose questions we would have to learn from scratch. |
| **Embedded / IoT Engineer** | Very little local demand; hardware-dependent prep. |
| **Product Designer (UI/UX)** | Large audience, but the interview is a **portfolio walkthrough**, which is a different product from a rubric-scored Q&A. If we ever do it, it deserves its own ADR, not a role row. |

---

## The wave order, and why

1. **Wave 1 — Frontend, Backend, QA, Full-stack.** Three have drafted banks; the fourth was a tagging
   exercise, done in M2.5. Together they cover the majority of what this market advertises.
2. **Wave 2 — Data Analyst, AI/LLM Engineer, DevOps/Cloud, Mobile.** Each needs one new bank and its own
   expert reviewer. AI/LLM sits ahead of DevOps and Mobile by the owner's decision: it is the only role
   on the list where the conversation *is* the whole interview and where essentially no prep content
   exists to compete with. Analyst leads on audience size but is the one role here that cannot ship on
   the engine alone — it waits for a SQL surface — so in practice AI/LLM may well be the first of this
   wave to launch.
3. **Wave 3 — Data Engineer, Cybersecurity, TPM/BA, Technical Support.** TPM/BA and Support are the
   cheapest additions on the whole list and widen the audience beyond engineers — worth pulling forward
   if growth matters more than depth.
4. **Wave 4 — everything else**, on evidence of demand rather than on this list's order.

None of these four lines is measured. They are arguments from content cost, engine fit and public
market write-ups, and the first contact with someone who trains or hires Nigerian juniors should be
allowed to rearrange them.

Two ordering rules worth keeping: **a role ships only when a human expert has reviewed its bank**
(ADR-0014 decision 6), and **a role whose central round needs tooling we do not have should say so on
its own page** rather than be quietly sold as full preparation.

## What this implies for the product beyond M2.5

- **Coding rounds (Monaco + Judge0) and system design (Excalidraw) are spec'd as P2** and gate the
  "Full" rating for frontend, backend, full-stack and mobile.
- **A SQL/query surface** is not in the spec at all today. Data Analyst and Data Engineer both want it,
  and for Data Analyst it is a **launch gate**, not a nice-to-have (owner, 2026-09-22).
- **DevOps labs** are P3 in the spec (ephemeral containers).
- **Rubric dimensions are not universal.** Analyst, TPM and Support rubrics score things the engineering
  rubrics do not (metric definition, stakeholder communication, customer tone). M2's rubric model
  already supports this — dimensions are free text per rubric — but the readiness formula's
  `technical` / `behavioral` / `communication` split (spec §7) assumes an engineering shape and should
  be re-read when the first non-engineering role lands. **Tracked as an M6 item in `tasks/todo.md`**
  (owner, 2026-09-22), because M6 is where the readiness formula is built and the cheapest moment to
  get the split right is before it has scores behind it.

## Sources for the demand claims

- [2026 Nigeria Job Search Report — MyJobMag](https://www.myjobmag.com/blog/2026-job-search-index-report)
- [IT Jobs in Nigeria in 2026: A Developer's Guide to the Market](https://dev.to/anthony2026/it-jobs-in-nigeria-in-2026-a-developers-guide-to-the-market-via-talentexafrica-k87)
- [10 Most In-Demand Skills in Nigeria for 2026 — Edstellar](https://www.edstellar.com/blog/skills-in-demand-in-nigeria)
- [Tech Skills in Demand in Nigeria: 2026 Guide — Abuja Data School](https://www.abujadataschool.com/tech-skills-in-demand-in-nigeria-your-complete-2026-guide/)
- [Remote Jobs in Africa: Highest Demand Roles in 2026 — Betternship](https://talents.betternship.com/blog/remote-jobs-africa-highest-demand-roles-2026)
- [How to Hire African Developers in 2026 — Gigson](https://www.gigson.co/blog/how-to-hire-african-developers-in-2026-the-full-guide)
- [Remote Cloud Jobs in Africa 2026 — Citadel Cloud Management](https://www.citadelcloudmanagement.com/blogs/news/remote-cloud-jobs-in-africa-2026-salaries-companies-and-how-to-get-hired)
