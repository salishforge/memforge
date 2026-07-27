"""End-to-end parse tests for the typed client methods (issue #161).

``test_types`` proves the dataclasses tolerate the current server. These
prove the client actually routes through that tolerant path — the bug was
not in the dataclasses alone but in ``client.py`` calling ``Cls(**raw)``, so
a fix applied only to ``types.py`` would leave every one of these red.

The transport is stubbed at ``_get``/``_post``: the HTTP layer is httpx's
problem, and the defect under test lives strictly above it. No network, no
event-loop plugin — each test drives the coroutine with ``asyncio.run``.
"""

from __future__ import annotations

import asyncio

import pytest

from memforge import MemForgeClient

import payloads


@pytest.fixture
def client():
    c = MemForgeClient(base_url="http://memforge.test", token="test-token")
    yield c
    asyncio.run(c.close())


def serve(client, payload):
    """Answer every request on this client with ``payload``."""

    async def _get(path, params=None):
        return payload

    async def _post(path, body=None):
        return payload

    client._get = _get
    client._post = _post


def test_query_parses_current_server_row(client):
    """The exact failure in #161: a v3.8+ row raised TypeError inside
    `[QueryResult(**r) for r in raw]`, breaking every non-empty query."""
    serve(client, [payloads.QUERY_RESULT_CURRENT])

    results = asyncio.run(client.query("agent-1", q="preferences"))

    assert len(results) == 1
    assert results[0].epistemic_status == "established"
    assert results[0].context_signals["sentiment"] == "positive"


def test_query_parses_shared_pool_row(client):
    serve(client, [payloads.QUERY_RESULT_POOL_ROW])

    results = asyncio.run(client.query("agent-1", q="deploys"))

    assert results[0].summary is None


def test_query_returns_empty_list_for_empty_response(client):
    serve(client, [])

    assert asyncio.run(client.query("agent-1", q="nothing")) == []


def test_query_ignores_unknown_future_row_key(client):
    serve(client, [{**payloads.QUERY_RESULT_CURRENT, "some_field_from_v9": 1}])

    results = asyncio.run(client.query("agent-1", q="preferences"))

    assert results[0].id == payloads.QUERY_RESULT_CURRENT["id"]


def test_sleep_parses_current_server_result(client):
    serve(client, payloads.SLEEP_RESULT_CURRENT)

    result = asyncio.run(client.sleep("agent-1"))

    assert result.conflicts_resolved == 2
    assert result.principles_extracted == 2


def test_memory_health_parses_current_server_result(client):
    serve(client, payloads.MEMORY_HEALTH_CURRENT)

    result = asyncio.run(client.memory_health("agent-1"))

    assert result.knowledge_gap_count_7d == 6


def test_stats_parses_current_server_result(client):
    serve(client, payloads.AGENT_STATS_CURRENT)

    result = asyncio.run(client.stats("agent-1"))

    assert result.stale_embedding_count == 45


def test_add_surfaces_deduplicated_flag(client):
    """The old hand-rolled key filter in add() dropped `deduplicated`, so
    callers could not tell a real write from a collapsed duplicate."""
    serve(client, payloads.ADD_RESULT_CURRENT)

    result = asyncio.run(client.add("agent-1", "User prefers dark mode"))

    assert result.deduplicated is True


def test_resume_parses_current_server_result(client):
    serve(client, payloads.RESUME_CONTEXT_CURRENT)

    result = asyncio.run(client.resume("agent-1"))

    assert result.time_since_last_activity_ms == 3_600_000


def test_reflect_parses_current_server_result(client):
    serve(client, payloads.REFLECTION_RESULT_CURRENT)

    result = asyncio.run(client.reflect("agent-1"))

    assert result.insights_count == 4


def test_consolidate_parses_current_server_result(client):
    serve(client, payloads.CONSOLIDATE_RESULT_CURRENT)

    result = asyncio.run(client.consolidate("agent-1"))

    assert result.warm_rows_created == 12


def test_clear_parses_current_server_result(client):
    serve(client, payloads.CLEAR_RESULT_CURRENT)

    result = asyncio.run(client.clear("agent-1"))

    assert result.hot_archived == 140


def test_feedback_parses_current_server_result(client):
    serve(client, payloads.FEEDBACK_RESULT_CURRENT)

    result = asyncio.run(client.feedback("agent-1", [1, 2, 3], "positive"))

    assert result.updated == 3
