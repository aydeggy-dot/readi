# Turning Langfuse tracing on

LLM tracing ships **built and switched off** (ADR-0008, M3 phase 5). Without keys the worker
constructs a `NullTracer`: the SDK is never imported, nothing is sent, and every
`ai_call_log.langfuse_trace_id` is null. That is local development, CI and the e2e run, and
nothing needs configuring to keep it that way — an `apps/ai-worker/.env` with no `LANGFUSE_*`
lines at all is already correct.

What turning it on buys: the prompt and the answer behind every model call, grouped per request,
with the model, the token counts and the latency. `ai_call_log` already records what a call *cost*;
a trace is the only place you can read what was actually said, which is what prompt debugging and
M4's eval work need.

What it costs: Langfuse becomes a **personal-data store** we are responsible for — prompts contain
CV text and candidate answers. Everything below the first step exists because of that.

## 1. Create the account in the EU region — this cannot be undone later

Sign up at **<https://cloud.langfuse.com>**. The hostname *is* the region: `cloud.langfuse.com` is
the EU, `us.cloud.langfuse.com` is the US, `jp.cloud.langfuse.com` is Japan. ADR-0008 commits us to
the EU one.

Regions are entirely separate installations, down to the user account, so an organisation created
in the wrong one cannot be moved — it means a new account and a data migration. Check the URL bar
before creating the organisation, and again before creating the project.

Then: **New organisation → New project → Settings → API keys → Create new API key.** The secret is
shown once. It looks like `sk-lf-…`, with a public key `pk-lf-…`.

## 2. Put the pair in the worker's environment

The worker makes every external AI call (ADR-0004) and is the only thing that should ever hold
these. Nothing goes in `apps/api/.env` — the API asks the worker to delete traces and never talks
to Langfuse itself.

In **`apps/ai-worker/.env`**:

```dotenv
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com   # the EU region; see step 1
LANGFUSE_RETENTION_DAYS=30                 # keep in step with recordings retention (M5)
LANGFUSE_TIMEOUT_S=10
```

One key without the other is **refused at startup**, with a message naming both: half-on would
look like working tracing and send nothing. Restart the worker — settings are read once.

In production, set the same variables on the worker service and nowhere else.

## 3. Verify one trace, and read it for what should not be there

Run one interview turn or one CV parse against the real provider (README → "Paid AI runs"), then
open the project in Langfuse. Check, in this order:

1. **A trace exists per request**, named `interview.advance` or `cv.parse`, with a generation
   inside it per model call — named `interviewer`, `coverage`, `follow_up` or `cv_parse`.
2. **It carries a `user_id` and (for interviews) a `session_id`, and both are uuids.** No name, no
   email, no phone number, anywhere in the trace. If you see one, stop and fix the mask before
   another run: `apps/ai-worker/readi_worker/tracing/mask.py`, with a test in `test_tracing.py`.
3. **Contact details in the prompt are masked.** Put an email address and a phone number into a
   CV or an answer on purpose and confirm they arrive as `[redacted-email]` and
   `[redacted-phone]`. Links become `[redacted-url]`.
4. **The trace id is in our database too.** `select purpose, langfuse_trace_id from ai_call_log
   where session_id = '…'` — every row for that exchange should carry the same id, and it should
   be the one in the Langfuse URL.

## 4. Verify deletion, which is the part nobody checks until it matters

Both paths go through the worker's `POST /traces/delete`; `SERVICE_TOKEN` is the worker's own
token (the same value as `AI_WORKER_TOKEN` in `apps/api/.env`):

```bash
TOKEN=$(grep -o '^SERVICE_TOKEN=.*' apps/ai-worker/.env | cut -d= -f2-)

# everything belonging to one user — what account erasure sends (ADR-0011)
curl -s -X POST http://127.0.0.1:8000/traces/delete \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"user_id": "<a uuid>", "expired": false}'

# everything past LANGFUSE_RETENTION_DAYS — what the hourly sweep sends
curl -s -X POST http://127.0.0.1:8000/traces/delete \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"user_id": null, "expired": true}'
```

Both answer `{"enabled": true, "deleted": N}` once keys are set, and
`{"enabled": false, "deleted": 0}` without them. Then confirm in the Langfuse UI that the traces
are gone — the delete is asynchronous there, so give it a moment and reload rather than trusting
the count alone.

Deleting is bounded at 2,000 traces per call; the hourly sweep drains the rest.

Finally, run an account deletion end to end (Profile → Your data and account, then
`pnpm --filter @readi/api admin:cancel-deletion` if you change your mind) and watch the erased
user's traces disappear. Erasure deletes traces **before** the database transaction, so if the
worker is unreachable the account is not erased and the next hourly sweep retries the whole of it.

## 5. Two things to set in the Langfuse project itself

- **Data retention.** If the plan offers a project-level retention setting, set it to the same
  number as `LANGFUSE_RETENTION_DAYS`. Our sweep is the belt; that is the braces, and it keeps
  working if the sweep is ever broken.
- **Access.** Named staff with 2FA/SSO only (ADR-0008). Content experts do not get access by
  default — traces are candidate transcripts.

## 6. Update the paperwork

`docs/privacy/subprocessors.md` already lists Langfuse under "configured but not yet enabled".
**Move it to the table above and record the date**, because from the moment keys exist in an
environment serving real users it is a live subprocessor. Check the DPA is signed and that inputs
are excluded from training.

## Turning it off again

Remove both keys and restart the worker. Traces already sent stay until retention deletes them, or
delete them by hand in the UI.
