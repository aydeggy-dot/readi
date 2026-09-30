"""The worker's side of the three internal routes (ADR-0019 §3).

This is the **second direction of authentication** in the system, and the first time the worker
calls the API rather than the other way round. It carries the same shared `SERVICE_TOKEN` and the
routes it reaches are internal, not candidate-facing:
`/api/internal/interviews/:id/{voice-session,turns,voice-ended}`. The API's half is M5 phase 4; this
is written against the contracts, driven in tests through a mock transport, and until phase 4 lands
it is what tells us the contracts are usable from here.

**Two rules about logging, because this module handles a whole transcript.** Nothing here logs a
turn, a transcript or a body: ids, status codes and exception *types* only (CLAUDE.md §5). And an
error body is never echoed, because the API's validation errors quote the field values they
rejected.

**A push is retried and a duplicate is not an error.** The turns are idempotent by
`(session_id, seq)` and `exchange_id` covers the ai-call and latency rows that have no natural key,
so a retry is safe by construction; `duplicate: true` is the expected answer to one and the agent
carries on. What a lost push costs is nothing permanent: the API's stored snapshot is the authority,
so the next leg resumes from the last exchange that did land and the engine replays from there
(ADR-0016 §4).
"""

import asyncio
import logging
import uuid

import httpx2

from readi_worker.contracts import (
    InterviewTurnPush,
    InterviewTurnPushResponse,
    VoiceLegEndedRequest,
    VoiceLegEndedResponse,
    VoiceSessionStartResponse,
)

logger = logging.getLogger(__name__)

#: Worth trying again: a timeout, a rate limit, or an API instance going away mid-deploy.
RETRY_STATUSES = frozenset({408, 429, 500, 502, 503, 504})
MAX_ATTEMPTS = 4
#: Between attempts. Short, because a push that arrives after the session has been swept up is of
#: no use to anybody, and long enough to outlast a rolling restart of one API instance.
RETRY_DELAY_S = 0.5


class VoiceApiError(Exception):
    """The API could not be reached, or refused. Carries no body: see the note above."""

    def __init__(self, code: str, *, status: int | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


class VoiceApiClient:
    """`SessionSource`, `TurnPusher` and `LegReporter` against the real API."""

    def __init__(
        self,
        base_url: str,
        service_token: str,
        *,
        timeout_s: float = 10.0,
        transport: httpx2.AsyncBaseTransport | None = None,
        sleep: float = RETRY_DELAY_S,
    ) -> None:
        # `transport` is for tests (a mock transport); production uses httpx2's default.
        self._client = httpx2.AsyncClient(timeout=timeout_s, transport=transport)
        self._base = base_url.rstrip("/")
        self._token = service_token
        self._sleep = sleep

    async def aclose(self) -> None:
        await self._client.aclose()

    async def voice_session(self, session_id: str) -> VoiceSessionStartResponse:
        """Everything needed to run this leg — the bundle included, which is why it is pulled."""
        payload = await self._request("GET", self._url(session_id, "voice-session"), None)
        return VoiceSessionStartResponse.model_validate(payload)

    async def push(self, session_id: str, push: InterviewTurnPush) -> InterviewTurnPushResponse:
        """One completed exchange. The session id travels in the path, never in the body."""
        payload = await self._request(
            "POST", self._url(session_id, "turns"), push.model_dump(mode="json")
        )
        answer = InterviewTurnPushResponse.model_validate(payload)
        if answer.duplicate:
            logger.info("interview %s exchange %s already applied", session_id, push.exchange_id)
        return answer

    async def leg_ended(
        self, session_id: str, request: VoiceLegEndedRequest
    ) -> VoiceLegEndedResponse:
        """The leg is over, and this is what meters its minutes."""
        payload = await self._request(
            "POST", self._url(session_id, "voice-ended"), request.model_dump(mode="json")
        )
        return VoiceLegEndedResponse.model_validate(payload)

    def _url(self, session_id: str, route: str) -> str:
        return f"{self._base}/api/internal/interviews/{session_id}/{route}"

    async def _request(self, method: str, url: str, body: object | None) -> object:
        last: VoiceApiError | None = None
        for attempt in range(MAX_ATTEMPTS):
            try:
                response = await self._client.request(
                    method,
                    url,
                    json=body,
                    headers={"authorization": f"Bearer {self._token}"},
                )
            except httpx2.HTTPError as exc:
                last = VoiceApiError(type(exc).__name__)
            else:
                if response.status_code < 300:
                    return response.json()
                # Status only: a validation error body quotes what it rejected, which here is a
                # whole exchange of a candidate's words.
                last = VoiceApiError(f"http_{response.status_code}", status=response.status_code)
                if response.status_code not in RETRY_STATUSES:
                    break
            if attempt + 1 < MAX_ATTEMPTS:
                logger.warning("api %s attempt %d failed: %s", method, attempt + 1, last.code)
                await asyncio.sleep(self._sleep)
        raise last or VoiceApiError("unknown")


def new_exchange_id() -> str:
    """A fresh idempotency key for one exchange. Stable across retries of the same push."""
    return str(uuid.uuid4())
