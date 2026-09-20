# Landing page copy — DRAFT for the owner

**Status: draft. Nothing here has been signed off.** It is the copy D1 phase 3 put on `/` so the
page could be built and reviewed; the wording is the owner's to change. Edits go to
`apps/web/src/i18n/messages/en.json` under `landing.*` (and `auth.signup.note*` for the two notes
beside the sign-up form) — the page itself holds no text.

## The rules this draft follows

- No invented statistics, no testimonials, no "trusted by thousands", no claim about an outcome we
  have not measured. Nothing about how many people pass interviews after using Readi.
- Every factual claim traces to `docs/PRODUCT_SPEC.md` or `CLAUDE.md`. The table below says which.
- The example in the hero is labelled **"Example feedback from a frontend mock interview"**. It is
  an illustration of the report format, not a real candidate and not a real session.
- The word "naira" is spelled out rather than using ₦. The ₦ glyph would pull its own font file
  (ADR-0013), and the landing page is the one page where bytes matter most.

## What this draft claims, and what it rests on

| Copy | Rests on |
| --- | --- |
| "3 text mock interviews every month" (free plan) | spec §4.6: `free`: … 3 text mocks/month |
| "Frontend, backend and QA" | CLAUDE.md §1; profile roles |
| "from intern to mid-level" | the levels the profile actually offers (intern or junior, mid-level) |
| "15, 30 or 45 minutes" | spec §4.3: session length 15 / 30 / 45 min |
| "up to two follow-up questions on each answer" | spec §4.3: follow-ups, up to 2 per question |
| "your strengths, the three things to fix first, what a strong answer covers, a lesson for each gap" | spec §4.4: session report |
| "Every score comes with the words it is based on" | spec §6.2 / CLAUDE.md §5: evidence quotes required for every non-zero criterion |
| "priced in naira, weekly or monthly … outside Nigeria, pay in US dollars" | spec §4.6 billing periods. **No amounts**: prices are configurable in admin and must not be hardcoded |
| "cancel in one click" | spec §4.6: one-click cancel |
| "text interviews are light on bandwidth, and voice falls back to text if your signal drops" | CLAUDE.md §5: Opus audio, graceful fallback to text |
| "a 15-minute diagnostic interview … builds your study plan" | spec §4.1 and §4.2 |

## ⚠ The honesty question this draft cannot answer for you

Several sentences describe features that are **specified but not built yet** (M3–M5). Today a new
account reaches a home page that says the diagnostic interview "arrives in the next update".

Written in the present tense, as marketing copy normally is, these read as available now:

- "Practise with an AI interviewer that asks follow-up questions" (the hero lead)
- "By text, or by voice if your connection allows" (step 1)
- "The interviewer asks up to two follow-up questions" (step 2)
- "Read your report … with a lesson for each gap" (step 3)
- "Your first session is a 15-minute diagnostic interview" (the closing section)
- "Start free, with 3 text mock interviews every month" (what it costs)

Three ways to go, your call:

1. **Leave the present tense** and keep the page off the public internet until M5, when the
   sentences are true. Simplest, and nothing has to be rewritten later.
2. **Say plainly that it is early**: one line under the hero, e.g. "Readi is being built in the
   open. Sign up and you will be practising as soon as the first interviews are ready."
   Honest today, and the line comes out when it stops being true.
3. **Cut to what exists now** — sign up, set your goals, add a CV, choose your privacy settings —
   and add the rest as it lands. Truthful, but the page stops explaining what Readi is for.

I have left the draft at (1) because the page is not published yet.

## The draft, in order

### Bar
- Log in · **Start free**

### Hero
- **Honest feedback before the interview that counts.**
- Practise with an AI interviewer that asks follow-up questions. Then read feedback that quotes
  your own answers and shows you what to fix.
- **Start free** · Log in
- Free plan: 3 text mock interviews every month. Frontend, backend and QA.

### The example (the point of the page)
- _Example feedback from a frontend mock interview_
- **Interviewer: a product page is slow on older Android phones. What would you do?**
- "First I'd `open the React Profiler and see which components re-render`¹ when you scroll. Then
  I'd `use useMemo everywhere so the page is faster`², and lazy-load the images below the fold."
- ¹ Good start: you measured before you changed anything.
- ² Memoisation has a cost. Say when it helps, and how you'd check that it did.
- **Performance reasoning: 2 of 4** · Every score comes with the words it is based on.

### The feedback you never get
- A rejection email tells you the decision, not the reason. The interviewer won't tell you either.
  So the same gaps travel with you to the next interview, and the one after that.
- Reading about interviews is not the same as answering out loud, with someone asking "why?" after
  every answer.
- Readi is the interviewer who does tell you: specifically, kindly, and before it matters.
- _Margin note:_ Every mark Readi gives you comes with a quote from your own answer, so you can see
  what it is based on.

### What a practice session looks like
1. **Choose your session** — Your role and level, the kind of interview, and 15, 30 or 45 minutes.
   By text, or by voice if your connection allows.
2. **Answer, then answer the follow-up** — The interviewer asks up to two follow-up questions on
   each answer, aimed at what you left out.
3. **Read your report** — Your strengths, the three things to fix first, and what a strong answer
   covers — with a lesson for each gap.

### Who it's for
Frontend, backend and QA engineers, from intern to mid-level. If you are getting ready for your
first technical interview, or aiming for a remote role abroad, the questions meet you where you are.

### What it costs
Start free, with 3 text mock interviews every month. Paid plans are priced in naira, weekly or
monthly, and you can cancel in one click. Outside Nigeria, pay in US dollars.

- _Margin note:_ Built for your phone and your data: text interviews are light on bandwidth, and
  voice falls back to text if your signal drops.

### Closing
- **Hear the hard questions here first.**
- Your first session is a 15-minute diagnostic interview. It shows where you stand today and builds
  your study plan.
- **Create your free account**

### Footer
- Readi by DegRon · System status

## The two notes beside the sign-up form

- After this you set your goals, add a CV if you have one, and choose your privacy settings. About
  five minutes.
- You decide what Readi may do with your voice and your recordings, and you can change any of those
  choices later.

Both are true of the app as it stands today.
