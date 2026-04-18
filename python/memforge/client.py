"""MemForge Python SDK — async HTTP client.

Mirrors the TypeScript MemForgeClient with 18 methods covering all API endpoints.

Usage:
    from memforge import MemForgeClient

    client = MemForgeClient(base_url="http://localhost:3333", token="...")
    result = await client.add("agent-1", "User prefers dark mode")
    results = await client.query("agent-1", q="preferences", mode="hybrid")
"""

from __future__ import annotations

import os
from typing import Any, Optional

import httpx

from .types import (
    AddResult, QueryResult, ConsolidateResult, ClearResult, AgentStats,
    MemoryHealth, ResumeContext, FeedbackResult, SleepCycleResult,
    ReflectionResult, MemoryHints,
)


class MemForgeError(Exception):
    """Raised when the MemForge API returns an error response."""

    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


class MemForgeClient:
    """Async HTTP client for the MemForge memory API.

    All methods are async and require an ``await``.
    For synchronous usage, wrap calls with ``asyncio.run()``.
    """

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        timeout: float = 60.0,
    ):
        self.base_url = (base_url or os.environ.get("MEMFORGE_URL", "http://localhost:3333")).rstrip("/")
        self.token = token or os.environ.get("MEMFORGE_TOKEN")
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        self._client = httpx.AsyncClient(base_url=self.base_url, headers=headers, timeout=timeout)

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "MemForgeClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = await self._client.get(path, params={k: v for k, v in (params or {}).items() if v is not None})
        data = resp.json()
        if not data.get("ok"):
            raise MemForgeError(data.get("error", "Unknown error"), resp.status_code)
        return data.get("data")

    async def _post(self, path: str, body: dict[str, Any] | None = None) -> Any:
        resp = await self._client.post(path, json=body or {})
        data = resp.json()
        if not data.get("ok"):
            raise MemForgeError(data.get("error", "Unknown error"), resp.status_code)
        return data.get("data")

    # ── Memory Operations ────────────────────────────────────────────────

    async def add(
        self,
        agent_id: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        outcome_type: str = "neutral",
        hints: MemoryHints | None = None,
        namespace: str | None = None,
    ) -> AddResult:
        """Store a memory event in the hot tier."""
        body: dict[str, Any] = {"content": content}
        if metadata:
            body["metadata"] = metadata
        if outcome_type != "neutral":
            body["outcome_type"] = outcome_type
        if hints:
            body["hints"] = {k: v for k, v in hints.__dict__.items() if v is not None}
        if namespace:
            body["namespace"] = namespace
        raw = await self._post(f"/memory/{agent_id}/add", body)
        return AddResult(**{k: raw[k] for k in ("id", "agent_id", "created_at") if k in raw})

    async def query(
        self,
        agent_id: str,
        *,
        q: str,
        limit: int = 10,
        mode: str | None = None,
        after: str | None = None,
        before: str | None = None,
        decay: float | None = None,
        max_tokens: int | None = None,
        namespace: str | None = None,
    ) -> list[QueryResult]:
        """Search warm-tier memory."""
        params: dict[str, Any] = {"q": q, "limit": limit}
        if mode:
            params["mode"] = mode
        if after:
            params["after"] = after
        if before:
            params["before"] = before
        if decay is not None:
            params["decay"] = decay
        if max_tokens is not None:
            params["max_tokens"] = max_tokens
        if namespace:
            params["namespace"] = namespace
        raw = await self._get(f"/memory/{agent_id}/query", params)
        return [QueryResult(**r) for r in raw] if isinstance(raw, list) else []

    async def timeline(
        self,
        agent_id: str,
        *,
        from_date: str | None = None,
        to_date: str | None = None,
        limit: int = 50,
        namespace: str | None = None,
    ) -> list[dict[str, Any]]:
        """Retrieve memories in chronological order."""
        params: dict[str, Any] = {"limit": limit}
        if from_date:
            params["from"] = from_date
        if to_date:
            params["to"] = to_date
        if namespace:
            params["namespace"] = namespace
        return await self._get(f"/memory/{agent_id}/timeline", params)

    async def consolidate(self, agent_id: str, mode: str | None = None, namespace: str | None = None) -> ConsolidateResult:
        """Trigger hot→warm consolidation."""
        body: dict[str, Any] = {}
        if mode:
            body["mode"] = mode
        if namespace:
            body["namespace"] = namespace
        raw = await self._post(f"/memory/{agent_id}/consolidate", body)
        return ConsolidateResult(**raw)

    async def clear(self, agent_id: str) -> ClearResult:
        """Archive all hot+warm memory to cold tier."""
        raw = await self._post(f"/memory/{agent_id}/clear")
        return ClearResult(**raw)

    async def stats(self, agent_id: str, namespace: str | None = None) -> AgentStats:
        """Get memory tier statistics."""
        params: dict[str, Any] = {}
        if namespace:
            params["namespace"] = namespace
        raw = await self._get(f"/memory/{agent_id}/stats", params or None)
        return AgentStats(**raw)

    # ── Knowledge Graph ──────────────────────────────────────────────────

    async def search_entities(
        self, agent_id: str, *, q: str | None = None, type: str | None = None, limit: int = 20
    ) -> list[dict[str, Any]]:
        """Search knowledge graph entities."""
        params: dict[str, Any] = {"limit": limit}
        if q:
            params["q"] = q
        if type:
            params["type"] = type
        return await self._get(f"/memory/{agent_id}/entities", params)

    async def graph_traverse(self, agent_id: str, entity: str, depth: int = 2) -> dict[str, Any]:
        """Traverse knowledge graph from an entity."""
        return await self._get(f"/memory/{agent_id}/graph", {"entity": entity, "depth": depth})

    # ── Reflection & Learning ────────────────────────────────────────────

    async def reflect(
        self, agent_id: str, *, trigger: str = "manual", limit: int = 20
    ) -> ReflectionResult:
        """Trigger LLM reflection on recent memories."""
        raw = await self._post(f"/memory/{agent_id}/reflect", {"trigger": trigger, "limit": limit})
        return ReflectionResult(**raw)

    async def get_reflections(self, agent_id: str, limit: int = 10) -> list[dict[str, Any]]:
        """Retrieve stored reflections."""
        return await self._get(f"/memory/{agent_id}/reflections", {"limit": limit})

    async def meta_reflect(self, agent_id: str, limit: int = 10) -> dict[str, Any]:
        """Trigger second-order meta-reflection."""
        return await self._post(f"/memory/{agent_id}/meta-reflect", {"limit": limit})

    async def get_procedures(
        self, agent_id: str, *, q: str | None = None, limit: int = 20
    ) -> list[dict[str, Any]]:
        """Retrieve learned condition→action rules."""
        params: dict[str, Any] = {"limit": limit}
        if q:
            params["q"] = q
        return await self._get(f"/memory/{agent_id}/procedures", params)

    # ── Sleep & Maintenance ──────────────────────────────────────────────

    async def sleep(
        self,
        agent_id: str,
        *,
        token_budget: int | None = None,
        eviction_threshold: float | None = None,
        revision_threshold: float | None = None,
        include_reflection: bool | None = None,
    ) -> SleepCycleResult:
        """Run a full sleep cycle. Agent-wide: processes all namespaces."""
        body: dict[str, Any] = {}
        if token_budget is not None:
            body["tokenBudget"] = token_budget
        if eviction_threshold is not None:
            body["evictionThreshold"] = eviction_threshold
        if revision_threshold is not None:
            body["revisionThreshold"] = revision_threshold
        if include_reflection is not None:
            body["includeReflection"] = include_reflection
        raw = await self._post(f"/memory/{agent_id}/sleep", body)
        return SleepCycleResult(**raw)

    async def memory_health(self, agent_id: str) -> MemoryHealth:
        """Get memory health metrics."""
        raw = await self._get(f"/memory/{agent_id}/health")
        return MemoryHealth(**raw)

    async def resume(self, agent_id: str, limit: int = 5, namespace: str | None = None) -> ResumeContext:
        """Get session resumption context bundle."""
        params: dict[str, Any] = {"limit": limit}
        if namespace:
            params["namespace"] = namespace
        raw = await self._get(f"/memory/{agent_id}/resume", params)
        return ResumeContext(**raw)

    # ── Feedback ─────────────────────────────────────────────────────────

    async def feedback(
        self,
        agent_id: str,
        retrieval_ids: list[int],
        outcome: str,
        metadata: dict[str, Any] | None = None,
    ) -> FeedbackResult:
        """Record retrieval outcome feedback."""
        body: dict[str, Any] = {"retrieval_ids": retrieval_ids, "outcome": outcome}
        if metadata:
            body["metadata"] = metadata
        raw = await self._post(f"/memory/{agent_id}/feedback", body)
        return FeedbackResult(**raw)

    async def active_recall(self, agent_id: str, context: str, limit: int = 5) -> dict[str, Any]:
        """Proactively surface relevant memories for a context."""
        return await self._post(f"/memory/{agent_id}/active-recall", {"context": context, "limit": limit})

    async def deduplicate_entities(self, agent_id: str, threshold: float = 0.7) -> dict[str, Any]:
        """Merge duplicate entities in the knowledge graph."""
        return await self._post(f"/memory/{agent_id}/dedup-entities", {"threshold": threshold})

    # ── Cold Tier ─────────────────────────────────────────────────────────

    async def search_cold_tier(
        self,
        agent_id: str,
        *,
        q: str | None = None,
        namespace: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        source_table: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Search archived cold tier memories. Use for audit, recovery, and compliance."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if q:
            params["q"] = q
        if namespace:
            params["namespace"] = namespace
        if from_date:
            params["from"] = from_date
        if to_date:
            params["to"] = to_date
        if source_table:
            params["source_table"] = source_table
        return await self._get(f"/memory/{agent_id}/cold", params)

    async def restore_cold_tier(
        self,
        agent_id: str,
        cold_id: int | str,
        *,
        namespace: str | None = None,
    ) -> dict[str, Any]:
        """Restore a cold tier row to warm tier. Non-destructive — cold row is preserved."""
        body: dict[str, Any] = {"cold_id": str(cold_id)}
        if namespace:
            body["namespace"] = namespace
        return await self._post(f"/memory/{agent_id}/restore", body)

    # ── Shared Pools (Phase 3) ─────────────────────────────────────────────

    async def create_pool(self, pool_id: str, name: str, pool_type: str = "team", description: str | None = None) -> dict[str, Any]:
        """Create a shared memory pool."""
        return await self._post("/pool", {"id": pool_id, "name": name, "pool_type": pool_type, "description": description})

    async def join_pool(self, agent_id: str, pool_id: str) -> dict[str, Any]:
        """Join a shared memory pool."""
        return await self._post(f"/pool/{pool_id}/join", {"agent_id": agent_id})

    async def leave_pool(self, agent_id: str, pool_id: str) -> dict[str, Any]:
        """Leave a shared memory pool."""
        resp = await self._client.request("DELETE", f"/pool/{pool_id}/leave", json={"agent_id": agent_id})
        data = resp.json()
        if not data.get("ok"):
            raise MemForgeError(data.get("error", "Unknown error"), resp.status_code)
        return data.get("data")

    async def get_pool_members(self, pool_id: str) -> list[dict[str, Any]]:
        """List members of a shared pool."""
        return await self._get(f"/pool/{pool_id}/members")

    async def publish(self, agent_id: str, pool_id: str, memory_ids: list[int]) -> dict[str, Any]:
        """Publish private memories to a shared pool."""
        return await self._post(f"/pool/{pool_id}/publish", {"agent_id": agent_id, "memory_ids": memory_ids})

    async def get_reputation(self, pool_id: str, agent_id: str, domain: str | None = None) -> dict[str, Any]:
        """Get agent reputation in a pool."""
        params = {"domain": domain} if domain else {}
        return await self._get(f"/pool/{pool_id}/reputation/{agent_id}", params)

    async def pool_sleep(self, pool_id: str) -> dict[str, Any]:
        """Run shared pool maintenance cycle."""
        return await self._post(f"/pool/{pool_id}/sleep")

    # ── System ───────────────────────────────────────────────────────────

    async def health(self) -> dict[str, Any]:
        """Check server health."""
        resp = await self._client.get("/health")
        return resp.json()
