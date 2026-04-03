# MemForge — Memory Architecture Specification

## Vision

MemForge is a neuroscience-inspired memory system for AI agents that mimics human memory consolidation. The core objective is **continuous improvement**: agents should get better over time by learning from their own experience, not just storing and retrieving facts.

Unlike key-value stores or simple RAG databases, MemForge actively processes, rewrites, and strengthens memories during idle periods — analogous to how human memory consolidation occurs during sleep.

## Design Objectives

1. **Self-improving memory** — Memories are not static. Sleep cycles actively revise, strengthen, and prune stored knowledge. The system's understanding gets more accurate with every cycle.

2. **Retrieval-based reinforcement** — Memories that are retrieved frequently and lead to good outcomes become stronger. Memories that are never accessed decay and are eventually archived. This creates a natural selection pressure toward useful knowledge.

3. **Multi-signal importance** — No single metric determines memory value. Importance is a composite of recency, access frequency, graph centrality, reflection citations, and revision stability. This mirrors how human memory strength depends on multiple reinforcement pathways.

4. **Transparent revision history** — Every memory rewrite is logged with the previous content, the reason for change, and the model that made the decision. The system is auditable.

5. **Pluggable intelligence** — LLM and embedding providers are interfaces, not implementations. Use expensive cloud models for important revisions and cheap local models for routine maintenance.

6. **Operational simplicity** — Pure PostgreSQL for all storage including the knowledge graph. No Neo4j, no separate vector database. Redis is optional. One process to deploy.

## Core Tenets

### 1. AI-Controlled Memory Processing

Memory management is not a passive store. An AI process — analogous to human **sleep cycles** — actively reorganizes, strengthens, weakens, and prunes memories during periods of agent inactivity.

During idle periods ("sleep"), the system:
- Reviews recently accessed memories and adjusts their priority/weight
- Consolidates fragmented episodic memories into coherent semantic summaries
- Detects contradictions between new and existing knowledge
- Synthesizes higher-order insights (reflections) from patterns across memories
- Extracts durable principles (meta-reflections) from patterns across reflections
- Prunes low-value memories that haven't been accessed or reinforced
- Merges duplicate entities in the knowledge graph

### 2. Retrieval-Based Reinforcement

When a memory is accessed and brought into the current context, the retrieval itself is a signal of importance. The system records:
- **What** was retrieved (warm-tier row ID)
- **When** it was retrieved (timestamp)
- **Why** it was retrieved (the query that triggered retrieval)
- **What happened after** (was the downstream interaction successful? via feedback endpoint)

These retrieval events feed back into memory priority. Frequently accessed memories become more "memorable" — they surface more easily in future searches and resist decay/eviction. Positive outcome feedback boosts importance; negative feedback penalizes it.

### 3. Temporal Commit History

Every memory has a full temporal history — not just "when it was created" but:
- **Committed**: When the memory was first stored
- **Revised**: When the memory's content or metadata was updated (with diff/reason)
- **Reinforced**: When the memory was accessed/retrieved (with context)
- **Feedback**: Whether retrievals led to positive or negative outcomes
- **Weakened**: When the memory's importance decayed or was explicitly deprioritized
- **Removed**: When the memory was archived to cold tier (with reason)

### 4. Tiered Memory Architecture

Memory flows through tiers that mirror human memory systems:

| Tier | Human Analogue | Purpose | Lifecycle |
|------|---------------|---------|-----------|
| **Hot** | Sensory/Working memory | Raw event ingestion, immediate context | Seconds to hours |
| **Warm** | Long-term episodic + semantic | Consolidated, searchable, weighted | Days to months |
| **Cold** | Deep storage / archive | Audit trail, rarely accessed | Indefinite |
| **Reflections** | Metacognition | Synthesized insights, learned principles | Persistent |
| **Meta-Reflections** | Meta-metacognition | Higher-order patterns from reflections | Persistent |
| **Procedural** | Muscle memory / skills | Learned strategies, condition→action rules | Persistent |

### 5. Weight/Priority System

Every warm-tier memory has a composite **importance score** derived from:
- **Recency** (w=0.25): When was it last accessed? (exponential decay)
- **Frequency** (w=0.20): How often has it been accessed? (logarithmic scaling)
- **Centrality** (w=0.20): How connected is it in the knowledge graph?
- **Reflection** (w=0.15): Has it been cited in reflections or contradiction reports?
- **Stability** (w=0.20): How stable is it? (inverse of recent revision rate)

This score influences:
- Search result ranking (higher-importance memories surface first)
- Eviction decisions (low-importance memories move to cold tier during sleep cycles)
- Revision priority (high-importance, low-confidence memories are revised first)
- Feedback adjustments (positive outcomes boost importance by 0.05)

### 6. Sleep Cycle Processing

