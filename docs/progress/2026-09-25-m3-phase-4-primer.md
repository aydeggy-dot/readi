# M3 phase 4 — what the web needs to know before it starts

A primer, not a handover. Phases 1–3 are in `docs/progress/2026-09-25-m3-phase-{1,2,3}.md`; this is
the short version of everything phase 4 has to build against, so a fresh session does not have to
reconstruct it. The transport decisions are `docs/adr/0016-interview-transport-and-streaming.md` and
the visual rules are ADR-0013.

Phase 4 builds: the Practice list and setup screen, the interview screen, the end-interview confirm,
the completion screen, the `/home` diagnostic CTA, the phone tab bar, `interview-errors.ts` and the
`interview` i18n namespace. The API is finished and tested; nothing below needs a change to it.

---

## 1. The SSE frame contract

`POST /api/interviews/{id}/advance`, body `AdvanceInterviewRequest`:

```ts
{ action: "start" | "answer" | "skip" | "end"; text?: string }   // text belongs to `answer`
```

The response is `text/event-stream`: one `data: <json>` message per frame, each one an
`InterviewFrame` from `@readi/shared-types` — a discriminated union on `type`.

| Frame | Fields | What the screen does with it |
|---|---|---|
| `thinking` | — | Show the composing indicator. Sent **before** the worker is called, then repeated every `INTERVIEW_SSE_HEARTBEAT_MS` (15 s) while a model call runs. Render the first, count the rest — a gap much longer than the heartbeat means the connection is gone, not that the interviewer is slow |
| `question` | `question: CandidateSessionQuestion` | A question the session has just reached. Arrives **before** the turn that asks it, so the setup material is on screen by the time the sentence pointing at it is |
| `turn` | `turn: CandidateTurn` | Append to the transcript |
| `state` | `state`, `status`, `ends_at`, `ended_at`, `questions_asked`, `question_budget` | Always sent, always last before `done`. This is what the progress bar and the timer read; nothing should move until every turn in the exchange is on screen |
| `error` | `code: "worker_unavailable" \| "interview_error"` | The exchange produced nothing and **the same action may be sent again** |
| `done` | — | The exchange finished. An explicit frame, because "the interviewer has finished" and "the pipe broke" need different answers and a closed stream cannot tell them apart |

Ordinary order for `start`: `thinking → turn(intro) → question(0) → turn(question) → state → done`.
For an answer: `thinking → turn(candidate) → turn(follow_up or question) → state → done`.

**It is not token streaming.** An AI call returns a whole structured object, so the turns arrive
together. Build the screen for whole turns appearing at once.

### Where a failure appears depends on when it happened

- **Before the stream opens** — an ordinary HTTP error with an `ApiError` body:
  `interview_not_found` (404), `interview_ended` (409), `interview_expired` (409),
  `interview_busy` (409), plus field errors (400) for a malformed body.
- **After it opens** — the status is already 200, so it is an `error` frame.

Both need copy. `interview_busy` is most likely a double-tapped send button and is the one case where
the right answer on screen is probably nothing at all.

---

## 2. `lib/interview-stream.ts` — the one hand-written client module

The generated API client does not model streaming responses (ADR-0012), so this is the exception to
"browser code calls the API through `@readi/api-client`". Everything else on these screens still goes
through `browserApi`.

- **`fetch` + a `ReadableStream` reader, not `EventSource`.** The route is a POST with a body and a
  session cookie; `EventSource` can do neither. Same-origin `/api/...`, so the cookie rides along.
- Parse on `\n\n` boundaries, strip the `data:` prefix, `JSON.parse` each message. Keep a buffer
  across chunks: a frame can be split across two reads. `apps/api/test/sse.ts` is the same parser on
  the test side and is worth reading first.
- Import the **type** only (`import type { InterviewFrame }`), per the lint rule that keeps Zod out
  of the browser.
