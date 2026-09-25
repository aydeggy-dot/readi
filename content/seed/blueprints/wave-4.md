# Wave 4 — eight roles, one entry each

**Status: planning only, and deliberately thin.** Derived from `docs/role-catalogue.md` § Wave 4.

Waves 1–3 get a blueprint each. Wave 4 gets this one page, because the catalogue gives each of these
roles a single line — no levels, no stacks, no topics — and **a full blueprint would be inventing the
data it claims to derive**. The entries below say what each role is, what gates it, and what would
have to be true to promote it. That is everything we honestly know.

The catalogue's own rule applies: wave 4 is promoted **on evidence of demand, rather than on this
list's order**. The first conversation with someone who trains or hires here should be allowed to
rearrange it, and the owner is validating the ordering with bootcamp contacts.

---

### Machine learning engineer / data scientist

Real demand and the biggest pay premium on the list. **Gated on a notebook surface**: the interview
leans on statistics and live coding, and text-only prep would oversell itself — the same argument
that holds the data analyst, one surface further out. Distinct from AI/LLM engineer, which is far
more conversational and is in wave 2 for exactly that reason.
**Promote when:** a notebook or code surface exists, and a reviewer who has run ML interviews is
available. Not before.

### Site reliability engineer

Scenario-heavy and an excellent conversational fit — SLOs, on-call, postmortems are all talk.
**Gated on level, not tooling:** hired at senior by a small number of employers here, and no role
offers `senior`. Its bank would also overlap the DevOps bank heavily, which is an argument for doing
it _after_ DevOps and reusing topics rather than writing a parallel set.
**Promote when:** senior exists as an offered level, or a reviewer says the mid market here is real.

### Platform engineer

Golden paths, internal developer platforms, GitOps, policy as code. Same fit as SRE, same narrow
local market, mostly a remote-role play. Would reuse most of the DevOps topics.
**Promote when:** DevOps has shipped and the remote demand shows up in what candidates ask for.

### MLOps engineer

Model packaging, CI/CD for models, feature stores, drift and retraining, GPU cost. Follows the ML
engineer and is **pointless to add before it** — its candidates come from that pipeline.
**Promote when:** ML engineer has shipped.

### Database administrator

Steady demand in banks and telcos. Narrow, and largely displaced by cloud managed services. Would
reuse the backend `databases` topic and the DevOps operational ones.
**Promote when:** a bank or telco reviewer says the local market is bigger than it looks from
outside.

### Salesforce / low-code developer

Genuine Nigerian demand and well paid. **The expensive one:** a closed ecosystem whose interview
questions we would have to learn from scratch, with no reuse from any existing topic and no
in-house judgement to check a draft against.
**Promote when:** a reviewer from that ecosystem is available. The reviewer, not the demand, is the
constraint.

### Embedded / IoT engineer

Very little local demand, hardware-dependent prep. Nothing reusable.
**Promote when:** the demand argument changes.

### Product designer (UI/UX)

Large audience, and the interview is a **portfolio walkthrough** — a different product from a
rubric-scored question and answer, not a different bank. The catalogue is explicit: if we ever do
it, it deserves **its own ADR**, not a role row.
**Promote when:** someone has decided we are building portfolio review, which is a product decision
rather than a content one.

---

## What would make any of these a real blueprint

The same five things the wave 1–3 pages carry, and none of them can be derived from a one-line
catalogue entry:

1. The levels the role is actually hired at here.
2. The variants that are genuinely different interviews, separated from the topics everyone needs —
   the distinction three blueprints in wave 2 and 3 already had to make against the catalogue.
3. Core topics, marked core, with what they reuse from the existing taxonomy.
4. What the engine can and cannot deliver, stated so the role's page can say what it does not
   prepare you for.
5. Target counts derived topic by topic, not padded to a round number.

Anything less is a guess with a table around it.
