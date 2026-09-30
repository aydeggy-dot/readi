"""What voice knows about a turn that text does not — and the one rule that changes a score.

This module owns `TurnVoice` for both speakers: the candidate's word timings on their own turn, and
on an interviewer turn the two barge-in facts, `spoken_ms` and `interrupted` (ADR-0019 §8). Barge-in
is allowed and encouraged; what is not allowed is a transcript that does not admit it happened,
because the evaluator later reads "the question that was asked" and the report shows it to the
candidate.

## A probe counts as asked only if the candidate heard its ask

Owner's decision, 2026-09-29, built here. `session_turns.follow_up_index` is the **engine fact** M4
scores on: a criterion whose probe was asked contributes at 0.85 of its weight, and a criterion with
probes that were never asked is **not assessed** and leaves the denominator (`scoring.ts`,
`prompting.ts`, `SCORING_VERSION` 2). A candidate who talks over a probe before it has said what it
wants was not asked anything — so the pushed turn carries `follow_up_index: null`, and the criterion
falls into `unaskedCriteria` like any other the interview never reached. It is M4's clock rule in a
different transport: **a candidate never loses marks for something they did not hear.**

Three things this deliberately does *not* do.

**The engine's own bookkeeping stands.** `probes_asked` still holds the probe, so the follow-up cap
still counts it and the engine will not put it again. Re-asking a probe the candidate has just
talked over would be an interviewer who did not notice being interrupted, and — with the cap
unmoved — a loop two barge-ins long. The candidate's act spends the probe; it does not score them.

**The coverage log keeps naming the probe the engine chose.** `criteria_covered.follow_up_index` on
the *previous* candidate turn records the engine's decision; it is not a claim about what was heard,
and nothing scores on it.

**A question talked over is answered differently: the interviewer says it again** (owner's
follow-up, 2026-09-30; `needs_repeating` below, and `session.py`). The probe rule keys on
`follow_up_index`, and the one criterion an opening prompt asks for carries no probe, so it is never
in `unaskedCriteria` — a candidate talked over before a *question's* ask would be scored on it
whatever we recorded. So this one is not fixed in the accounting at all. The question is **put
again**, once, and the answer that follows is an answer to a question they have heard. Not scoring
it would also have worked and is worse: the candidate loses the marks either way, and the interview
loses the answer too.

**The other half of that rule is in `session.py`: words spoken before the question finished are not
an answer to it.** A candidate who talks over a question and stops before it ends has said
something — "sorry, what?", or the first half of an answer to what they thought was being asked —
and it arrives as a committed turn a moment later. Taking it would score the interjection and waste
the repeat.

## How "heard the ask" is decided, and which way it errs

The ask is somewhere inside the text, usually at the end of a sentence, and what the candidate needs
is the end of that sentence: "and what would you change" cut after "and what" asks nothing. So
`ask_end_offset` finds the first sentence boundary by which the text has made an ask (counted with
`interview/asks.py`, the same counter the phrasing guard uses), and the question is whether playback
reached it.

Two ways of knowing how far playback got, in order of preference:

1. **the text that was actually spoken**, where the transport can synchronise a transcript with
   playback — an exact prefix, and no estimation at all;
2. **the fraction of the audio that played**, which maps to a character offset only on the
   assumption of an even speaking rate. That assumption is wrong in both directions on real speech.

The comparison therefore **errs towards "not heard"**, because the two errors are not equal:
judging an unheard ask "heard" scores the candidate on a criterion nobody put to them, while
judging a heard ask "not heard" leaves that criterion out of the denominator and costs them nothing
(CLAUDE.md §5, the 2026-09-27 decision). Over-reserving is the safe direction here too.

The one allowance in the other direction is a **clipped last word**. A candidate who starts
answering as the question finishes has heard the question, and requiring playback to reach the last
character would call that one unasked — so the test is "reached the ask's end, give or take a
syllable". Four characters is that syllable, and a probe cut off mid-sentence is nowhere near it.
"""

import re
from dataclasses import dataclass

from readi_worker.contracts import InterviewTurn, TurnVoice
from readi_worker.interview.asks import count_asks
from readi_worker.speech.base import TranscriptWord as SpeechWord

#: How much of the ask's last word may be missing and still count as heard — one clipped syllable.
#: Characters, because that is the unit both paths land in: an exact spoken prefix, or a fraction of
#: the audio mapped onto the text. The header says why the allowance goes this way and no further.
HEARD_TAIL_TOLERANCE_CHARACTERS = 4

#: Mirrors `VOICE_LIMITS.maxWordsPerTurn` in @readi/shared-types: the contract refuses more, and a
#: turn is dropped word timings rather than refused whole.
MAX_WORDS_PER_TURN = 2_000

#: The end of a sentence: the punctuation plus whatever follows it. `(?=\s|$)` keeps "3.5" and
#: "e.g." from ending a sentence in the middle of a word, which is as far as this needs to go — it
#: is locating an ask in one or two spoken sentences, not parsing prose.
_SENTENCE_END = re.compile(r"[.?!]+(?=\s|$)")


@dataclass(frozen=True, slots=True)
class Playback:
    """What the transport knows about one spoken turn once its audio has settled.

    `total_ms` is how long the whole turn would have taken to speak, where the transport can say —
    without it an interrupted turn cannot be placed in the text at all, and the rule says "not
    heard". `heard_text` is the synchronised prefix where the transport produces one; it makes the
    estimate unnecessary.
    """

    spoken_ms: int
    interrupted: bool
    total_ms: int | None = None
    heard_text: str | None = None


