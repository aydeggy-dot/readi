# Switching embeddings from the fake provider to Voyage AI

Question near-duplicate detection runs on a **fake embedding provider** until a Voyage key exists
(ADR-0006). Everything works today — publishing a question embeds it, the vector is stored, the
cosine search runs — but the fake vector is a hash of the text, so **only character-for-character
identical questions ever match**. Two questions that ask the same thing in different words look
unrelated to it. That is the one thing the switch buys.

Nothing needs to be configured to work in the meantime: `EMBEDDING_PROVIDER` defaults to `fake`, so
an `apps/ai-worker/.env` with no embedding settings at all is already correct.

## 1. Put the key in the worker's environment

Voyage keys come from [voyageai.com](https://www.voyageai.com) → Dashboard → API keys.

In **`apps/ai-worker/.env`** (the worker makes every provider call — ADR-0004; the API never holds
this key):

```dotenv
EMBEDDING_PROVIDER=voyage
VOYAGE_API_KEY=pa-...            # the key itself
EMBEDDING_MODEL=voyage-4         # confirm this name still exists (step 2)
EMBEDDING_DIMENSIONS=1024        # must stay 1024: it is the vector(1024) column
EMBEDDING_TIMEOUT_S=30
```

The worker refuses to start with `EMBEDDING_PROVIDER=voyage` and no key, and refuses in production
with `EMBEDDING_PROVIDER=fake`. Nothing changes in `apps/api/.env`; the API's only embedding
setting is `CONTENT_DUPLICATE_THRESHOLD` (default `0.92`), which is about warnings, not providers.

In production, set the same variables on the worker service.

## 2. Verify one real call before trusting it

Start the worker (`pnpm dev:worker`) and ask it for one embedding. `SERVICE_TOKEN` is the worker's
own token — the same value as `AI_WORKER_TOKEN` in `apps/api/.env`:

```bash
TOKEN=$(grep -o '^SERVICE_TOKEN=.*' apps/ai-worker/.env | cut -d= -f2-)
curl -s -X POST http://127.0.0.1:8000/embeddings \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"request_id":"3f1a1a1e-0f0e-4b3e-9c3e-2d2b1a0f0e0d","texts":["a question about React rendering"]}' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["status"], d["error"], d["model"], d["dimensions"], d["ai_calls"][0]["input_units"], d["ai_calls"][0]["cost_micro_usd"])'
```

Expect `ok None voyage-4 1024 <tokens> <cost>`. Then check three things:

1. **`status` is `ok`.** `failed` with `HTTP 401` means the key; `wrong_dimensions` means the model
   does not return 1024 — stop, because the column cannot hold anything else without a migration.
2. **`model` is the name you configured.** If Voyage has retired `voyage-4`, the request fails
   rather than silently using another model. A new name is a **change to ADR-0006**: supersede it
   with a new ADR rather than editing the accepted one (CLAUDE.md §7.4).
3. **The cost is right.** `cost_micro_usd` comes from `TOKEN_PRICES` in
   `apps/ai-worker/readi_worker/llm/pricing.py`, where the Voyage entry is an **estimate nobody has
   checked** ($0.06 per million tokens). Compare it with Voyage's pricing page and correct the
   table — cost in `ai_call_log` is meant to be an estimate, not a guess.

## 3. Re-embed everything that was embedded by the fake

Every vector stored so far was made by the fake provider and is meaningless to Voyage's. Published
questions are the only rows with vectors, and the CLI finds them by asking the worker which model
it is configured with:

```bash
pnpm --filter @readi/api content:reembed -- --dry-run   # how many are stale
pnpm --filter @readi/api content:reembed                # do it
```

It prints `model voyage-4: <n> up to date, <m> to (re-)embed`, works through them, and reports how
many failed. A question it cannot embed has its vector **cleared, never left stale**, so a later
run picks it up. Run it again with `--dry-run`: `0 to (re-)embed` means the switch is complete.

Run this **after** every change of `EMBEDDING_PROVIDER` or `EMBEDDING_MODEL`, in every environment,
including production. Until it has run, duplicate warnings compare new questions against old
vectors and quietly find nothing.

## 4. Tell the rest of the system

- `docs/privacy/subprocessors.md`: move Voyage AI from "configured but not yet enabled" into the
  table of subprocessors in use, with its region and retention.
- If the price in step 2 was wrong, correct `pricing.py` and mention the change in the commit.

## What "good" looks like afterwards

- Publishing a reworded copy of an existing question returns `duplicates` in the transition
  response, and the CMS's duplicate-check reports matches while the question is still being typed.
- `ai_call_log` has one `embedding` row per publish, with a non-zero cost.
- `select count(*) from questions where status = 'published' and embedding is null` is 0.
