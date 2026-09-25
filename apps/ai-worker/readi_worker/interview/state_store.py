"""The engine's live state in Redis (CLAUDE.md §5: "Ephemeral engine state lives in Redis").

What is cached here is the **bundle**, and that is the point. The snapshot in the request is the
authority — it is what the API has actually persisted, so replaying an exchange whose response never
reached the database is right and skipping ahead would leave a hole in the transcript. Redis exists
so the API does not have to resend four to eight pinned questions on every turn, and so that M5's
LiveKit agent, which drives turns itself with no API request to carry state, has somewhere to read
from.

A Redis failure is therefore a cache miss and never an error: the worker answers `bundle_required`,
the API sends the bundle again, and the session continues one round trip poorer.
"""

import inspect
import json
import logging
from dataclasses import dataclass
from typing import Protocol

from pydantic import ValidationError
from redis.exceptions import RedisError

from readi_worker.contracts import InterviewEngineSnapshot, InterviewSessionBundle

logger = logging.getLogger(__name__)

#: A session runs at most 30 minutes and may be resumed within a 30-minute grace period
#: (`INTERVIEW_LIMITS.resumeGraceMinutes`); two hours leaves room for both and for a slow candidate.
DEFAULT_TTL_S = 7_200


class SupportsCache(Protocol):
    """The three commands the engine needs.

    Declared synchronously and awaited by `_resolved`, exactly as `SupportsPing` is: redis-py's
    async client declares these as plain methods returning `ResponseT`, so an `async def` protocol
    does not match it and every caller would need a cast.
    """

    def get(self, name: str) -> object: ...
    def set(self, name: str, value: str, ex: int) -> object: ...
    def delete(self, *names: str) -> object: ...


async def _resolved(result: object) -> object:
    return await result if inspect.isawaitable(result) else result


@dataclass(frozen=True, slots=True)
class CachedSession:
    bundle: InterviewSessionBundle
    snapshot: InterviewEngineSnapshot


class InterviewStateStore:
    def __init__(self, redis: SupportsCache, ttl_s: int = DEFAULT_TTL_S) -> None:
        self._redis = redis
        self._ttl_s = ttl_s

    async def load(self, session_id: str) -> CachedSession | None:
        try:
            raw = await _resolved(self._redis.get(_key(session_id)))
        except (RedisError, OSError) as exc:
            # Ids and outcomes only: the bundle holds question text.
            logger.warning("interview state unreadable: %s", type(exc).__name__)
            return None
        if raw is None:
            return None
        try:
            payload = json.loads(raw)  # type: ignore[arg-type]  # bytes or str from redis
            return CachedSession(
                bundle=InterviewSessionBundle.model_validate(payload["bundle"]),
                snapshot=InterviewEngineSnapshot.model_validate(payload["state"]),
            )
        except (ValidationError, ValueError, KeyError, TypeError):
            # Written by an engine that meant something else by it. A miss is the safe reading.
            logger.warning("interview state in redis does not parse; treating it as absent")
            return None

    async def save(
        self,
        session_id: str,
        bundle: InterviewSessionBundle,
        snapshot: InterviewEngineSnapshot,
    ) -> None:
        payload = json.dumps(
            {
                "bundle": bundle.model_dump(mode="json"),
                "state": snapshot.model_dump(mode="json"),
            }
        )
        try:
            await _resolved(self._redis.set(_key(session_id), payload, ex=self._ttl_s))
        except (RedisError, OSError) as exc:
            logger.warning("interview state not cached: %s", type(exc).__name__)

    async def clear(self, session_id: str) -> None:
        try:
            await _resolved(self._redis.delete(_key(session_id)))
        except (RedisError, OSError) as exc:
            logger.warning("interview state not cleared: %s", type(exc).__name__)


def _key(session_id: str) -> str:
    return f"interview:{session_id}"