def ask_end_offset(text: str) -> int:
    """The character offset by which `text` has asked for something.

    The end of the first sentence whose prefix asks anything; the whole text when nothing in it
    reads as an ask, which is the conservative answer rather than a claim that there was no ask.
    """
    stripped = text.strip()
    if not stripped:
        return 0
    for match in _SENTENCE_END.finditer(stripped):
        end = match.end()
        if count_asks(stripped[:end]) > 0:
            return end
    return len(stripped)


def heard_the_ask(text: str, playback: Playback) -> bool:
    """Did the candidate hear enough of `text` to know what it asked?

    A turn that played to the end was heard. One that was cut off is measured, preferring the
    spoken prefix over the audio fraction, and refused when neither can place it.
    """
    if not playback.interrupted:
        return True
    needed = ask_end_offset(text)
    if playback.heard_text is not None:
        spoken_characters = float(len(playback.heard_text.strip()))
    else:
        total = playback.total_ms
        if total is None or total <= 0:
            # Interrupted, and nothing says where in the text that happened. The candidate is given
            # the benefit of it: the criterion goes unassessed rather than being scored on a guess.
            return False
        fraction = min(1.0, max(0.0, playback.spoken_ms / total))
        spoken_characters = fraction * len(text.strip())
    return spoken_characters + HEARD_TAIL_TOLERANCE_CHARACTERS >= needed


def needs_repeating(turn: InterviewTurn, playback: Playback | None) -> bool:
    """Should this turn be said again before anybody is asked to answer it?

    Only a **question**, and only when its ask was not heard. A probe is not repeated: the probe
    rule already protects the candidate from being scored on one they did not hear, and re-asking
    something they deliberately talked over would be an interviewer who had not noticed. A question
    is different — there is nothing else for the answer to be about.
    """
    if turn.speaker != "interviewer" or turn.state != "question":
        return False
    if turn.follow_up_index is not None:
        return False  # belt and braces: a probe is `follow_up`, never `question`
    return not heard_the_ask(turn.text, playback or Playback(spoken_ms=0, interrupted=True))


def merged(first: Playback, second: Playback) -> Playback:
    """Two attempts at one turn, as the one thing the transcript records.

    `interrupted` stays **true**, because the candidate did talk over it and that is a delivery fact
    M6 will want. `spoken_ms` becomes the second attempt's, because what the record has to answer is
    "did they hear this question", and after a completed repeat they did. The first attempt's own
    position is in the leg's log and nowhere else, which is the one thing this loses.
    """
    return Playback(
        spoken_ms=second.spoken_ms,
        interrupted=True,
        total_ms=second.total_ms if second.total_ms is not None else first.total_ms,
        heard_text=second.heard_text,
    )


def spoken_turn(turn: InterviewTurn, playback: Playback | None) -> InterviewTurn:
    """One interviewer turn as it is pushed: its barge-in facts, and the probe rule applied.

    `playback` is None for a turn whose audio never started — nothing was heard, so a probe on it
    was not asked.
    """
    settled = playback or Playback(spoken_ms=0, interrupted=True, total_ms=None)
    payload = turn.model_dump(mode="json")
    if turn.follow_up_index is not None and not heard_the_ask(turn.text, settled):
        payload["follow_up_index"] = None
    payload["voice"] = {
        "words": [],  # We know what we said; timings are for what the candidate said.
        "stt_confidence": None,
        "spoken_ms": settled.spoken_ms,
        "interrupted": settled.interrupted,
    }
    return InterviewTurn.model_validate(payload)


def heard_turn(
    turn: InterviewTurn, words: list[SpeechWord], confidence: float | None
) -> InterviewTurn:
    """One candidate turn as it is pushed: the word timings that make M6's coaching possible.

    Stored at the moment they exist because they cannot be recovered from the text afterwards, and
    nothing is computed from them here (the M5/M6 line, `docs/plans/m5-voice.md` decision 8).
    Offsets are taken as the recogniser reported them and **not** sanity-checked: a zero-length or
    overlapping word must not cost a whole exchange over a number nobody reads directly.
    """
    payload = turn.model_dump(mode="json")
    payload["voice"] = {
        # Built as plain JSON and validated with the turn, rather than through `TranscriptWord`:
        # the generated contract wraps every constrained scalar in a RootModel, so constructing one
        # field by field buys a wrapper per word and no extra checking.
        "words": [
            {
                "text": word.text[:80],
                "start_ms": max(0, word.start_ms),
                "end_ms": max(0, word.end_ms),
                "confidence": _confidence(word.confidence),
            }
            for word in words[:MAX_WORDS_PER_TURN]
        ],
        "stt_confidence": _confidence(confidence),
        "spoken_ms": None,
        "interrupted": False,
    }
    return InterviewTurn.model_validate(payload)


def empty_voice() -> TurnVoice:
    """The `TurnVoice` of a turn voice mode knows nothing extra about."""
    return TurnVoice.model_validate(
        {"words": [], "stt_confidence": None, "spoken_ms": None, "interrupted": False}
    )


def _confidence(value: float | None) -> float | None:
    """Clamped, because a provider reporting 1.0000001 must not refuse the exchange."""
    return None if value is None else min(1.0, max(0.0, value))
