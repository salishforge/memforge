"""Parsing-layer tests for the response dataclasses (issue #161).

Three properties are asserted here, and the SDK is only compatible across
server versions if all three hold:

* a payload from the *current* server parses and exposes its new fields;
* a payload from an *older* server parses, falling back to defaults;
* a payload from a *future* server parses, ignoring keys we do not know.

The third is the regression guard for #161 proper. The SDK used to build
these with ``Cls(**raw)``, so the day the server grew ``context_signals``
every non-empty query response raised ``TypeError``.
"""

from __future__ import annotations

import dataclasses

import pytest

from memforge.types import (
    AddResult,
    AgentStats,
    ClearResult,
    ConsolidateResult,
    FeedbackResult,
    MemoryHealth,
    QueryResult,
    ReflectionResult,
    ResumeContext,
    SleepCycleResult,
    from_response,
)

import payloads

# Every response dataclass paired with a realistic current-server payload.
# Parametrizing the cross-cutting tests off one table means a new dataclass
# gets the unknown-key guard the moment it is added here.
CURRENT_PAYLOADS = [
    (AddResult, payloads.ADD_RESULT_CURRENT),
    (QueryResult, payloads.QUERY_RESULT_CURRENT),
    (ConsolidateResult, payloads.CONSOLIDATE_RESULT_CURRENT),
    (ClearResult, payloads.CLEAR_RESULT_CURRENT),
    (AgentStats, payloads.AGENT_STATS_CURRENT),
    (MemoryHealth, payloads.MEMORY_HEALTH_CURRENT),
    (ResumeContext, payloads.RESUME_CONTEXT_CURRENT),
    (FeedbackResult, payloads.FEEDBACK_RESULT_CURRENT),
    (SleepCycleResult, payloads.SLEEP_RESULT_CURRENT),
    (ReflectionResult, payloads.REFLECTION_RESULT_CURRENT),
]

CURRENT_IDS = [cls.__name__ for cls, _ in CURRENT_PAYLOADS]

# The same endpoints as an older server answered them, with every
# later-added key stripped.
LEGACY_PAYLOADS = [
    (AddResult, payloads.ADD_RESULT_LEGACY),
    (QueryResult, payloads.QUERY_RESULT_LEGACY),
    (AgentStats, payloads.AGENT_STATS_LEGACY),
    (MemoryHealth, payloads.MEMORY_HEALTH_LEGACY),
    (SleepCycleResult, payloads.SLEEP_RESULT_LEGACY),
]

LEGACY_IDS = [cls.__name__ for cls, _ in LEGACY_PAYLOADS]


# ── Cross-cutting guards ─────────────────────────────────────────────────────

@pytest.mark.parametrize("cls,payload", CURRENT_PAYLOADS, ids=CURRENT_IDS)
def test_current_server_payload_parses(cls, payload):
    parsed = from_response(cls, payload)

    assert isinstance(parsed, cls)


@pytest.mark.parametrize("cls,payload", CURRENT_PAYLOADS, ids=CURRENT_IDS)
def test_current_server_payload_populates_every_declared_field(cls, payload):
    """No key the server sends may be silently dropped on the floor.

    A filter that ignores unknown keys is only safe if the dataclass has in
    fact caught up with the server. This asserts the other half of the fix:
    every field the current server sends is declared and carries the sent
    value, so filtering discards nothing real.
    """
    declared = {f.name for f in dataclasses.fields(cls)}
    undeclared = sorted(set(payload) - declared)
    assert undeclared == [], f"{cls.__name__} does not declare: {undeclared}"

    parsed = from_response(cls, payload)

    for key, value in payload.items():
        assert getattr(parsed, key) == value, f"{cls.__name__}.{key} did not round-trip"


@pytest.mark.parametrize("cls,payload", CURRENT_PAYLOADS, ids=CURRENT_IDS)
def test_unknown_future_field_does_not_raise(cls, payload):
    """The guard that would have prevented #161."""
    future = {**payload, "some_field_from_v9": 1, "another_field_from_v9": {"a": "b"}}

    parsed = from_response(cls, future)

    assert not hasattr(parsed, "some_field_from_v9")


@pytest.mark.parametrize("cls,payload", LEGACY_PAYLOADS, ids=LEGACY_IDS)
def test_older_server_payload_parses(cls, payload):
    """Fields the server added later must carry defaults, or an SDK newer
    than the server it talks to raises TypeError on a missing argument."""
    parsed = from_response(cls, payload)

    assert isinstance(parsed, cls)


# ── QueryResult — the dataclass #161 was filed against ───────────────────────

def test_query_result_exposes_v38_context_signals():
    parsed = from_response(QueryResult, payloads.QUERY_RESULT_CURRENT)

    assert parsed.context_signals == {
        "urgency": "low",
        "sentiment": "positive",
        "session_type": "explore",
    }


def test_query_result_exposes_v39_epistemic_fields():
    parsed = from_response(QueryResult, payloads.QUERY_RESULT_CURRENT)

    assert parsed.epistemic_status == "established"
    assert parsed.evidence_count == 4


