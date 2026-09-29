"""`SpeechToText` backed by Deepgram's pre-recorded API.

One POST with the audio as the body, one JSON response: httpx2 keeps the adapter readable and lets
the tests drive it through a mock transport, with no key and no network (the `voyage.py` pattern).

**Two things here are not preferences.** `mip_opt_out=true` is on every request, because their model
training is opt-out and their pages do not say whether a self-serve account is enrolled by default —
`_query` builds it from the vendor descriptor and there is no path through this file that omits it.
And word offsets arrive in **seconds**, where AssemblyAI's arrive in milliseconds: the conversion
happens here so that nothing downstream has to remember which vendor produced a transcript.
"""

import logging
import time
from collections.abc import Sequence

import httpx2

from readi_worker.speech.base import SttError, TranscriptionResult, TranscriptWord
from readi_worker.speech.providers import STT_VENDORS

logger = logging.getLogger(__name__)

LISTEN_PATH = "/v1/listen"

#: Retried by us: one request is one clip, and losing it costs the clip rather than a character.
RETRY_STATUSES = frozenset({408, 429, 500, 502, 503, 504})
MAX_ATTEMPTS = 3


class DeepgramSpeechToText:
    provider = "deepgram"

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
        start = time.perf_counter()
        params = self._query(model, language, keyterms)
        last: tuple[str, int] | None = None
        for attempt in range(MAX_ATTEMPTS):
            try:
                response = await self._client.post(
                    f"{self._base_url}{LISTEN_PATH}",
                    params=params,
                    content=audio,
                    headers={
                        "authorization": f"Token {self._api_key}",
                        "content-type": content_type,
                    },
                    timeout=timeout_s,
                )
            except httpx2.HTTPError as exc:
                last = (type(exc).__name__, self._elapsed_ms(start))
                logger.warning("deepgram request failed (%s), attempt %d", last[0], attempt + 1)
                continue
            if response.status_code in RETRY_STATUSES and attempt < MAX_ATTEMPTS - 1:
                last = (f"HTTP {response.status_code}", self._elapsed_ms(start))
                continue
            if response.status_code != 200:
                raise SttError(
                    f"HTTP {response.status_code}",
                    provider=self.provider,
                    model=model,
                    latency_ms=self._elapsed_ms(start),
                )
            return self._read(response.json(), model, self._elapsed_ms(start))
        code, latency = last or ("unknown", self._elapsed_ms(start))
        raise SttError(code, provider=self.provider, model=model, latency_ms=latency)

    def _query(
        self, model: str, language: str, keyterms: Sequence[str]
    ) -> list[tuple[str, str | int | float | bool | None]]:
        """The query string, with the opt-out first so it is visible in any log of the request.

        A list of pairs rather than a dict because `keyterm` is repeated once per term, which is how
        Deepgram takes more than one.
        """
        params: list[tuple[str, str | int | float | bool | None]] = [
            (name, value) for name, value in self._always_send.items()
        ]
        params += [
            ("model", model),
            ("language", language),
            ("punctuate", "true"),
            ("smart_format", "true"),
        ]
        params += [("keyterm", term) for term in keyterms]
        return params

    def _read(self, payload: object, model: str, latency_ms: int) -> TranscriptionResult:
        """Read the one alternative we asked for, failing loudly on a shape we do not recognise."""
        try:
            assert isinstance(payload, dict)  # noqa: S101 - narrowing an untyped JSON body
            channels = payload["results"]["channels"]
            alternative = channels[0]["alternatives"][0]
            duration = float(payload["metadata"]["duration"])
            words = [
                TranscriptWord(
                    text=str(word.get("punctuated_word") or word["word"]),
                    # **Seconds**, not milliseconds. This is the conversion.
                    start_ms=int(float(word["start"]) * 1_000),
                    end_ms=int(float(word["end"]) * 1_000),
                    confidence=_optional_float(word.get("confidence")),
                )
                for word in alternative.get("words", [])
            ]
            return TranscriptionResult(
                text=str(alternative["transcript"]),
                words=words,
                provider=self.provider,
                model=model,
                audio_seconds=duration,
                latency_ms=latency_ms,
                confidence=_optional_float(alternative.get("confidence")),
            )
        except (AssertionError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise SttError(
                f"unreadable response ({type(exc).__name__})",
                provider=self.provider,
                model=model,
                latency_ms=latency_ms,
            ) from None

    @staticmethod
    def _elapsed_ms(start: float) -> int:
        return int((time.perf_counter() - start) * 1_000)


def _optional_float(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) else None
