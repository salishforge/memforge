"""MemForge Python SDK — type definitions.

The server grows its response payloads in minor releases: a memory row that
carried 8 keys in v3.7 carries 12 in v3.12. Two rules keep this SDK usable
across that drift, and both are load-bearing:

1. Every response dataclass is built through :func:`from_response`, which
   drops keys the dataclass does not declare. Without it a single new server
   field raises ``TypeError`` on *every* call to the affected endpoint —
   which is exactly how issue #161 shipped.
2. Every field the server added after the dataclass was first written carries
   a default, so an SDK running against an *older* server still parses. The
   defaults are chosen to match what the server's omission means, not merely
   to be falsy — see the per-field notes below.

Together these make dataclass and server independently upgradable in either
direction. Filtering alone would silently discard real data; adding fields
alone would leave the next server release to break callers again.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional, TypeVar

T = TypeVar("T")


def from_response(cls: type[T], raw: Mapping[str, Any]) -> T:
    """Build a response dataclass from a server payload, ignoring unknown keys.

    The server adds response fields in minor releases; an SDK that rejects
    them breaks every caller on upgrade. Keys absent from ``raw`` fall back
    to the dataclass default, which is how this SDK stays compatible with
    servers older than itself.
    """
    known = {f.name for f in dataclasses.fields(cls)}  # type: ignore[arg-type]
    return cls(**{k: v for k, v in raw.items() if k in known})


@dataclass
class AddResult:
    id: int
    agent_id: str
    created_at: str
    # Only emitted when the write collapsed onto an existing hot-tier row.
    deduplicated: bool = False


@dataclass
class QueryResult:
    id: int
    content: str
    metadata: dict[str, Any]
    consolidated_at: str
    time_start: Optional[str]
    time_end: Optional[str]
    rank: float

    # `summary` is only populated under LLM consolidation, and shared-pool
    # rows omit the key entirely, so it cannot be a required argument.
    summary: Optional[str] = None

    # v3.8 — sentiment/urgency/session_type merged from contributing hot rows.
    # Absent means "no signals recorded", which is what an empty dict says.
    context_signals: dict[str, Any] = field(default_factory=dict)

    # v3.9 — calibrated uncertainty. None means the server did not report a
    # status; it is not the same as any of the five status values.
    epistemic_status: Optional[str] = None
    # v3.9 — corroborating retrievals. The server's floor is 1, so 0 would be
    # a lie; None means "not reported".
    evidence_count: Optional[int] = None

    # v3.10 — per-result rank factors, present only when query(explain=True).
    # None distinguishes "not requested" from "requested, no factors".
    explanation: Optional[list[dict[str, Any]]] = None


@dataclass
class ConsolidateResult:
    run_id: int
    agent_id: str
    hot_rows_processed: int
    warm_rows_created: int
    consolidation_mode: str
    status: str


@dataclass
class ClearResult:
    agent_id: str
    hot_archived: int
    warm_archived: int


@dataclass
class AgentStats:
    agent_id: str
    hot_count: int
    warm_count: int
    cold_count: int
    entity_count: int
    relationship_count: int
    reflection_count: int
    last_consolidation: Optional[str]
    last_seen: Optional[str]

    # v3.4 — warm rows awaiting re-embedding under the current model. Omitted
    # when embeddings are disabled, where the answer is "unknown", not zero.
    stale_embedding_count: Optional[int] = None


@dataclass
class MemoryHealth:
    agent_id: str
    total_memories: int
    avg_importance: float
    avg_confidence: float
    memories_below_eviction: int
    memories_below_revision: int
    revision_velocity_24h: int
    knowledge_stability_pct: float
    retrieval_count_24h: int
    contradiction_rate: float

    # v2.6 — staleness and knowledge-gap tracking. Always sent by v2.6+
    # servers; the zero defaults cover pre-v2.6 ones.
    stale_memory_count: int = 0
    avg_staleness: float = 0.0
    knowledge_gap_count_7d: int = 0


@dataclass
class ResumeContext:
    agent_id: str
    time_since_last_activity_ms: Optional[int]
    top_memories: list[dict[str, Any]]
    active_procedures: list[dict[str, Any]]
    open_contradictions: list[str]
    memory_health: dict[str, Any]


@dataclass
class FeedbackResult:
    agent_id: str
    updated: int
    outcome: str


@dataclass
class SleepCycleResult:
    agent_id: str
    phase1_scores_updated: int
    phase2_evicted: int
    phase2_flagged_for_revision: int
    phase3_revised: int
    phase3_skipped: int
    phase4_edges_invalidated: int
    phase4_entities_merged: int
    phase5_reflection: bool
    tokens_used: int
    duration_ms: int

    # Counters the engine always emits. Zero is the correct reading both when
    # the phase did no work and when the server predates the phase.
    phase5b_cold_purged: int = 0
    schemas_detected: int = 0
    conflicts_resolved: int = 0
    audit_records_archived: int = 0

    # Counters the engine emits only when non-zero — it assigns each key
    # post-hoc behind `if counter > 0`, so an omitted key means exactly 0.
    capacity_evicted: int = 0
    temporal_expired: int = 0
    procedures_evolved: int = 0
    embeddings_migrated: int = 0
    embeddings_migration_backlog: int = 0
    deprecated_decayed: int = 0
    epistemic_promoted: int = 0  # v3.9 — Sleep Phase 5.12
    causal_edges_updated: int = 0  # v3.10 — Sleep Phase 6.1
    principles_extracted: int = 0  # v3.11 — Sleep Phase 5.11


@dataclass
class ReflectionResult:
    id: int
    agent_id: str
    insights_count: int
    contradictions_count: int
    source_memories_reviewed: int
    trigger_type: str
    reflection_level: int


@dataclass
class MemoryHints:
    """Agent-provided hints for active ingest participation."""
    importance: Optional[float] = None
    topic: Optional[str] = None
    supersedes: Optional[str] = None
    entities: Optional[list[str]] = None
    retention: Optional[str] = None  # 'normal' | 'important' | 'permanent'
    type: Optional[str] = None  # 'fact' | 'event' | 'decision' | 'preference' | 'correction' | 'error'
