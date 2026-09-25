"""The engine's cache: what it holds, and what happens when Redis is not there.

The first half runs against a real Redis (infra/docker-compose.yml locally, a service container in
CI), because the thing worth proving is that a bundle survives a round trip through JSON and comes
back as the same pinned questions. The second half is about failure, which a real Redis will not do
on request.
"""

import json
from collections.abc import AsyncIterator

import pytest
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError

from readi_worker.interview import machine
from readi_worker.interview.state_store import InterviewStateStore
from readi_worker.settings import Settings
from tests.conftest import FakeRedis
from tests.interview_fixtures import SESSION_ID, bundle, question


@pytest.fixture
async def real_redis(settings: Settings) -> AsyncIterator[Redis]:
    client: Redis = Redis.from_url(str(settings.redis_url))
    try:
        yield client
    finally:
        await client.delete(f"interview:{SESSION_ID}")
        await client.aclose()


async def test_a_bundle_and_its_state_survive_a_round_trip(real_redis: Redis) -> None:
    store = InterviewStateStore(real_redis, 60)
    deck = bundle(questions=[question(0), question(1, context="const x = 1;")])
    state = machine.start(machine.begin(deck))
    state, _ = machine.plan(state, deck, deck.ends_at)

    assert await store.load(SESSION_ID) is None, "nothing cached yet"
    await store.save(SESSION_ID, deck, machine.to_snapshot(state))

    cached = await store.load(SESSION_ID)
    assert cached is not None, "Redis unreachable: start infra/docker-compose.yml or set REDIS_URL"
    assert cached.bundle == deck, "the pinned questions come back exactly as they went in"
    assert cached.snapshot == machine.to_snapshot(state)
    assert machine.from_snapshot(cached.snapshot, cached.bundle).progress == state.progress

    await store.clear(SESSION_ID)
    assert await store.load(SESSION_ID) is None


async def test_the_key_is_namespaced_by_session(real_redis: Redis) -> None:
    store = InterviewStateStore(real_redis, 60)
    await store.save(SESSION_ID, bundle(), machine.to_snapshot(machine.begin(bundle())))
    assert await real_redis.exists(f"interview:{SESSION_ID}") == 1
    await store.clear(SESSION_ID)


# ---- When Redis is not there.


async def test_an_unreachable_redis_reads_as_a_miss() -> None:
    store = InterviewStateStore(FakeRedis(error=RedisConnectionError("down")), 60)
    assert await store.load(SESSION_ID) is None


async def test_an_unreachable_redis_does_not_fail_the_exchange() -> None:
    store = InterviewStateStore(FakeRedis(error=RedisConnectionError("down")), 60)
    await store.save(SESSION_ID, bundle(), machine.to_snapshot(machine.begin(bundle())))
    await store.clear(SESSION_ID)  # neither raises: the snapshot in the request is the authority


async def test_state_written_by_another_engine_reads_as_a_miss() -> None:
    redis = FakeRedis()
    redis.values[f"interview:{SESSION_ID}"] = json.dumps({"bundle": {}, "state": {"version": 99}})
    assert await InterviewStateStore(redis, 60).load(SESSION_ID) is None


async def test_unparseable_state_reads_as_a_miss() -> None:
    redis = FakeRedis()
    redis.values[f"interview:{SESSION_ID}"] = "not json at all"
    assert await InterviewStateStore(redis, 60).load(SESSION_ID) is None
