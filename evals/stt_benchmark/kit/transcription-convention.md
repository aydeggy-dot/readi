# Transcription convention — v1

The rules the person writing a reference transcript follows.

**Why a document exists for this at all:** word error rate is a function of what counts as the same word
(ADR-0020 §5). Case, punctuation, numbers, fillers and Pidgin spelling are all choices, and the
difference between two conventions is larger than the difference between two speech-recognition
vendors. So there is **one** convention, it is written down, and there is **one** normalizer module with
tests that applies the mechanical half of it to both the reference and every provider's output before
anything is scored.

Every transcript records the convention version it was written under (`convention: v1`). If this
document changes in a way that changes a transcript, the version goes up and every figure measured
under the old one says so.

---

## The procedure (ADR-0020 §4)

1. **Two providers transcribe the clip**, from two different vendors. Both outputs are kept and both are
   named in the manifest.
2. **One of them is the draft.** Open the second beside it as a second opinion on a word you cannot
   place — never as an arbiter.
3. **Listen to the whole clip, end to end, and correct the whole draft against what you hear.** Not the
   parts that look wrong. Not the parts the two providers disagree about. All of it, with headphones,
   pausing and rewinding as much as you need.
4. **Re-listen to every stretch you changed**, once, before you move on.
5. **Record in the manifest**: your initials, the date, the convention version, the two providers and
   their models, and anything you flagged.

Budget **five to eight minutes of work per minute of audio** for spontaneous speech. That is the cost
the ADR knowingly accepts, and the schedule is built around it.

### Reviewing only the disagreements is forbidden

It is the obvious shortcut and it is banned, for the reason the whole benchmark exists: **when two
recognisers mishear a Nigerian accent, they mishear it the same way, and then they agree.** A
disagreement-only pass never surfaces that error, so nobody checks it — and the transcript comes out
looking carefully adjudicated while having systematically hidden exactly the failures we are here to
find. Two agreeing machines are not evidence; they are two machines.

### Part A is read, but the reference is still what was said

The read sentences are printed in the recording script, so the expected text is known in advance. That
is not the reference. **If the speaker misread a word, added a word, or said a sentence twice, the
reference is what they actually said** — transcribe it, and note the departure in the manifest. A
reference that quietly matches the script measures nothing.

---

## Verbatim means verbatim

Write what was said, in the order it was said, including everything a tidy transcript would remove.
Hesitation, a false start, a repeated word, a sentence that changes direction half way — that is the
data. A transcript that reads well is the wrong transcript.

### Hesitations and non-lexical sounds

Use these spellings and no others:

| Sound                                     | Write      |
| ----------------------------------------- | ---------- |
| the "uh" sound                            | `uh`       |
| the "um" sound                            | `um`       |
| the "mm" sound, thinking                  | `mm`       |
| agreement, two syllables                  | `mm-hm`    |
| "eh", questioning or Nigerian-English tag | `eh`       |
| "ah", realisation                         | `ah`       |
| "oh"                                      | `oh`       |
| in-breath, audible and meaningful         | `[breath]` |

**Elongation is never spelled out.** "Uhhhhh" is `uh`; "sooooo" is `so`; "welllll" is `well`. Length is
not a word, and letting the transcriber decide how many letters to type puts a free variable into every
figure. If a hesitation is unusually long and worth knowing about, the note goes in the manifest, not in
the transcript.

**Repetition is written out.** "I I I think" is `I I I think`, three tokens. "The the connection pool" is
`the the connection pool`.

### False starts and self-correction

Write the abandoned start and end it with a dash, then write what they said instead:

> so I would check the logs — actually no, first I would look at the p95

Do not smooth this into one sentence, and do not delete the abandoned half. Do not insert the word you
think they were about to say.

### Filler words

Transcribe them. There are two kinds and the normalizer treats them differently, which is why the
transcript has to contain both.

- **Non-lexical hesitations** — `uh`, `um`, `mm`, `eh` and the rest of the table above. The normalizer
  **drops these before scoring** and counts them separately (`filler_retention` in `metrics.py`):
  whether a vendor writes "um" down is a formatting decision at their end, not a recognition result, and
  ranking them on it would measure the wrong thing. They are still transcribed, because M6's delivery
  coaching counts them and because a vendor that silently discards them is less useful to us — which is
  the figure `filler_retention` reports.
- **Lexical fillers** — `like`, `you know`, `actually`, `basically`, `I mean`, `so`, `okay`, `sort of`,
  `now now`, `abi`, `sha`, `o`. These are words, they are scored as words, and a provider that tidies
  them away should lose the point. Do not drop them and do not promote one into punctuation.

---

## Numbers, versions and units

**Write numbers as words, exactly as spoken**, and never as digits. The reference is a record of speech,
and "80" is not a thing anybody said.

