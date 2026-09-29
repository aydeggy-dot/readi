"""`TextToSpeech` backed by ElevenLabs' synthesis endpoint.

The non-streaming endpoint, deliberately: what this adapter is for is audio we generate **once** and
keep — the interviewer's pinned acknowledgements and connectives (the whole of latency lever 1), the
rendered intro, the voices compared by the phase-7 panel, and the synthetic clips the accent
pre-screen transcribes. The live path is LiveKit's plugin with our key (ADR-0019 §2).

Three details that are easy to get wrong and expensive to get wrong:

- **`model_id` defaults to `eleven_multilingual_v2` at their end**, which is $0.08 per thousand
  characters against Flash's $0.04. Omitting it silently doubles the bill, so it is always sent
  explicitly.
- **The voice is in the path, not the body**, and a Voice Library voice belongs to somebody who may
  withdraw it. Audio already generated survives a withdrawal for good; live synthesis does not —
  which is a second reason the fixed lines are rendered once and cached.
- **WAV is only offered on this endpoint**, not the streaming one, and 44.1 kHz PCM/WAV needs a Pro
  plan. `wav_22050` is the default here because the benchmark reads durations out of WAV headers and
  because it is available on every plan.

Synthesis receives **only the interviewer's own words** — never a candidate's speech or writing —
which is what keeps this vendor almost out of the personal-data path. "Almost" because those words
include the probes, which are answer key, and on a self-serve plan request history is retained: zero
retention is Enterprise-only, so the mitigation is the account-level training opt-out and the gap is
recorded in `docs/privacy/subprocessors.md`.
"""

import logging
import time

import httpx2

from readi_worker.speech.base import Synthesis, TtsError
from readi_worker.speech.providers import TTS_VENDORS

logger = logging.getLogger(__name__)

SPEECH_PATH = "/v1/text-to-speech"

#: Their formats are "codec_samplerate_bitrate". WAV at 22.05 kHz is readable by `wave`, available
#: on every plan, and small enough to keep hundreds of clips in a repository-adjacent cache.
DEFAULT_OUTPUT_FORMAT = "wav_22050"

CONTENT_TYPES = {"wav": "audio/wav", "mp3": "audio/mpeg", "pcm": "audio/L16", "opus": "audio/opus"}

RETRY_STATUSES = frozenset({408, 429, 500, 502, 503, 504})
MAX_ATTEMPTS = 3


class ElevenLabsTextToSpeech:
    provider = "elevenlabs"

    def __init__(
        self,
        api_key: str,
        *,
        timeout_s: float,
        output_format: str = DEFAULT_OUTPUT_FORMAT,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        vendor = TTS_VENDORS[self.provider]
        self._base_url = vendor.base_url
        self._always_send = dict(vendor.always_send)
        self._client = httpx2.AsyncClient(timeout=timeout_s, transport=transport)
        self._api_key = api_key
        self._output_format = output_format

    async def aclose(self) -> None:
        await self._client.aclose()

    async def synthesize(
        self, *, model: str, voice: str, text: str, timeout_s: float | None = None
    ) -> Synthesis:
        start = time.perf_counter()
        body: dict[str, object] = {"text": text, "model_id": model, **self._always_send}
        last: tuple[str, int] | None = None
        for attempt in range(MAX_ATTEMPTS):
            try:
                response = await self._client.post(
                    f"{self._base_url}{SPEECH_PATH}/{voice}",
                    params={"output_format": self._output_format},
                    headers={"xi-api-key": self._api_key},
                    json=body,
                    timeout=timeout_s,
                )
            except httpx2.HTTPError as exc:
                last = (type(exc).__name__, self._elapsed_ms(start))
                logger.warning("elevenlabs request failed (%s), attempt %d", last[0], attempt + 1)
                continue
            if response.status_code in RETRY_STATUSES and attempt < MAX_ATTEMPTS - 1:
                last = (f"HTTP {response.status_code}", self._elapsed_ms(start))
                continue
            if response.status_code != 200:
                raise TtsError(
                    f"HTTP {response.status_code}",
                    provider=self.provider,
                    model=model,
                    voice=voice,
                    latency_ms=self._elapsed_ms(start),
                )
            audio = response.content
            if not audio:
                raise TtsError(
                    "empty audio",
                    provider=self.provider,
                    model=model,
                    voice=voice,
                    latency_ms=self._elapsed_ms(start),
                )
            return Synthesis(
                audio=audio,
                content_type=self._content_type(),
                # **The characters we sent**, which is what the meter counts — not the audio we got.
                characters=len(text),
                provider=self.provider,
                model=model,
                voice=voice,
                latency_ms=self._elapsed_ms(start),
                audio_seconds=None,
            )
        code, latency = last or ("unknown", self._elapsed_ms(start))
        raise TtsError(code, provider=self.provider, model=model, voice=voice, latency_ms=latency)

    def _content_type(self) -> str:
        codec = self._output_format.split("_", 1)[0]
        return CONTENT_TYPES.get(codec, "application/octet-stream")

    @staticmethod
    def _elapsed_ms(start: float) -> int:
        return int((time.perf_counter() - start) * 1_000)
