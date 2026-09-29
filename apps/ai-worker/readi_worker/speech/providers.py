"""Which speech providers this build can construct, and the facts about each that code must know.

A descriptor rather than a frozenset of names, because four things differ per vendor in ways that
silently corrupt something if they are assumed:

- **what the meter counts.** Deepgram bills audio minutes; AssemblyAI's streaming product bills
  **socket-open** minutes ("A WebSocket open for 60 minutes with 30 minutes of audio sent is billed
  for 60 minutes"). In an interview the candidate spends much of the session thinking in silence, so
  reading one rate as the other is wrong by a factor of three, in the direction that flatters us.
- **how many keyterms it will take.** Our glossary is 302 terms and no live path accepts that many,
so
  the cap decides which technical words a candidate can afford to have misheard.
- **what unit word offsets are in.** Deepgram reports seconds, AssemblyAI milliseconds. M6's
delivery
  metrics read those offsets.
- **what keeps our audio out of their training set**, and whether that is something code can assert
or
  a switch in somebody's dashboard. Where code can assert it, it is in `always_send` or `base_url`
  and
  a request may not be built without it. Where it cannot, it is written down here as a gap.

Every figure was read from the vendor's own page on the date in `checked`; `source` is the page. A
rate is only as good as the page it came from.
"""

from dataclasses import dataclass
from typing import Literal

#: What a per-minute meter counts. `audio` = minutes of audio sent; `session` = minutes the
#: connection was open, whether or not anybody was speaking.
BillingBasis = Literal["audio", "session"]

#: Which call a limit or a rate belongs to. The same model name can cost different amounts on each.
CallPath = Literal["streaming", "batch"]


@dataclass(frozen=True)
class SttVendor:
    name: str
    #: Base URL for the batch/REST API, EU where a vendor's EU region is what keeps our audio out of
    #: their training data.
    base_url: str
    #: Parameters every request must carry, and nothing may build a request without them. Empty
    #: means there is nothing code can assert — see `privacy`.
    always_send: dict[str, str]
    #: How many keyterms the vendor accepts, per path. Our glossary is longer than all of these.
    keyterm_limit: dict[CallPath, int]
    #: The unit the vendor reports word offsets in.
    timing_unit: Literal["seconds", "milliseconds"]
    #: Does it offer real-time streaming with interim results? A batch-only engine can be
    #: benchmarked as an accuracy ceiling but cannot serve a turn (ADR-0020 §7).
    streaming: bool
    #: What keeps candidate audio out of their training set, and who has to do it.
    privacy: str
    checked: str
    source: str


@dataclass(frozen=True)
class TtsVendor:
    name: str
    base_url: str
    always_send: dict[str, str]
    streaming: bool
    privacy: str
    checked: str
    source: str


