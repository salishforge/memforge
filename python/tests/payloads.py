"""Server response fixtures for the SDK parsing tests.

Two payloads exist per dataclass and both matter:

``CURRENT`` mirrors what a v3.12 server actually puts on the wire, copied
from the SELECT lists and result literals in ``src/memory-manager.ts`` and
``src/sleep-cycle.ts``. It is the payload that broke the SDK in issue #161,
so it is the payload the tests must parse.

``LEGACY`` is the same response as an older server sent it, with every
later-added key removed. It proves the field defaults are reachable, which
is what lets one SDK version talk to servers on either side of it.
"""

from __future__ import annotations

from typing import Any

# ── AddResult — POST /memory/:id/add ─────────────────────────────────────────

ADD_RESULT_CURRENT: dict[str, Any] = {
    "id": 90211,
    "agent_id": "agent-1",
    "created_at": "2026-07-20T18:04:11.223Z",
    "deduplicated": True,
}

ADD_RESULT_LEGACY: dict[str, Any] = {
    "id": 90211,
    "agent_id": "agent-1",
    "created_at": "2026-07-20T18:04:11.223Z",
}

# ── QueryResult — GET /memory/:id/query ──────────────────────────────────────

QUERY_RESULT_CURRENT: dict[str, Any] = {
    "id": 4211,
    "content": "User prefers dark mode in the terminal and dislikes light themes.",
    "summary": "Dark mode preference",
    "metadata": {"source": "chat", "turn": 12},
    "consolidated_at": "2026-07-20T18:04:11.223Z",
    "time_start": "2026-07-20T17:55:00.000Z",
    "time_end": "2026-07-20T18:02:00.000Z",
    "context_signals": {
        "urgency": "low",
        "sentiment": "positive",
        "session_type": "explore",
    },
    "epistemic_status": "established",
    "evidence_count": 4,
    "rank": 0.8734,
    "explanation": [
        {
            "name": "epistemic_status",
            "weight": 1.0,
            "detail": "Status: established, evidence count: 4",
        },
        {"name": "keyword_overlap", "weight": 0.3, "detail": "2 of 3 query tokens"},
    ],
}

QUERY_RESULT_LEGACY: dict[str, Any] = {
    "id": 4211,
    "content": "User prefers dark mode in the terminal and dislikes light themes.",
    "summary": "Dark mode preference",
    "metadata": {"source": "chat", "turn": 12},
    "consolidated_at": "2026-07-20T18:04:11.223Z",
    "time_start": None,
    "time_end": None,
    "rank": 0.8734,
}

# Shared-pool rows take a different code path (src/memory-manager.ts mergePool
# results): the literal omits the v3.8/v3.9 keys outright, and sets summary to
# `undefined` when the source row has none — which JSON.stringify drops, so the
# key never reaches the client.
QUERY_RESULT_POOL_ROW: dict[str, Any] = {
    "id": 771,
    "content": "Deploys to prod are frozen on Fridays.",
    "metadata": {
        "_from_pool": "team-alpha",
        "_source_agent": "agent-9",
        "_trust_score": 0.612,
    },
    "consolidated_at": "2026-07-19T09:00:00.000Z",
    "time_start": None,
    "time_end": None,
    "rank": 0.4102,
}

# ── ConsolidateResult — POST /memory/:id/consolidate ─────────────────────────

CONSOLIDATE_RESULT_CURRENT: dict[str, Any] = {
    "run_id": 88,
    "agent_id": "agent-1",
    "hot_rows_processed": 140,
    "warm_rows_created": 12,
    "consolidation_mode": "concat",
    "status": "complete",
}

# ── ClearResult — POST /memory/:id/clear ─────────────────────────────────────

CLEAR_RESULT_CURRENT: dict[str, Any] = {
    "agent_id": "agent-1",
    "hot_archived": 140,
    "warm_archived": 12,
}

# ── AgentStats — GET /memory/:id/stats ───────────────────────────────────────

AGENT_STATS_CURRENT: dict[str, Any] = {
    "agent_id": "agent-1",
    "hot_count": 140,
    "warm_count": 812,
    "cold_count": 3301,
    "entity_count": 64,
    "relationship_count": 91,
    "reflection_count": 7,
    "last_consolidation": "2026-07-20T18:04:11.223Z",
    "last_seen": "2026-07-20T18:30:00.000Z",
    "stale_embedding_count": 45,
}

AGENT_STATS_LEGACY: dict[str, Any] = {
    "agent_id": "agent-1",
    "hot_count": 140,
    "warm_count": 812,
    "cold_count": 3301,
    "entity_count": 64,
    "relationship_count": 91,
    "reflection_count": 7,
    "last_consolidation": None,
    "last_seen": "2026-07-20T18:30:00.000Z",
}

# ── MemoryHealth — GET /memory/:id/health ────────────────────────────────────

