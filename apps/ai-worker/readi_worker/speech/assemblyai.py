"""`SpeechToText` backed by AssemblyAI's pre-recorded API.

Three steps rather than Deepgram's one: upload the bytes, submit the transcript job, poll until it
is done. The polling is the reason this adapter is longer than the last, and it is bounded — a
benchmark run that hangs on one clip is a run nobody finishes.

**The base URL is the privacy mechanism, not a latency preference.** Their EU region is the one
configuration in which they say they do not train on submitted files (`providers.py` quotes it), so
it comes from the vendor descriptor and not from an argument a caller can override. Changing that
line changes what we have promised a candidate.

**Word offsets arrive in milliseconds**, where Deepgram's arrive in seconds. Both adapters normalise
to milliseconds here, so nothing downstream has to know which vendor produced a transcript.
"""

import asyncio
import logging
import time
from collections.abc import Sequence

import httpx2

from readi_worker.speech.base import SttError, TranscriptionResult, TranscriptWord
from readi_worker.speech.providers import STT_VENDORS

logger = logging.getLogger(__name__)

UPLOAD_PATH = "/v2/upload"
TRANSCRIPT_PATH = "/v2/transcript"

#: How often to ask whether a transcript is done, and for how long. A minute of audio takes seconds
#: to transcribe; a ceiling of five minutes means a stuck job fails the clip rather than the run.
POLL_INTERVAL_S = 2.0
POLL_CEILING_S = 300.0


class AssemblyAiSpeechToText:
    provider = "assemblyai"

    def __init__(
        self,
        api_key: str,
        *,
        timeout_s: float,
        transport: httpx2.AsyncBaseTransport | None = None,
        poll_interval_s: float = POLL_INTERVAL_S,
    ) -> None:
        vendor = STT_VENDORS[self.provider]
        self._base_url = vendor.base_url
        self._client = httpx2.AsyncClient(timeout=timeout_s, transport=transport)
        # Their header takes the key bare: no `Bearer` prefix, unlike every other vendor here.
        self._headers = {"authorization": api_key}
        self._poll_interval_s = poll_interval_s

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
        start = time.perf_counter()
        upload_url = await self._upload(audio, model, start, timeout_s)
        job_id = await self._submit(upload_url, model, language, keyterms, start, timeout_s)
        payload = await self._await_completion(job_id, model, start, timeout_s)
        return self._read(payload, model, self._elapsed_ms(start))

    async def _upload(self, audio: bytes, model: str, start: float, timeout_s: float | None) -> str:
        response = await self._post(UPLOAD_PATH, model, start, content=audio, timeout_s=timeout_s)
        url = response.get("upload_url")
        if not isinstance(url, str):
            raise self._error("upload returned no url", model, start)
        return url

    async def _submit(
        self,
        upload_url: str,
        model: str,
        language: str,
        keyterms: Sequence[str],
        start: float,
        timeout_s: float | None,
    ) -> str:
        body: dict[str, object] = {
            "audio_url": upload_url,
            "speech_model": model,
            "language_code": language,
            "punctuate": True,
            "format_text": True,
        }
        if keyterms:
            body["keyterms_prompt"] = list(keyterms)
        response = await self._post(TRANSCRIPT_PATH, model, start, json=body, timeout_s=timeout_s)
        job_id = response.get("id")
        if not isinstance(job_id, str):
            raise self._error("submit returned no id", model, start)
        return job_id

    async def _await_completion(
        self, job_id: str, model: str, start: float, timeout_s: float | None
    ) -> dict[str, object]:
        deadline = time.perf_counter() + POLL_CEILING_S
        while True:
            response = await self._client.get(
                f"{self._base_url}{TRANSCRIPT_PATH}/{job_id}",
                headers=self._headers,
                timeout=timeout_s,
            )
            if response.status_code != 200:
                raise self._error(f"HTTP {response.status_code}", model, start)
            payload = response.json()
            if not isinstance(payload, dict):
                raise self._error("unreadable response", model, start)
            status = payload.get("status")
            if status == "completed":
                return payload
            if status == "error":
                # Their own message, truncated: it says which clip and why, and it is not candidate
                # content — it is a description of a job.
                raise self._error(
                    f"transcript error: {str(payload.get('error'))[:40]}", model, start
                )
            if time.perf_counter() > deadline:
                raise self._error("transcript did not finish", model, start)
            await asyncio.sleep(self._poll_interval_s)

    async def _post(
        self,
        path: str,
        model: str,
        start: float,
        *,
        content: bytes | None = None,
        json: dict[str, object] | None = None,
        timeout_s: float | None = None,
    ) -> dict[str, object]:
        try:
            response = await self._client.post(
                f"{self._base_url}{path}",
                headers=self._headers,
                content=content,
                json=json,
                timeout=timeout_s,
            )
        except httpx2.HTTPError as exc:
            raise self._error(type(exc).__name__, model, start) from None
        if response.status_code not in (200, 201):
            raise self._error(f"HTTP {response.status_code}", model, start)
        payload = response.json()
        if not isinstance(payload, dict):
            raise self._error("unreadable response", model, start)
        return payload

    def _read(self, payload: dict[str, object], model: str, latency_ms: int) -> TranscriptionResult:
        try:
            raw_words = payload.get("words") or []
            assert isinstance(raw_words, list)  # noqa: S101 - narrowing an untyped JSON body
            words = [
                TranscriptWord(
                    text=str(word["text"]),
                    # **Already milliseconds.** No conversion, which is the whole reason the unit is
                    # recorded per vendor rather than assumed.
                    start_ms=int(word["start"]),
                    end_ms=int(word["end"]),
                    confidence=_optional_float(word.get("confidence")),
                )
                for word in raw_words
            ]
            duration = payload.get("audio_duration")
            return TranscriptionResult(
                text=str(payload.get("text") or ""),
                words=words,
                provider=self.provider,
                model=model,
                audio_seconds=float(duration) if isinstance(duration, int | float) else 0.0,
                latency_ms=latency_ms,
                confidence=_optional_float(payload.get("confidence")),
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


def _optional_float(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) else None