def test_query_result_exposes_v310_explanation():
    parsed = from_response(QueryResult, payloads.QUERY_RESULT_CURRENT)

    assert [f["name"] for f in parsed.explanation] == ["epistemic_status", "keyword_overlap"]


def test_query_result_explanation_is_none_when_explain_not_requested():
    """None distinguishes "explain=false" from "explained, but no factors"."""
    parsed = from_response(QueryResult, payloads.QUERY_RESULT_LEGACY)

    assert parsed.explanation is None


def test_query_result_defaults_context_signals_to_empty_dict_on_older_server():
    parsed = from_response(QueryResult, payloads.QUERY_RESULT_LEGACY)

    assert parsed.context_signals == {}


def test_query_result_leaves_epistemic_fields_none_on_older_server():
    """0 would be a lie for evidence_count — the server's floor is 1."""
    parsed = from_response(QueryResult, payloads.QUERY_RESULT_LEGACY)

    assert parsed.epistemic_status is None
    assert parsed.evidence_count is None


def test_query_result_parses_shared_pool_row_without_summary():
    """Pool rows serialize summary as `undefined`, which never reaches the
    wire — so `summary` cannot be a required argument."""
    parsed = from_response(QueryResult, payloads.QUERY_RESULT_POOL_ROW)

    assert parsed.summary is None
    assert parsed.metadata["_from_pool"] == "team-alpha"


# ── SleepCycleResult ─────────────────────────────────────────────────────────

def test_sleep_result_exposes_always_emitted_counters():
    parsed = from_response(SleepCycleResult, payloads.SLEEP_RESULT_CURRENT)

    assert parsed.phase5b_cold_purged == 120
    assert parsed.schemas_detected == 4
    assert parsed.conflicts_resolved == 2
    assert parsed.audit_records_archived == 500


def test_sleep_result_exposes_conditional_counters():
    parsed = from_response(SleepCycleResult, payloads.SLEEP_RESULT_CURRENT)

    assert parsed.capacity_evicted == 14
    assert parsed.temporal_expired == 6
    assert parsed.procedures_evolved == 3
    assert parsed.embeddings_migrated == 100
    assert parsed.embeddings_migration_backlog == 712
    assert parsed.deprecated_decayed == 8
    assert parsed.epistemic_promoted == 11
    assert parsed.causal_edges_updated == 27
    assert parsed.principles_extracted == 2


def test_sleep_result_conditional_counters_default_to_zero_on_quiet_cycle():
    """The engine omits each of these behind `if counter > 0`, so an absent
    key means exactly zero — not unknown."""
    parsed = from_response(SleepCycleResult, payloads.SLEEP_RESULT_QUIET_CYCLE)

    assert parsed.capacity_evicted == 0
    assert parsed.epistemic_promoted == 0
    assert parsed.principles_extracted == 0


def test_sleep_result_parses_older_server_response():
    parsed = from_response(SleepCycleResult, payloads.SLEEP_RESULT_LEGACY)

    assert parsed.phase5b_cold_purged == 0
    assert parsed.schemas_detected == 0
    assert parsed.conflicts_resolved == 0
    assert parsed.audit_records_archived == 0


# ── MemoryHealth ─────────────────────────────────────────────────────────────

def test_memory_health_exposes_staleness_fields():
    parsed = from_response(MemoryHealth, payloads.MEMORY_HEALTH_CURRENT)

    assert parsed.stale_memory_count == 22
    assert parsed.avg_staleness == pytest.approx(0.18)
    assert parsed.knowledge_gap_count_7d == 6


def test_memory_health_parses_older_server_response():
    parsed = from_response(MemoryHealth, payloads.MEMORY_HEALTH_LEGACY)

    assert parsed.stale_memory_count == 0
    assert parsed.avg_staleness == 0.0
    assert parsed.knowledge_gap_count_7d == 0


# ── AgentStats ───────────────────────────────────────────────────────────────

def test_agent_stats_exposes_stale_embedding_count():
    parsed = from_response(AgentStats, payloads.AGENT_STATS_CURRENT)

    assert parsed.stale_embedding_count == 45


def test_agent_stats_stale_embedding_count_is_none_when_embeddings_disabled():
    """The server omits the key entirely rather than sending 0, because with
    embeddings off the answer is unknown, not zero."""
    parsed = from_response(AgentStats, payloads.AGENT_STATS_LEGACY)

    assert parsed.stale_embedding_count is None


# ── AddResult ────────────────────────────────────────────────────────────────

def test_add_result_exposes_deduplicated_flag():
    parsed = from_response(AddResult, payloads.ADD_RESULT_CURRENT)

    assert parsed.deduplicated is True


def test_add_result_deduplicated_defaults_false_when_key_absent():
    parsed = from_response(AddResult, payloads.ADD_RESULT_LEGACY)

    assert parsed.deduplicated is False
