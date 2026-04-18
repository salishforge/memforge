"""MemForge Python SDK — resilient client with graceful degradation.

Wraps MemForgeClient so that all methods return safe defaults on failure
instead of throwing. Recommended for production use.

Usage:
    from memforge import ResilientMemForgeClient

    client = ResilientMemForgeClient(on_error=lambda e: logger.warning(str(e)))
    results = await client.query("agent-1", q="test")  # returns [] on failure
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Optional

from .client import MemForgeClient, MemoryHints
from .types import (
    AddResult, QueryResult, ConsolidateResult, ClearResult, AgentStats,
    MemoryHealth, ResumeContext, FeedbackResult, SleepCycleResult,
    ReflectionResult,
)

logger = logging.getLogger("memforge")


class ResilientMemForgeClient:
    """Wraps MemForgeClient with try/except on every method.

    On failure, returns safe defaults (empty lists, None, zeroed stats)
    and optionally calls an ``on_error`` callback.
    """

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        timeout: float = 60.0,
        on_error: Callable[[Exception], None] | None = None,
    ):
        self._client = MemForgeClient(base_url=base_url, token=token, timeout=timeout)
        self._on_error = on_error or (lambda e: logger.debug("memforge error: %s", e))

    async def close(self) -> None:
        await self._client.close()

    async def __aenter__(self) -> "ResilientMemForgeClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    def _handle(self, err: Exception) -> None:
        self._on_error(err)

    async def add(self, agent_id: str, content: str, **kwargs: Any) -> AddResult | None:
        try:
            return await self._client.add(agent_id, content, **kwargs)
        except Exception as e:
            self._handle(e)
            return None

    async def query(self, agent_id: str, **kwargs: Any) -> list[QueryResult]:
        try:
            return await self._client.query(agent_id, **kwargs)
        except Exception as e:
            self._handle(e)
            return []

    async def timeline(self, agent_id: str, **kwargs: Any) -> list[dict[str, Any]]:
        try:
            return await self._client.timeline(agent_id, **kwargs)
        except Exception as e:
            self._handle(e)
            return []

    async def consolidate(self, agent_id: str, mode: str | None = None, namespace: str | None = None) -> ConsolidateResult | None:
        try:
            return await self._client.consolidate(agent_id, mode, namespace)
        except Exception as e:
            self._handle(e)
            return None

    async def clear(self, agent_id: str) -> ClearResult | None:
        try:
            return await self._client.clear(agent_id)
        except Exception as e:
            self._handle(e)
            return None

    async def stats(self, agent_id: str, namespace: str | None = None) -> AgentStats | None:
        try:
            return await self._client.stats(agent_id, namespace)
        except Exception as e:
            self._handle(e)
            return None

    async def search_entities(self, agent_id: str, **kwargs: Any) -> list[dict[str, Any]]:
        try:
            return await self._client.search_entities(agent_id, **kwargs)
        except Exception as e:
            self._handle(e)
            return []

    async def graph_traverse(self, agent_id: str, entity: str, depth: int = 2) -> dict[str, Any] | None:
        try:
            return await self._client.graph_traverse(agent_id, entity, depth)
        except Exception as e:
            self._handle(e)
            return None

    async def reflect(self, agent_id: str, **kwargs: Any) -> ReflectionResult | None:
        try:
            return await self._client.reflect(agent_id, **kwargs)
        except Exception as e:
            self._handle(e)
            return None

    async def get_reflections(self, agent_id: str, limit: int = 10) -> list[dict[str, Any]]:
        try:
            return await self._client.get_reflections(agent_id, limit)
        except Exception as e:
            self._handle(e)
            return []

    async def get_procedures(self, agent_id: str, **kwargs: Any) -> list[dict[str, Any]]:
        try:
            return await self._client.get_procedures(agent_id, **kwargs)
        except Exception as e:
            self._handle(e)
            return []

    async def sleep(self, agent_id: str, **kwargs: Any) -> SleepCycleResult | None:
        try:
            return await self._client.sleep(agent_id, **kwargs)
        except Exception as e:
            self._handle(e)
            return None

    async def memory_health(self, agent_id: str) -> MemoryHealth | None:
        try:
            return await self._client.memory_health(agent_id)
        except Exception as e:
            self._handle(e)
            return None

    async def resume(self, agent_id: str, limit: int = 5, namespace: str | None = None) -> ResumeContext | None:
        try:
            return await self._client.resume(agent_id, limit, namespace)
        except Exception as e:
            self._handle(e)
            return None

    async def feedback(self, agent_id: str, retrieval_ids: list[int], outcome: str, **kwargs: Any) -> FeedbackResult | None:
        try:
            return await self._client.feedback(agent_id, retrieval_ids, outcome, **kwargs)
        except Exception as e:
            self._handle(e)
            return None

    async def active_recall(self, agent_id: str, context: str, limit: int = 5) -> dict[str, Any] | None:
        try:
            return await self._client.active_recall(agent_id, context, limit)
        except Exception as e:
            self._handle(e)
            return None

    async def health(self) -> dict[str, Any] | None:
        try:
            return await self._client.health()
        except Exception as e:
            self._handle(e)
            return None
