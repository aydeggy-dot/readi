"""The one normalizer, because word error rate is a function of what counts as the same word.

ADR-0020 §5: there is **one** of these, with tests, and the transcription convention that human
reference transcripts follow is written to match it. Two notions of sameness make every figure in
the report unreadable, and the difference between providers is smaller than the difference between
conventions.

What it does, in order, to **both** sides of every comparison:

1. casefold, so capitalisation is not an error;
2. remove the transcriber's bracketed markers — `[unintelligible]`, `[laughs]`, `[phone rings]` —
  because
   they describe the recording rather than transcribe it, and left in they would score as a free
   error
   per marker against a recogniser that had nothing to write down;
3. spell out `%` and `&`;
4. strip thousands separators inside numbers;
5. replace every other punctuation mark with a space, because punctuation is a formatting choice
  each
   vendor makes differently and none of it is a recognition result;
6. write small integers as words, so a recogniser that prints "80" is not wrong against a
transcriber who wrote "eighty"; 7. apply a small alias table **at word boundaries**; 8. drop
hesitation tokens; 9. collapse whitespace.

**Aliases are applied at word boundaries, and that is not a detail.** The first version of this file
used a plain substring replace, which turned "requests" into "requestypescript" (`ts` →
`typescript`) and cascaded "postgres" → "postgresql" → "postgresqlsql". Both were caught by printing
eight sentences through it before anything depended on the output; a benchmark whose scoring
silently corrupts its own inputs would have produced numbers nobody could explain.

**Numbers are normalised only up to 999**, and that bound is a judgement rather than laziness. Below
it the mapping is unambiguous both ways — "three hundred" and "300" are the same thing said twice.
Above it it is not: "2026" is "twenty twenty-six" to one transcriber and "two thousand and
twenty-six" to another, and a version number is neither. So the code handles the range where it can
be right, and `transcription-convention.md` carries the rest as a rule for people: years, versions
and identifiers in digits, spoken counts in words.

**Hesitations are dropped from the score and measured separately.** Whether a recogniser writes down
"um" is a product decision at their end, not accuracy: punishing a vendor for omitting it would rank
them on formatting. But M6's delivery coaching counts filler words, so a vendor that silently
discards them is less useful to us — and that is its own figure (`filler_retention` in `metrics.py`)
rather than folded into a number that means something else. Lexical fillers that carry meaning —
"like", "you know", "basically" — are **not** in the hesitation set and are scored as the words they
are.

**Every alias is a judgement, and the table is short on purpose.** An alias that quietly repaired a
mishearing would hide exactly what the benchmark is for, so `dockerise` → `docker` is not here: a
recogniser that heard the wrong word got the wrong word.
"""

import re

#: Applied before punctuation is stripped, because the symbol *is* the punctuation.
SYMBOLS: dict[str, str] = {"%": " percent ", "&": " and "}

#: Written-vs-spoken forms of the same word, in **normalised** form (no punctuation, lower case) and
#: applied at word boundaries. Multi-word keys come first, so "node js" becomes "nodejs" before the
#: bare "js" rule could reach it.
ALIASES: dict[str, str] = {
    "node js": "nodejs",
    "next js": "nextjs",
    "vue js": "vuejs",
    "ci cd": "cicd",
    "k8s": "kubernetes",
    "postgres": "postgresql",
    "postgre": "postgresql",
    "js": "javascript",
    "ts": "typescript",
    "db": "database",
    "apis": "api",
}

#: Hesitations and backchannels, dropped from both sides before scoring and counted separately. The
#: spellings are the ones `transcription-convention.md` tells a transcriber to use; the regex
#: catches the elongations ("uhhh", "mmmm") and the vendors' own spellings, which no fixed list
#: survives.
HESITATIONS: frozenset[str] = frozenset(
    {"uh", "um", "uhm", "erm", "er", "ah", "eh", "mm", "hmm", "hm", "mhm", "mm-hm", "mhmm"}
)
_HESITATION_SHAPE = re.compile(r"^(?:u+[hm]+|e+r+m*|a+h+|e+h+|m+h*m*|h+m+)$")

#: `[unintelligible]`, `<inaudible>`, `(laughs)` — the transcriber describing the recording.
_MARKERS = re.compile(r"[\[<(][^\]>)]{0,40}[\]>)]")
_NUMBER_SEPARATOR = re.compile(r"(?<=\d),(?=\d)")
_DIGITS = re.compile(r"\b\d{1,3}\b")
_PUNCTUATION = re.compile(r"[^\w\s']|_")
_APOSTROPHE_EDGES = re.compile(r"(^'+)|('+$)")
_WHITESPACE = re.compile(r"\s+")
_ALIAS_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(rf"\b{re.escape(source)}\b"), target) for source, target in ALIASES.items()
]

_ONES = (
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
)
_TENS = ("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")


def in_words(value: int) -> str:
    """An integer below 1,000 as the words somebody would say. Larger values are returned as
    digits."""
    if value >= 1_000 or value < 0:
        return str(value)
    if value < 20:
        return _ONES[value]
    if value < 100:
        tens, ones = divmod(value, 10)
        return _TENS[tens] if ones == 0 else f"{_TENS[tens]} {_ONES[ones]}"
    hundreds, remainder = divmod(value, 100)
    words = f"{_ONES[hundreds]} hundred"
    return words if remainder == 0 else f"{words} {in_words(remainder)}"


def normalize(text: str) -> str:
    """The canonical form of a transcript, for comparison. Not for display."""
    lowered = _MARKERS.sub(" ", text.casefold())
    for symbol, word in SYMBOLS.items():
        lowered = lowered.replace(symbol, word)
    lowered = _NUMBER_SEPARATOR.sub("", lowered)
    lowered = _PUNCTUATION.sub(" ", lowered)
    lowered = _WHITESPACE.sub(" ", lowered).strip()
    lowered = _DIGITS.sub(lambda match: in_words(int(match.group())), lowered)
    for pattern, target in _ALIAS_PATTERNS:
        lowered = pattern.sub(target, lowered)
    return _WHITESPACE.sub(" ", lowered).strip()


def is_hesitation(word: str) -> bool:
    """Is this token a hesitation rather than a word? Shape as well as spelling, for the
    elongations."""
    return word in HESITATIONS or bool(_HESITATION_SHAPE.match(word))


def tokens(text: str, *, keep_hesitations: bool = False) -> list[str]:
    """The words to score, hesitations dropped unless asked for.

    `keep_hesitations=True` is what `filler_retention` uses: the same tokenisation, so the two
    figures are read off one pipeline rather than two.
    """
    words = [_APOSTROPHE_EDGES.sub("", word) for word in normalize(text).split()]
    words = [word for word in words if word]
    if keep_hesitations:
        return words
    return [word for word in words if not is_hesitation(word)]


def hesitation_count(text: str) -> int:
    """How many hesitation tokens a transcript contains."""
    return sum(1 for word in tokens(text, keep_hesitations=True) if is_hesitation(word))
