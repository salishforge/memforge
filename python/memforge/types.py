"""MemForge Python SDK — type definitions."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class AddResult:
    id: int
    agent_id: str
    created_at: str
    deduplicated: bool = False


@dataclass
class QueryResult:
    id: int
    content: str
    summary: Optional[str]
    metadata: dict[str, Any]
    consolidated_at: str
    time_start: Optional[str]
    time_end: Optional[str]
    rank: float


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