Inspired by how human memory consolidation occurs during sleep, MemForge performs background processing during agent idle periods:

**Phase 1 — Scoring** (fast, SQL only)
- Recalculate composite importance scores for all warm-tier memories
- Factor in retrieval frequency, graph centrality, reflection citations, revision stability

**Phase 2 — Triage** (fast, SQL only)
- Archive memories below importance threshold to cold tier
- Flag low-confidence memories for LLM revision
- Ordered by highest importance first (prioritize what matters most)

**Phase 3 — Revision** (LLM-powered, bounded by token budget)
- Gather context: the memory, its entities, related memories, retrieval history
- LLM decides: augment, correct, merge, compress, or leave unchanged
- Apply revision, log to revision history, re-generate embeddings

**Phase 4 — Graph Maintenance** (SQL + optional LLM)
- Decay stale relationship edge weights
- Invalidate edges below weight threshold
- Deduplicate similar entities via trigram similarity

**Phase 5 — Reflection** (LLM-powered, periodic)
- Synthesize insights from the revised knowledge base
- Detect contradictions with prior reflections
- Extract procedural rules from insights

## Implementation Status

| Feature | Status | Version | Notes |
|---------|--------|---------|-------|
| Hot/warm/cold tiers | Implemented | v1.0.0 | Three-tier storage with cold archival |
| Full-text search | Implemented | v1.0.0 | PostgreSQL tsvector + trigram fallback |
| Redis caching | Implemented | v1.1.0 | Three-tier TTL, automatic invalidation |
| Vector search | Implemented | v1.2.0 | pgvector + HNSW index |
| Hybrid search (RRF) | Implemented | v1.2.0 | Reciprocal rank fusion of keyword + semantic |
| Temporal bounds | Implemented | v1.2.0 | time_start/time_end on warm tier |
| Temporal decay scoring | Implemented | v1.2.0 | Configurable exponential decay per hour |
| Access count tracking | Implemented | v1.2.0 | Incremented on query hit |
| LLM consolidation | Implemented | v1.3.0 | Summarize mode with entity/fact extraction |
| Knowledge graph | Implemented | v1.3.0 | Entities + relationships in Postgres |
| Graph traversal | Implemented | v1.3.0 | Recursive CTE with cycle detection |
| Reflection | Implemented | v1.4.0 | LLM-driven with contradiction detection |
| MCP integration | Implemented | v1.5.0 | stdio transport, 17 tools |
| Client SDK | Implemented | v1.5.0 | TypeScript HTTP client with full API coverage |
| Tool definitions | Implemented | v1.5.0 | OpenAI function calling + Anthropic tool_use |
| Retrieval event logging | Implemented | v2.0.0 | retrieval_log table, per-query-hit events |
| Composite importance scoring | Implemented | v2.0.0 | f(recency, frequency, centrality, reflection, stability) |
| Importance-weighted ranking | Implemented | v2.0.0 | Importance boosts search relevance scores |
| Sleep cycle engine | Implemented | v2.0.0 | 5-phase background processor with token budget |
| Memory revision | Implemented | v2.0.0 | LLM rewrites memories in place, full revision history |
| Intelligent eviction | Implemented | v2.0.0 | Low-importance memories auto-archived during sleep |
| Temporal edge annotations | Implemented | v2.0.0 | valid_from/valid_until on relationships |
| Edge invalidation | Implemented | v2.0.0 | Stale edges invalidated during sleep Phase 4 |
| Memory health metrics | Implemented | v2.0.0 | Importance, confidence, revision velocity, stability |
| Procedural memory | Implemented | v2.0.0 | Condition→action rules extracted from reflections |
| Downstream outcome feedback | Implemented | v2.1.0 | POST /feedback records positive/negative/neutral outcomes |
| Entity deduplication | Implemented | v2.1.0 | Trigram-based in sleep cycle + standalone endpoint |
| Meta-reflection | Implemented | v2.1.0 | Second-order reflection on reflections |
| Active recall | Implemented | v2.1.0 | Proactive memory surfacing for planned actions |
| Integration test suite | Implemented | v2.1.0 | 15+ test cases against real database |

## Competitive Differentiation

MemForge's primary differentiator is the **memory revision engine**. While other memory systems (Mem0, Letta, Zep) store and retrieve, MemForge actively rewrites stored knowledge during sleep cycles. No production competitor implements:

- LLM-driven memory revision with full revision history
- Composite importance scoring from five independent signals
- Outcome feedback closing the reinforcement loop
- Hierarchical meta-reflection (reflecting on reflections)
- Sleep cycle phases that progressively improve knowledge quality

The self-evaluation mechanism (revision stability = memory quality metric) addresses a gap the entire field of AI memory acknowledges: there is no standard way to measure whether an agent's memory is actually getting better.

## License

MIT