MEMORY_HEALTH_CURRENT: dict[str, Any] = {
    "agent_id": "agent-1",
    "total_memories": 812,
    "avg_importance": 0.41,
    "avg_confidence": 0.77,
    "memories_below_eviction": 9,
    "memories_below_revision": 31,
    "revision_velocity_24h": 4,
    "knowledge_stability_pct": 96.2,
    "retrieval_count_24h": 210,
    "contradiction_rate": 0.03,
    "stale_memory_count": 22,
    "avg_staleness": 0.18,
    "knowledge_gap_count_7d": 6,
}

MEMORY_HEALTH_LEGACY: dict[str, Any] = {
    "agent_id": "agent-1",
    "total_memories": 812,
    "avg_importance": 0.41,
    "avg_confidence": 0.77,
    "memories_below_eviction": 9,
    "memories_below_revision": 31,
    "revision_velocity_24h": 4,
    "knowledge_stability_pct": 96.2,
    "retrieval_count_24h": 210,
    "contradiction_rate": 0.03,
}

# ── ResumeContext — GET /memory/:id/resume ───────────────────────────────────

RESUME_CONTEXT_CURRENT: dict[str, Any] = {
    "agent_id": "agent-1",
    "time_since_last_activity_ms": 3_600_000,
    "top_memories": [
        {
            "id": 4211,
            "content": "User prefers dark mode.",
            "importance": 0.91,
            "consolidated_at": "2026-07-20T18:04:11.223Z",
        }
    ],
    "active_procedures": [
        {"condition": "user reports a crash", "action": "ask for the stack trace", "confidence": 0.82}
    ],
    "open_contradictions": ["prefers dark mode vs. asked for light theme on 2026-06-02"],
    "memory_health": {"total_memories": 812, "avg_importance": 0.41, "avg_confidence": 0.77},
}

# ── FeedbackResult — POST /memory/:id/feedback ───────────────────────────────

FEEDBACK_RESULT_CURRENT: dict[str, Any] = {
    "agent_id": "agent-1",
    "updated": 3,
    "outcome": "positive",
}

# ── SleepCycleResult — POST /memory/:id/sleep ────────────────────────────────

# A busy cycle: every conditional counter came back non-zero, so the server
# emits all 24 keys.
SLEEP_RESULT_CURRENT: dict[str, Any] = {
    "agent_id": "agent-1",
    "phase1_scores_updated": 812,
    "phase2_evicted": 9,
    "phase2_flagged_for_revision": 31,
    "phase3_revised": 5,
    "phase3_skipped": 26,
    "phase4_edges_invalidated": 2,
    "phase4_entities_merged": 3,
    "phase5_reflection": True,
    "phase5b_cold_purged": 120,
    "schemas_detected": 4,
    "conflicts_resolved": 2,
    "audit_records_archived": 500,
    "tokens_used": 18_400,
    "duration_ms": 9_215,
    "capacity_evicted": 14,
    "temporal_expired": 6,
    "procedures_evolved": 3,
    "embeddings_migrated": 100,
    "embeddings_migration_backlog": 712,
    "deprecated_decayed": 8,
    "epistemic_promoted": 11,
    "causal_edges_updated": 27,
    "principles_extracted": 2,
}

# A quiet cycle on the same v3.12 server: the engine assigns the optional
# counters only behind `if counter > 0`, so they are absent from the wire.
SLEEP_RESULT_QUIET_CYCLE: dict[str, Any] = {
    "agent_id": "agent-1",
    "phase1_scores_updated": 12,
    "phase2_evicted": 0,
    "phase2_flagged_for_revision": 0,
    "phase3_revised": 0,
    "phase3_skipped": 0,
    "phase4_edges_invalidated": 0,
    "phase4_entities_merged": 0,
    "phase5_reflection": False,
    "phase5b_cold_purged": 0,
    "schemas_detected": 0,
    "conflicts_resolved": 0,
    "audit_records_archived": 0,
    "tokens_used": 0,
    "duration_ms": 41,
}

SLEEP_RESULT_LEGACY: dict[str, Any] = {
    "agent_id": "agent-1",
    "phase1_scores_updated": 12,
    "phase2_evicted": 0,
    "phase2_flagged_for_revision": 0,
    "phase3_revised": 0,
    "phase3_skipped": 0,
    "phase4_edges_invalidated": 0,
    "phase4_entities_merged": 0,
    "phase5_reflection": False,
    "tokens_used": 0,
    "duration_ms": 41,
}

# ── ReflectionResult — POST /memory/:id/reflect ──────────────────────────────

REFLECTION_RESULT_CURRENT: dict[str, Any] = {
    "id": 19,
    "agent_id": "agent-1",
    "insights_count": 4,
    "contradictions_count": 1,
    "source_memories_reviewed": 20,
    "trigger_type": "manual",
    "reflection_level": 1,
}
