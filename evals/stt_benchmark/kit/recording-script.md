# Recording script — accent benchmark for speech recognition

> **How we will use this.** We are testing how well speech-recognition systems understand Nigerian
> engineers speaking English, so that an interview-practice product does not quietly mark people down
> for their accent. Your recording is listened to by one person on our team, transcribed word for word,
> and used to measure the systems — never published, never used in marketing, never used to train a
> model.

Read this page once before you start. Then read `phone-instructions.md`, which covers the recorder, the
files and how to send them. Sign `consent-form.md` first — we cannot use a recording without it.

**About 10 minutes of audio in total**, in three parts, each recorded as its own file:

| Part | What it is                    | Roughly   |
| ---- | ----------------------------- | --------- |
| A    | 12 sentences, read aloud      | 3 minutes |
| B    | 6 spoken answers              | 6 minutes |
| C    | A short note about your setup | 1 minute  |

Do all three in one sitting if you can, in the same room, with the same phone in the same position.
The point is to measure one set of conditions, not four.

---

## Part A — read aloud (about 3 minutes)

These sentences are dense in the technical words engineers actually say — the words a recogniser has to
get right for the product to work at all. **The reference transcript for this part is the text below**,
because it is read rather than spoken freely, so this part is cheap for us to score and it measures
pronunciation of the vocabulary that matters.

**So the sentences must be read as printed.** Read them in order, at your normal speaking pace — not
slowly, not carefully, the way you would say them to a colleague. If you stumble, say the sentence
again from the beginning and carry on; do not stop the recording. If a word is not one you would ever
use, say it anyway, the way you would guess at it.

Say the number before each sentence ("one", "two", …). Take a short pause between sentences — it costs
nothing and it helps the person transcribing.

1. The retry is safe because the endpoint is idempotent — if the same webhook arrives twice, the second
   one changes nothing.

2. We run the API on Kubernetes, and the readiness probe was failing because the connection pool to
   PostgreSQL filled up under load.

3. The service is JavaScript on Node, and we moved the new parts to TypeScript so the payload shapes
   are checked at build time.

4. We keep the session in Redis with a TTL of thirty minutes, and nginx in front of it terminates TLS
   and does the rate limiting.

5. Sign-in goes through OAuth, and the access token is a JWT the API verifies on every request — the
   refresh token stays in a same-site cookie.

6. The CI/CD pipeline runs unit tests on every push, then Cypress against staging, and we are moving
   the end-to-end suite to Playwright.

7. Latency at p95 went from eighty milliseconds to three seconds, and the cause was an N plus one query
   behind a list endpoint.

8. Cache invalidation is the hard part — the dashboard was showing another user's figures because the
   cache key left out the user id.

9. Two requests got past the same check and both got the last unit, which is a race condition you only
   see at peak.

10. The worker retries with exponential backoff, and anything that fails five times goes to a dead
    letter queue for somebody to look at.

11. We build the image with Docker, deploy from GitHub Actions, and read a replica of the database for
    the reports so the primary is not touched.

12. The flaky test was a timing problem, not a bug — the assertion ran before the request came back,
    and the locator matched two elements.

Stop the recording. Save it as Part A.

---

## Part B — spoken answers (about 6 minutes)

Start a new recording. Read each prompt to yourself, then answer it out loud, **as if an interviewer
had just asked you**. Say the prompt number first ("prompt one"), then answer.

About a minute each is right. Forty seconds is fine. Do not write your answer down first and do not
read it — a read answer sounds nothing like an interview, and this part exists precisely to capture
what the product really receives.

**Hesitation, thinking out loud, self-correction and starting a sentence again are wanted, not faults.**
"Um", a pause while you think, "actually, no, sorry — the other way round" — all of that is the data.
The systems we are testing handle clean speech well and real speech badly, and real speech is the
question. Do not edit, do not re-record, do not tidy up.

1. A page that was fast last month now takes about four seconds for some users and is fine for others.
   How would you find out what changed? Take me through it.

2. Somebody on your team wants to put a cache in front of the database to fix a slow page. What would
   you want to know before you agreed? Take me through it.

3. A background job that pays out to a vendor ran twice, and the vendor was paid twice. The logs show
   the worker restarted in the middle of the first run. Why does a queue do that, and what would you
   change?

4. Tell me about something you shipped that broke for real users — at work, or on a project of your
   own. Take me through what happened and what you did about it.

5. Tell me about a time you found something close to a release that you thought should stop it going
   out. What was the risk, and what did you do with it?

6. **This one in Pidgin, if Pidgin is how you would naturally say it.** Explain to somebody who is not
   an engineer what an API is and why it matters. Use Pidgin, English, or both — switching mid-sentence
   is normal and it is exactly what we want on this prompt. If Pidgin is not natural for you, answer in
   English and say so; that is a useful answer too.

Stop the recording. Save it as Part B.

If you have to stop in the middle of Part B — a call comes in, somebody walks in — start a new file and
carry on from the prompt you were on. Say the prompt number again. Two files for Part B is fine; a
rushed answer is not.

---

## Part C — the conditions note (about 1 minute)

Start one more recording, and read this out in your own words, unhurried:

- **Your speaker code** — the code we gave you, for example "speaker four" for `s4`. **Not your name.**
- **Your first language**, and any other language you speak every day.
- **Where you are recording** — the kind of room and the city. "A bedroom in Lagos, window open, some
  traffic" is a better answer than "quiet room".
- **What phone** — make and model, roughly is fine ("a Tecno Spark 10").
- **Whether you used headphones with a microphone, or the phone's own microphone**, and roughly how far
  the phone was from your mouth.
- **Anything unusual** — a generator came on, a fan was running, you had a cold.

Stop the recording. Save it as Part C.

### Why a code and not your name

The code is how your recording is identified everywhere after this: in the file names, in the
transcript, and in the report, which gives a figure **per speaker** because an average hides the one
speaker a system fails. Using a code means your name is not attached to the audio, the transcript or
any result, and the only place it exists is the consent form. It also makes deletion simple: if you ask
us to delete your recording, we delete everything under that code, with no searching through names.

Speaking your code at the end, out loud, is how a file identifies itself if a file name is ever lost.