- Handle a non-200 before reading the body at all, and surface it as an `ApiFailure` — `apiFailure`
  and `networkFailure` in `lib/api-errors.ts` are the existing shapes, and `interview-errors.ts`
  should add the four interview codes as overrides in the way `content-errors.ts` does.
- An `AbortController` per exchange, aborted when the component unmounts. A candidate who navigates
  away mid-exchange has not lost anything: **an exchange is all-or-nothing**, nothing was persisted,
  and reopening the session and re-sending the same action replays it.

---

## 3. The status endpoint

`GET /api/interviews/{id}/status` → `InterviewStatusResponse`:

```ts
{ id: string; state: InterviewState; status: InterviewStatus; ended_at: string | null;
  feedback_ready: boolean }
```

`feedback_ready` is **always `false` in M3**, which scores nothing. The completion screen polls this
the way `cv-panel.tsx` polls the CV — TanStack Query with `refetchInterval` conditional on the data —
but it must say plainly that scoring is not built yet rather than spin for something that is not
coming (the owner's decision, 2026-09-22). M4 makes it true and adds the report beside it, so the
screen written now should not need rewriting then.

Item 7 of the phase-1 notes still applies: **the completion screen must not promise a study plan.**
Five of the eight role × level combinations have no track.

---

## 4. The candidate shapes

Everything the browser is sent. There is no rubric, no criterion, no weight, no level descriptor, no
ideal point and no coverage log in any of them, and `content-no-answer-key.int.spec.ts` enforces that
over the raw JSON of every candidate route including the stream.

```ts
CandidateSessionQuestion = {
  position: number;            // 0-based, within the session
  type: QuestionType;          // behavioral | technical | scenario | test_design
  topic: { id, slug, name, description };
  prompt: string;              // what was asked
  context: string | null;      // setup material: a snippet, a scenario, a table
  asked_at: string;            // ISO
}

CandidateTurn = {
  seq: number;                 // monotonic within the session; the engine allocates it
  speaker: "interviewer" | "candidate";
  state: InterviewState;       // intro | question | follow_up | candidate_questions | wrap_up | ended
  question_position: number | null;
  text: string;
  at: string;                  // ISO
}
```

Two things follow for the screen:

- **A question only exists once reached.** `GET /api/interviews/{id}` returns `questions` filtered by
  `asked_at`, so there is no way to render "question 3 of 4" from the questions themselves — use
  `questions_asked` and `question_budget` from the `state` frame (or the session response).
- **`context` never passes through a model.** It is rendered from the question record, verbatim,
  beneath the interviewer's words. The turn text is the spoken sentence only.

`InterviewSessionResponse` (from `POST /api/interviews` and `GET /api/interviews/{id}`) carries the
session plus `questions` and `turns`, which is how the screen resumes: read it on the server, render
the transcript, then open a stream on the next action. A newly created session has `state: "intro"`
and no turns — the screen's first act is `POST …/advance { action: "start" }`.

---

## 5. The interview screen — the Margin rules

From the plan's "The interview screen (360px first)" section and ADR-0013. This is the one screen in
the milestone that deserves real design time; Margin's premise — the mentor annotating your work —
maps onto it directly.

- **The interviewer speaks in the serif** (Alegreya 500, the mentor's voice), full measure, no
  bubble. **The candidate's own words are the sans on a ruled left rail** — the same treatment quoted
  answers get on the landing page. **No chat bubbles and no avatars:** this is a transcript, not a
  messaging app.
- **The transcript is a real `<ol>`.**
- **Above the fold, always:** a slim progress bar on the structural grey bar (`--progress` on
  `--track`) carrying **both a number and a label** — "Question 2 of 4 · 11 min left" — because
  ADR-0013 forbids colour as the only signal. Anything drawn on that bar goes inside
  `data-nav-surface`, which re-points `--ring` at `--nav-accent`: the page's own focus ring is
  1.46:1 on that grey.
- **The timer counts to a wall-clock deadline** (`ends_at`), not by ticking a counter, so a
  backgrounded phone cannot drift and a resumed session does not silently gain the time it was away.
  `ends_at` is re-sent on every `state` frame for that reason.
- **The composer** is a `textarea` pinned to the bottom, send button 48 px (`size="lg"`),
  `min-h` two lines growing to four. **The draft survives a reload in `sessionStorage`.**
- **While the interviewer composes:** the existing spinner idiom inside a `role="status"` region,
  driven by the `thinking` frame — **never a fake typing animation**.
- **Its own route group `(session)`**, with the header but no footer, so `min-h-dvh` and a pinned
  composer do not fight `SiteFooter`.
- **No markdown renderer on this route.** A question's `context` can hold a fenced code block, so a
  small `<pre>` path only. `lib/markdown.ts` and the CMS preview must not be reachable from here —
  the route has to stay inside the Slow 4G ceiling in `slow-network.spec.ts`.
- Reduced motion respected; every control reachable and labelled.

The end-interview confirm uses the **two-click pattern** from
`apps/web/src/components/admin/transition-panel.tsx`, not a modal — a modal at 360px is worse.

Chrome to reuse: `components/layout` (`AppHeader`, `NavLink`, `PageHeading`, `SiteFooter`) and
`components/ui/margin.tsx` (`Margined`, `Note`, `Highlight`, `TextLink`).

---

## 6. The setup screen, and the three owner decisions that constrain it

1. **Role, level and variant come from `GET /api/content/career-roles`**, published only, defaulting
   to the profile. There is no `TARGET_ROLES` constant and no `targetRoles.*` i18n namespace: every
   label is the `name` on the row the API returns, and client components take their options as props
   from their server page (ADR-0015). `senior` is a draft level no role offers — it must not be
   selectable, and there is a test because the failure would be silent.
2. **The types offered are the role's `supported_question_types`**, so the preset mixed session is
   mixed *per that role*. The diagnostic sends no types and no length but 15 — the API refuses both
   rather than ignoring them.
3. **"Not sure yet" is explained, and asks** (owner, 2026-09-25). No third state: the screen says
   what the choice buys — general questions for the role, because the stack-specific ones need a
   variant we offer — and sends an explicit `stack: null`. A free-text "what do you actually use?"
   **never touches eligibility** and lands somewhere we can read, because the right answer to a
   missing variant is usually to add the variant. Where it lands is phase 4's question (a profile
   field vs. a table we read); the constraint is that it is not a selection input.
4. **The coding round stays [P2].** The setup and completion screens must say what this interview
   covers and what it does not — a product that prepares two rounds of three must not imply it
   prepares three (product principle 1).

Rate limits are 6/hour and 20/day per candidate, `rate_limited` (429). Starting an interview
**abandons whatever that candidate had running**, so the Practice list should offer "resume" for a
session still `in_progress` and the setup screen should be a deliberate act.

---

## 7. What to do first, and the two things to watch

1. `lib/interview-stream.ts` and the interview screen against the **fake provider** — `pnpm dev`
   with the worker on `LLM_PROVIDER=fake` gives a correct interview in a flat voice, and an answer
   containing `covered:0 covered:1` drives the "this answer covered everything, so no follow-up"
   path deterministically (a dev-only affordance of the stand-in).
2. **Grep the skipped e2e specs when a field is renamed.** `visual/capture.spec.ts` and
   `slow-network.spec.ts` do not run by default and rotted once already (M2.5 lesson).
3. **Never run a build that writes `apps/api/dist` or `apps/web/.next` while the owner's dev servers
   are up.** The e2e harness and `scripts/sse-rewrite-proof.mjs` both use their own folders and
   ports (3010/4010/8010).

The owner wants **a look at the interview screen at 360px after phase 4, before the handover** — and
has agreed to **one paid 15-minute diagnostic on `claude-sonnet-5` at the end of phase 4**, in the
browser rather than as a transcript, announced before it runs with the cost reported (≈2–4¢).