STT_VENDORS: dict[str, SttVendor] = {
    "fake": SttVendor(
        name="fake",
        base_url="",
        always_send={},
        keyterm_limit={"streaming": 100, "batch": 1_000},
        timing_unit="milliseconds",
        streaming=True,
        privacy="No network and no key: nothing leaves the process.",
        checked="2026-09-29",
        source="readi_worker/speech/fake.py",
    ),
    "deepgram": SttVendor(
        name="deepgram",
        base_url="https://api.deepgram.com",
        # The Model Improvement Partnership is opt-**out**, and their page does not say whether
        # self-serve accounts are enrolled by default — so the parameter goes on every request and
        # the default is a question for their support, not an assumption of ours.
        always_send={"mip_opt_out": "true"},
        # "Keyterm Prompting ... boosts accuracy for up to 100 important terms", with the hard limit
        # "Key Terms are limited to 500 tokens per request; anything beyond that will return an
        # error". Nova-2 and older use `keywords` and are capped at 100.
        keyterm_limit={"streaming": 100, "batch": 100},
        timing_unit="seconds",
        streaming=True,
        privacy=(
            "mip_opt_out=true on every request. Their page: 'The only data we will store and use "
            "in future model training is the data that is contractually included through "
            "participation in the Deepgram Model Improvement Partnership Program' and 'Data from "
            "opted-out requests is retained only for the duration necessary to process the "
            "request.' Whether self-serve accounts are enrolled by default is NOT stated anywhere "
            "and is an open question for their support."
        ),
        checked="2026-09-29",
        source=(
            "https://developers.deepgram.com/docs/keyterm and "
            "/docs/the-deepgram-model-improvement-partnership-program"
        ),
    ),
    "assemblyai": SttVendor(
        name="assemblyai",
        # **The EU host is the privacy mechanism**, not a latency preference: it is the one
        # configuration in which they say they do not train on submitted files. Changing this line
        # changes what we have promised a candidate.
        base_url="https://api.eu.assemblyai.com",
        always_send={},
        # "Streaming: Maximum 100 terms total"; async up to 1,000 for Universal-3.5 Pro (200 for
        # Universal-2), "maximum 6 words per phrase", and capacity is consumed per word.
        keyterm_limit={"streaming": 100, "batch": 1_000},
        timing_unit="milliseconds",
        streaming=True,
        privacy=(
            "Their EU region plus the model-training opt-out. Their page: 'We will not use files "
            "you submit for model training if you are subject to a Business Associate Addendum, "
            "are utilizing our European servers, or if you have opted out from model training', "
            "and 'we offer zero data retention of audio and transcripts for our Streaming "
            "product'."
        ),
        checked="2026-09-29",
        source="https://www.assemblyai.com/docs/data-retention-and-model-training",
    ),
    "intron": SttVendor(
        name="intron",
        base_url="https://infer.voice.intron.io",
        # Their transcripts are LLM-post-corrected **by default**. For a benchmark that is a
        # confound (we would be scoring a language model's repair of a recogniser), and for this
        # product it is a hallucination risk in the one place we cannot afford one: the report
        # quotes the candidate's exact words back to them.
        always_send={"use_disable_llm_corrections": "true"},
        keyterm_limit={"streaming": 0, "batch": 0},  # no custom-vocabulary feature is documented
        timing_unit="milliseconds",
        # Streaming exists but caps a session at 300 s with a 60 s idle timeout, and the documented
        # response carries no word timings — so it is a benchmark reference, not a live path
        # (ADR-0020 §7, and the owner's decision of 2026-09-29).
        streaming=False,
        privacy=(
            "UNRESOLVED. Their only formal privacy policy and terms are dated January 2020, which "
            "predates the voice API; nothing on the API docs site covers retention or training. A "
            "written answer from voice@intron.io is owed before any consented human recording is "
            "sent."
        ),
        checked="2026-09-29",
        source="https://docs.voice.intron.io/docs/stt/file-upload-sync",
    ),
}

TTS_VENDORS: dict[str, TtsVendor] = {
    "fake": TtsVendor(
        name="fake",
        base_url="",
        always_send={},
        streaming=True,
        privacy="No network and no key: nothing leaves the process.",
        checked="2026-09-29",
        source="readi_worker/speech/fake.py",
    ),
    "elevenlabs": TtsVendor(
        name="elevenlabs",
        base_url="https://api.elevenlabs.io",
        # `enable_logging=false` is the zero-retention switch and is **refused off Enterprise**, so
        # there is nothing to send. The lever that exists is the account-level "Improve the models
        # for everyone" toggle, which the owner turned off on 2026-09-29 and which no test can
        # assert.
        always_send={},
        streaming=True,
        privacy=(
            "ACCOUNT-LEVEL ONLY on a self-serve plan, and a known gap. Their page: 'ElevenLabs "
            "uses certain data you provide to us to improve the quality of our audio models for "
            "everyone... By default, we don't train on any data from our Enterprise customers... "
            "Anyone can opt out of data use at any time.' The opt-out is a dashboard toggle (off "
            "since 2026-09-29), not an API flag; Zero Retention Mode is Enterprise-only. Synthesis "
            "receives only the interviewer's own words - never a candidate's - but those words "
            "include the probes, which are answer key, and they are retained in request history. "
            "Revisit before real users (docs/privacy/subprocessors.md)."
        ),
        checked="2026-09-29",
        source="https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models",
    ),
}

STT_PROVIDERS = frozenset(STT_VENDORS)
TTS_PROVIDERS = frozenset(TTS_VENDORS)

#: Which providers need an API key, and the environment variable that holds it. `fake` needs none,
#: which is what makes it the resting state of a dev stack.
STT_KEY_VARIABLES: dict[str, str] = {
    "deepgram": "DEEPGRAM_API_KEY",
    "assemblyai": "ASSEMBLYAI_API_KEY",
    "intron": "INTRON_API_KEY",
}
TTS_KEY_VARIABLES: dict[str, str] = {"elevenlabs": "ELEVENLABS_API_KEY"}