A provider that writes `80` where the reference says `eighty` is **not** penalised for it: the normalizer
writes every integer below 1,000 as words on both sides, so `80`, `eighty`, `300` and `three hundred` all
compare equal. Above 999 it does not, and cannot: "2026" is "twenty twenty-six" to one transcriber and
"two thousand and twenty-six" to another, and a version number is neither. **That is why years, versions
and identifiers are written as digits** in the table below — the one place this convention asks for a
digit — and everything a person counts out loud is written as words.

| Spoken                        | Write                         |
| ----------------------------- | ----------------------------- |
| "eighty milliseconds"         | `eighty milliseconds`         |
| "three hundred milliseconds"  | `three hundred milliseconds`  |
| "two hundred thousand naira"  | `two hundred thousand naira`  |
| "twenty twenty-six"           | `twenty twenty-six`           |
| "two thousand and twenty-six" | `two thousand and twenty-six` |
| "version two"                 | `version two`                 |
| "React eighteen"              | `React eighteen`              |
| "Python three point twelve"   | `Python three point twelve`   |
| "a four-digit PIN"            | `a four-digit PIN`            |
| "three mils"                  | `three mils`                  |
| "twenty megs"                 | `twenty megs`                 |

Units are written as said and never expanded: "mils" stays `mils`, "megs" stays `megs`, "milliseconds"
stays `milliseconds`. Expanding an abbreviation the speaker chose is editing.

**The one exception is a term that contains a digit.** `p95`, `p99`, `S3`, `MD5`, `Argon2` keep the
spelling `content/glossary/tech_terms.txt` gives them, however they are pronounced, because that file is
both the custom-vocabulary list loaded into the provider and the tech-term subset the report scores. The
same goes for `k8s`, which is not in the glossary but is in the normalizer's alias table — see below.

### "k8s" and "kubernetes"

Write what the speaker said, using the glossary spelling of whichever they said:

- they said "kubernetes" → `Kubernetes`
- they said "kates" or "k eight s" → `k8s`

The normalizer maps `k8s` and `Kubernetes` to one token, so the word error rate is the same either way
and the tech-term rate counts both as the term. Its alias table also holds `Postgres` / `PostgreSQL`,
`JS` / `JavaScript`, `TS` / `TypeScript`, `Node.js`, `Next.js` and `CI/CD`.

**The equivalence classes live in the normalizer (`ALIASES` in `normalize.py`), with tests** — never in a
transcriber's judgement and never invented on the fly. The table is short on purpose: an alias that
quietly repairs a mishearing hides exactly what the benchmark is for. If you meet a pair it does not
know, transcribe what was said and raise it; do not spell one term as another to make it match.

---

## Capitalisation of product names

Use the spelling in `content/glossary/tech_terms.txt`: `PostgreSQL`, `JavaScript`, `TypeScript`,
`Node.js`, `Next.js`, `nginx`, `webpack`, `pytest`, `Kubernetes`, `Redis`, `Cypress`, `Playwright`.

**A lowercase product name stays lowercase even at the start of a sentence** — write `nginx sits in
front of it`, not `Nginx`. Sentence case does not outrank a name.

Everything is lowercased by the normalizer before scoring, so this matters for the person reading the
transcript and for matching the tech-term list, not for the number.

---

## Punctuation

Use ordinary sentence punctuation — full stops, commas, question marks — so that a person can read the
transcript and check it against the audio. Capitalise the start of a sentence, apart from the rule above.

**Punctuation is stripped before scoring**, so it cannot change a figure. That is exactly why it must
never be used to tidy speech: a comma that turns a false start into a clause has changed the words, and
the words do count. Punctuate what is there; do not punctuate what you wish were there.

Contractions are written as said: `don't`, `it's`, `we've` — and `do not` when that is what was said. The
normalizer does not treat the two as the same word, so the rule is the ordinary one: write what you hear,
and do not expand or contract on the speaker's behalf.

---

## Unintelligible speech

Mark it `[unintelligible]` — one marker per unclear stretch, however many words it covers. If you have a
guess worth recording, write `[unintelligible: sounds like "connection pool"]`; the guess is for the
reader and the normalizer ignores it.

**Do not guess into the transcript.** A guessed word scored as a reference is a provider punished or
rewarded for our invention.

A bracketed marker is not a word anybody said, and the normalizer **drops every `[...]`, `<...>` and
`(...)` marker before scoring** (`_MARKERS` in `normalize.py`, with a test). Stripping only the brackets
would be worse than leaving them: it would put `unintelligible` in the reference as a word no provider can
ever produce, which is a free error per marker.

Record the count in the manifest. A clip where **more than 5% of words** are unintelligible is flagged,
and one over 10% is not usable as a reference — say so rather than filling the gaps.

---

## Non-speech events

In square brackets, lowercase, from this list where it fits:

`[laughs]` `[coughs]` `[sighs]` `[clears throat]` `[breath]` `[phone rings]` `[notification]`
`[knocking]` `[door]` `[generator starts]` `[generator]` `[traffic]` `[music]` `[wind]`
`[microphone noise]` `[background voice]` `[silence]`

