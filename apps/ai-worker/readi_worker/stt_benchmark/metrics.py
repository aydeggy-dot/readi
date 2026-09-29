"""What the accent benchmark measures, and in the order ADR-0020 §7 puts it.

**Word error rate, overall and per speaker.** The per-speaker figure is the one that matters: an
average hides the one speaker a provider fails, and a speaker is the fairness unit here in exactly
the way a criterion is in `/evals`. A provider that is excellent on seven speakers and unusable on
the eighth has not passed.

**Technical-term error rate**, over the terms in `content/glossary/tech_terms.txt` that the
reference actually contains. This is the figure that can disqualify a provider on its own: a
recogniser that hears "I don't potent" for "idempotent" is unusable for this product however good
its overall rate looks.

**Filler retention**, which is not accuracy and is reported because M6 needs it. A vendor that
silently drops hesitations is not less accurate — the normalizer removes them from both sides — but
it is less useful to a product that coaches a candidate on filler words.

Word error rate is the standard edit distance over tokens, `(S + D + I) / N`, on the normalizer's
output. It can exceed 1.0 when a recogniser inserts more than it gets right, and the report prints
that rather than clamping it, because a figure above 100% is information.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from readi_worker.stt_benchmark.normalize import hesitation_count, tokens


@dataclass(frozen=True)
class Alignment:
    """One reference against one hypothesis, in the counts a word error rate is made of."""

    reference_words: int
    substitutions: int
    deletions: int
    insertions: int

    @property
    def errors(self) -> int:
        return self.substitutions + self.deletions + self.insertions

    @property
    def wer(self) -> float:
        if self.reference_words == 0:
            # An empty reference is a manifest error, not a score. The report refuses to print it.
            return 0.0 if self.insertions == 0 else float("inf")
        return self.errors / self.reference_words


def align(reference: str, hypothesis: str) -> Alignment:
    """Edit distance over normalised tokens, keeping the three counts apart.

    They are kept apart because they mean different things about a recogniser: deletions are a model
    that gave up, insertions are one that hallucinated, and substitutions are one that misheard. For
    an accent benchmark the third is the interesting one.
    """
    ref = tokens(reference)
    hyp = tokens(hypothesis)
    # Standard Levenshtein with backtracking over operations. Clips are seconds long, so the
    # quadratic table is cheaper than anything clever and easier to be sure of.
    rows, columns = len(ref) + 1, len(hyp) + 1
    cost = [[0] * columns for _ in range(rows)]
    for i in range(1, rows):
        cost[i][0] = i
    for j in range(1, columns):
        cost[0][j] = j
    for i in range(1, rows):
        for j in range(1, columns):
            if ref[i - 1] == hyp[j - 1]:
                cost[i][j] = cost[i - 1][j - 1]
            else:
                cost[i][j] = 1 + min(cost[i - 1][j - 1], cost[i - 1][j], cost[i][j - 1])

    substitutions = deletions = insertions = 0
    i, j = len(ref), len(hyp)
    while i > 0 or j > 0:
        if i > 0 and j > 0 and ref[i - 1] == hyp[j - 1] and cost[i][j] == cost[i - 1][j - 1]:
            i, j = i - 1, j - 1
        elif i > 0 and j > 0 and cost[i][j] == cost[i - 1][j - 1] + 1:
            substitutions += 1
            i, j = i - 1, j - 1
        elif i > 0 and cost[i][j] == cost[i - 1][j] + 1:
            deletions += 1
            i -= 1
        else:
            insertions += 1
            j -= 1
    return Alignment(len(ref), substitutions, deletions, insertions)


def pooled(alignments: Sequence[Alignment]) -> float:
    """The word error rate over several clips, pooled rather than averaged.

    Pooled, because averaging per-clip rates weights a five-word clip the same as a two-minute
    answer. The per-speaker figures below are pooled the same way, over that speaker's clips.
    """
    words = sum(a.reference_words for a in alignments)
    if words == 0:
        return 0.0
    return sum(a.errors for a in alignments) / words


@dataclass(frozen=True)
class TermScore:
    """How a single glossary term fared: how often the reference said it, how often it survived."""

    term: str
    occurrences: int
    recognised: int

    @property
    def error_rate(self) -> float:
        return 0.0 if self.occurrences == 0 else 1 - self.recognised / self.occurrences


def term_scores(reference: str, hypothesis: str, glossary: Sequence[str]) -> list[TermScore]:
    """Per-term counts for the terms this reference actually contains.

    A term is "recognised" when its whole token sequence appears in the hypothesis. Multi-word terms
    are matched as a sequence, so "cache invalidation" does not count as heard because both words
    appear somewhere — which is the sort of near-miss that makes a lenient benchmark useless.
    """
    ref_tokens = tokens(reference)
    hyp_tokens = tokens(hypothesis)
    scores: list[TermScore] = []
    for term in glossary:
        needle = tokens(term)
        if not needle:
            continue
        occurrences = _count(ref_tokens, needle)
        if occurrences == 0:
            continue
        found = _count(hyp_tokens, needle)
        scores.append(TermScore(term, occurrences, min(found, occurrences)))
    return scores


def term_error_rate(scores: Sequence[TermScore]) -> float:
    occurrences = sum(score.occurrences for score in scores)
    if occurrences == 0:
        return 0.0
    recognised = sum(score.recognised for score in scores)
    return 1 - recognised / occurrences


def filler_retention(reference: str, hypothesis: str) -> float | None:
    """What share of the reference's hesitations the recogniser wrote down.

    None when the reference has none, which is the ordinary case for read speech. Above 1.0 means
    the recogniser wrote down more than were there — also information, so it is not clamped.
    """
    expected = hesitation_count(reference)
    if expected == 0:
        return None
    return hesitation_count(hypothesis) / expected


def _count(haystack: Sequence[str], needle: Sequence[str]) -> int:
    """Non-overlapping occurrences of a token sequence."""
    found = 0
    index = 0
    while index <= len(haystack) - len(needle):
        if list(haystack[index : index + len(needle)]) == list(needle):
            found += 1
            index += len(needle)
        else:
            index += 1
    return found
