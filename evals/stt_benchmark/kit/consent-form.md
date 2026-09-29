# Voice recording consent — **DRAFT, NOT YET REVIEWED BY A LAWYER**

> **Do not ask anyone to sign this.** This is a plain-English draft written by the engineering team so
> that the promises are clear and complete enough for a lawyer to work from. It is **not legal advice
> and not a legal opinion**, and the people who wrote it are not qualified to give either.
>
> **Before any speaker signs, it must be reviewed by a lawyer familiar with the Nigeria Data
> Protection Act 2023** (and, if a speaker is in the EU or UK, with the GDPR). Expect the lawyer to
> change the structure as well as the words: a consent notice has required content that a draft like
> this will be missing, and the items under "Left for the lawyer" are deliberately left blank rather
> than guessed at.
>
> **No recording is made under this form until a reviewed version is in place** (ADR-0020 §8).

---

## Who we are, and what this recording is for

**Readi** _[legal entity name and registration number]_ builds an interview-practice product for
software engineers, starting in Nigeria. A candidate practises a mock interview by speaking, and a
speech-recognition system turns what they say into text.

Those systems are not equally good at every accent. Every vendor publishes an accuracy figure; none of
them publishes one for a Nigerian engineer saying "idempotent" on a mid-range Android phone over mobile
data. **We are asking you to record about ten minutes of speech so we can measure them on real Nigerian
English instead of on somebody else's test set**, and choose on that evidence. If a system mishears you,
that is the result we need.

You do not need an account and we are not signing you up for anything. You are not a user of the
product and this recording is not part of it.

## Your recording is personal data

Your voice is personal data about you under the **Nigeria Data Protection Act 2023**, and so is what you
say. We are asking for your **consent** to process it for the one purpose described above. Consent means
you can say no, and you can change your mind later (see "Withdrawing").

## What we do with the recording

1. **We send the audio to speech-recognition companies to be transcribed**, which is the measurement
   itself. Those companies are named below.
2. **A person on our team listens to your whole recording, end to end**, and writes down exactly what
   you said, word for word. That corrected transcript is what the systems are scored against. We do
   this by hand, on the whole clip, because two systems that mishear an accent the same way agree with
   each other, and nobody would ever check it.
3. **We re-encode a copy of the audio** to the lower quality the product actually receives over a phone
   connection, and score that too.
4. **We publish numbers, not audio** — accuracy figures per speaker code, in an internal report.

## Exactly which companies receive the audio, and what they do with it

As their own terms read on **2026-09-29**:

| Company                      | Where it processes  | What its terms say about training and keeping your audio                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AssemblyAI**               | European servers    | **A written no-training guarantee for these servers** — their terms state they will not use submitted files for model training when European servers are used, and we use the European servers for that reason. Their zero-retention statement covers their live streaming product, which this test does not use, so what we are relying on here is the no-training guarantee and not a promise that the file is never stored. |
| **Deepgram**                 | United States       | Their terms say training happens only through a voluntary programme, and we send an opt-out flag on **every** request; their terms say data from opted-out requests is kept only as long as it takes to process the request. **One point their published terms do not state** — whether accounts like ours are enrolled in that programme by default — and we have asked them to answer it in writing.                         |
| **Intron Health ("Sahara")** | Not stated anywhere | **Unresolved.** Their published privacy policy and terms predate the speech service, and nothing published covers whether they keep audio or train on it.                                                                                                                                                                                                                                                                      |

**We do not send your recording to a company whose terms we have not resolved.** Today that means your
audio goes to **AssemblyAI** and **Deepgram**, and **nothing goes to Intron Health** unless and until they
answer in writing that they do not keep the audio and do not train on it. If we want to add a company that
is not in the table above, we will ask you again — this consent does not cover one.

Deepgram is included because the opt-out is something we do on **every single request**, not a setting we
rely on them to have applied to our account: their terms say opted-out requests are kept only as long as
it takes to process them, and our code cannot send a request without that flag. The question we have asked
them in writing is about their default for accounts like ours, which our flag makes moot — we are asking so
that our own records are complete, not because your audio depends on the answer.

No other company receives your audio. In particular, the voice-synthesis vendor the product uses never
receives a word you said.

## What we will never do

- **We will not publish your recording** — not on a website, not in a talk, not in a repository.
- **We will not use it in marketing**, or in any material shown to customers or investors.
- **We will not use it to train a voice clone, a synthetic voice, or any model of ours**, and we will
  not let anyone else use it to train theirs.
- **We will not attach your name to it.** Your recording, transcript and every number derived from them
  are identified by a **speaker code**. Your name appears on this form and nowhere else.
- **We will not use it to assess you**, and nothing about it is shared with any employer or recruiter.

## How long we keep it

We keep the audio for **up to 12 months** from the day you record it, because a vendor changes its model
and the benchmark has to be re-run against the same voices to be comparable. _[Retention period to be
confirmed by Readi before this form is used.]_

At the end of that period the audio files are deleted from our machines and from our backups. The
transcript and the measurements are kept, under your speaker code, because they are the record of how we
chose a system — unless you ask us to delete those too, and then we do.

The audio is kept outside the product: never in the product's database, never in its file storage, and
never in our source-code repository.

## Withdrawing, and asking what we hold

**You can withdraw at any time, for any reason, without giving one**, and we will delete your audio and
your transcript. Write to _[privacy contact email]_ with your speaker code — you do not have to explain.
We will confirm when it is done. The only thing we cannot undo is a figure already printed in a report
that was written before you asked; we will not print it again.

You can also ask us what we hold about you, ask for a copy, or ask us to correct something. Same
address.

## Payment

**There is no payment for this recording**, unless we have separately agreed one in writing with you
before you record. If we have, the agreed amount is: _[amount, or "none"]_.

## Questions and complaints

Write to _[privacy contact email]_, or _[postal address]_. If you are not satisfied with how we have
handled your data you can complain to the **Nigeria Data Protection Commission**.

---

## Left for the lawyer

Deliberately not drafted here, because guessing would be worse than leaving it blank:

- The statutory content an NDPA 2023 consent notice must carry, and the wording of the consent itself.
- The lawful basis and notice wording if a speaker is in the EU or UK.
- Cross-border transfer: the audio goes to a company processing in the United States and one in the EU.
- Whether a separate data-processing agreement is needed with each vendor for this use, and whether the
  vendors' standard terms are enough.
- The retention period, and whether the transcript may be kept after the audio is deleted.
- What "not used to train any model" has to say to be enforceable against a vendor rather than trusted.

---

## Signature

I have read this form. I understand what the recording is for, which companies will receive it, that a
person will listen to all of it, how long it will be kept, and that I can withdraw at any time. I agree
to Readi processing my voice recording for the purpose described above.

**Name:** ..............................................................

**Speaker code:** ..................... **Date:** ....................

**Signature:** ........................................................

**For Readi:** ........................................ **Date:** ....................

> Not to be signed in this form. See the notice at the top.
