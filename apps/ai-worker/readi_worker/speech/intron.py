"""`SpeechToText` backed by Intron Health's "Sahara" API — a benchmark reference, not a live path.

Why it is here at all: it is the only vendor on the shortlist with models for Pidgin and for Hausa-,
Igbo- and Yoruba-accented English, and its published word-error-rate table covers those languages
while omitting accented English — the one figure the benchmark needs. ADR-0020 §7 scores a
batch-only engine as an accuracy ceiling and labels it as such, and that is what this is for.

**Three limits, from their own documentation, that make it unfit for an interview** (owner's
decision,
2026-09-29):

- their streaming session caps at **300 seconds** with a 60-second idle timeout, so a 15-minute
  interview would have to re-open the socket every few minutes;
- the documented response carries **no word timings**, which M6's pace and filler coaching are
  computed from — `words` therefore comes back empty here, honestly, rather than invented;
- transcripts are **post-corrected by a language model unless you turn it off**, which is a confound
  in a benchmark and a hallucination risk in a report that quotes the candidate's exact words. The
  descriptor's `always_send` carries `use_disable_llm_corrections=true` and nothing here omits it.

**And it cannot be given bytes.** The endpoint takes `audio_file_blob` as a **readable URL**, so a
clip has to be reachable from the internet before it can be scored — the only vendor here that needs
somewhere to serve from. Without a URL this adapter refuses, by name, rather than failing obscurely.

One more thing that is not ours to fix: their only formal privacy policy and terms are dated
**January 2020**, before the voice API existed, so `providers.py` records their position as
unresolved. No consented human recording may be sent here until they answer in writing (ADR-0020
§8).
"""

import logging
import time
from collections.abc import Sequence

import httpx2

from readi_worker.speech.base import SttError, TranscriptionResult
from readi_worker.speech.providers import STT_VENDORS

logger = logging.getLogger(__name__)

#: The synchronous endpoint. It caps at 120 seconds of audio; longer clips need their async pair,
#: which the benchmark does not need because a benchmark clip is short by design.
SYNC_UPLOAD_PATH = "/file/v1/upload/sync"
MAX_SYNC_SECONDS = 120


class IntronSpeechToText:
    provider = "intron"

    def __init__(
        self,
        api_key: str,
        *,
        timeout_s: float,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        vendor = STT_VENDORS[self.provider]
        self._base_url = vendor.base_url
        self._always_send = dict(vendor.always_send)
        self._client = httpx2.AsyncClient(timeout=timeout_s, transport=transport)
        self._api_key = api_key

    async def aclose(self) -> None:
        await self._client.aclose()

    async def transcribe(
        self,
        *,
        model: str,
        audio: bytes,
        content_type: str,
        language: str,
        keyterms: Sequence[str] = (),
        audio_url: str | None = None,
        timeout_s: float | None = None,
    ) -> TranscriptionResult:
        """Transcribe the clip at `audio_url`. `audio` is ignored: their API takes a URL, not bytes.

        `model` names the language model to use — for us `en`, their accented-English model — and
        `keyterms` is dropped, because they document no custom-vocabulary feature. Dropping it
        silently would make a benchmark comparison unfair in their favour, so the caller is told
        once.
        """
        start = time.perf_counter()
        if audio_url is None:
            raise self._error("audio_url_required", model, start)
        if keyterms:
            logger.info(
                "intron takes no custom vocabulary: %d glossary terms not sent", len(keyterms)
            )

        body: dict[str, object] = {
            "audio_file_name": audio_url.rsplit("/", 1)[-1],
            "audio_file_blob": audio_url,
            "use_language_asr_input": model,
            **self._always_send,
        }
        try:
            response = await self._client.post(
                f"{self._base_url}{SYNC_UPLOAD_PATH}",
                headers={"authorization": f"Bearer {self._api_key}"},
                json=body,
                timeout=timeout_s,
            )
        except httpx2.HTTPError as exc:
            raise self._error(type(exc).__name__, model, start) from None
        if response.status_code != 200:
            raise self._error(f"HTTP {response.status_code}", model, start)

        payload = response.json()
        latency_ms = self._elapsed_ms(start)
        try:
            assert isinstance(payload, dict)  # noqa: S101 - narrowing an untyped JSON body
            data = payload["data"]
            duration = data.get("processed_audio_duration_in_seconds")
            return TranscriptionResult(
                text=str(data["audio_transcript"]),
                # Empty, and that is the honest answer: their documented response has no word times.
                words=[],
                provider=self.provider,
                model=model,
                audio_seconds=float(duration) if isinstance(duration, int | float) else 0.0,
                latency_ms=latency_ms,
                confidence=None,
            )
        except (AssertionError, KeyError, TypeError, ValueError) as exc:
            raise SttError(
                f"unreadable response ({type(exc).__name__})",
                provider=self.provider,
                model=model,
                latency_ms=latency_ms,
            ) from None

    def _error(self, code: str, model: str, start: float) -> SttError:
        return SttError(
            code, provider=self.provider, model=model, latency_ms=self._elapsed_ms(start)
        )

    @staticmethod
    def _elapsed_ms(start: float) -> int:
        return int((time.perf_counter() - start) * 1_000)