Use `[silence]` only for a pause long enough that a reader would otherwise think the file was cut.

These are dropped before scoring by the same rule as `[unintelligible]` — a marker is not a word. They
are in the transcript because they explain a mishearing:
a provider that loses a sentence under `[generator starts]` has told us something about Nigerian
conditions, and without the marker it just looks like a bad provider.

---

## Overlapping speech

**The reference contains only the speaker's own words.** Another person's voice is `[background voice]`,
whatever they said — we did not consent them and we are not scoring them.

Where the speaker's words are genuinely buried under another voice, write
`[unintelligible] [background voice]` and move on. Do not reconstruct.

If two voices overlap for more than a few seconds anywhere in the clip, flag the clip: it is not the
condition we set out to measure and the report should not pretend otherwise.

---

## Pidgin orthography

One prompt invites Pidgin, speakers code-switch inside a sentence, and Nigerian Pidgin has no single
agreed spelling. That is a problem for a word error rate, because `dey`, `de` and `they` are three
different tokens for one word.

**The convention: English-etymology spellings, as used by BBC News Pidgin and most Nigerian online
writing** — not the phonemic orthography of the Naija Languej Akedemi.

Chosen for three reasons: it is what the providers' own output looks like, so the draft needs less
rewriting and fewer transcriber decisions; it is documented and searchable, so a new transcriber can
check a word without asking; and it is readable to somebody who knows English but not Pidgin, which is
who reviews these transcripts. The phonemic orthography is the more principled system and it would have
been a defensible choice too.

**A Pidgin word error rate is therefore partly a measurement of us**, and it is reported as its own
variety (`variety: pidgin` in the manifest) rather than pooled into an overall figure, so that a
provider's Pidgin number is read as an upper bound on its error rather than as a clean result. The pinned
spellings below are **not** in the normalizer's alias table on purpose: a provider that spells Pidgin
differently from our convention really has produced different text, and hiding that behind an alias would
flatter whichever provider happens to match the transcriber.

**What matters more than the choice is that there is one.** Two conventions in one dataset make every
figure in the report unreadable — a provider looks worse on the clip whose transcriber spelled `wetin`
as `wetin` than on the one spelled `wettin`, and the difference is us. So: this list, every time.

### Pinned spellings

| Write                | Not                                            |
| -------------------- | ---------------------------------------------- |
| `na`                 | nah, naa                                       |
| `no be`              | nobe                                           |
| `dey`                | de, they (as the Pidgin marker)                |
| `don`                | doh, dun                                       |
| `go` (future marker) | gonna, gon                                     |
| `wan`                | wanna, wan'                                    |
| `fit`                | —                                              |
| `make`               | mek                                            |
| `wetin`              | wettin, watin, wharrin                         |
| `sabi`               | savvy                                          |
| `abeg`               | abegg, I beg (as one word sense)               |
| `abi`                | abi? — keep the spelling, punctuate separately |
| `sha`                | shaa                                           |
| `o` (final particle) | oo, ooo                                        |
| `e` (it / he / she)  | ee, eh                                         |
| `im`                 | 'im, him (as the Pidgin pronoun)               |
| `dem`                | them (as the Pidgin pronoun)                   |
| `una`                | unna, oona                                     |
| `wahala`             | wahalla                                        |
| `comot`              | komot                                          |
| `plenty`             | plenti                                         |
| `small small`        | small-small, smallsmall                        |
| `sharp sharp`        | sharp-sharp                                    |
| `like say`           | likesay                                        |
| `oga`                | ogah                                           |
| `pikin`              | pickin                                         |

Rules around the list:

- **A word that is just English keeps its English spelling.** `work`, `time`, `problem`, `computer` are
  written normally even in a Pidgin sentence. Only use a Pidgin spelling for a word on the list or
  clearly of the same kind.
- **Reduplication is two words**, never hyphenated: `small small`, `sharp sharp`, `now now`.
- **Code-switching needs no marker.** Write the sentence as it came out, Pidgin words and English words
  together, and do not bracket the switch. A marker would be a judgement about which language a word
  belongs to, made hundreds of times, differently each time.
- **A word not on the list:** spell it the way the list would — English etymology, no apostrophes, no
  doubled vowels — transcribe it, and add it to this document in the same change, with the version
  bumped. The list grows by decision, not by habit.
- The normalizer should hold the variant → pinned mappings above, so a provider that writes `de` for
  `dey` is not punished for a spelling choice. It cannot rescue a word nobody pinned, which is why this
  list is the single source — check `ALIASES` against it before a Pidgin clip is scored.
- **A Pidgin answer is its own row in the manifest** (`variety: pidgin`), scored apart from
  `nigerian_english`. A recogniser that collapses on code-switching fails mid-interview, and an average
  over both varieties is the figure that would hide it.
