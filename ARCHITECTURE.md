# MemForge — Architecture

## Overview

MemForge is a neuroscience-inspired memory system for AI agents. This document describes the internal architecture, data models, and processing pipelines.

For design philosophy and objectives, see [SPECIFICATION.md](SPECIFICATION.md). For API usage, see [README.md](README.md). For development setup, see [DEVELOPMENT.md](DEVELOPMENT.md).

## Memory Revision Engine

The Memory Revision Engine (MRE) is a background processing system that actively rewrites and refines stored memories rather than layering new information on top of old. It runs during configurable "sleep cycles" and produces a progressively more accurate, coherent knowledge base.

## Core Data Model

### Retrieval Event Log

Every time a memory is accessed, the retrieval is logged as a discrete event:

```
retrieval_log (
  id            BIGSERIAL PRIMARY KEY,
  agent_id      TEXT NOT NULL,
  warm_tier_id  BIGINT NOT NULL,        -- which memory was retrieved
  query_text    TEXT NOT NULL,           -- the query that triggered retrieval
  query_mode    TEXT NOT NULL,           -- keyword/semantic/hybrid
  rank_position INT NOT NULL,            -- where it appeared in results
  context       JSONB DEFAULT '{}',      -- downstream context (optional)
  created_at    TIMESTAMPTZ DEFAULT now()
)
```

This is the raw signal for reinforcement. A memory retrieved 50 times across 30 different queries is clearly important. A memory retrieved once and never again may be noise.

### Memory Revision History

Every warm-tier row gets a revision history. When the MRE rewrites a memory, both the old and new versions are preserved:

```
memory_revisions (
  id              BIGSERIAL PRIMARY KEY,
  agent_id        TEXT NOT NULL,
  warm_tier_id    BIGINT NOT NULL,       -- the memory being revised
  revision_number INT NOT NULL,          -- monotonically increasing per memory
  previous_content TEXT NOT NULL,         -- content before revision
  new_content     TEXT NOT NULL,          -- content after revision
  revision_type   TEXT NOT NULL,          -- 'augment' | 'correct' | 'merge' | 'compress'
  reason          TEXT NOT NULL,          -- LLM-generated explanation of why
  delta_summary   TEXT NOT NULL,          -- what changed, in plain language
  confidence      REAL NOT NULL,          -- 0.0-1.0, LLM's confidence in the revision
  model_used      TEXT NOT NULL,          -- which model performed the revision
  created_at      TIMESTAMPTZ DEFAULT now()
)
```

### Importance Score (Composite)

Added to warm_tier as a materialized composite score:

```
ALTER TABLE warm_tier ADD COLUMN importance REAL NOT NULL DEFAULT 0.5;
ALTER TABLE warm_tier ADD COLUMN revision_count INT NOT NULL DEFAULT 0;
ALTER TABLE warm_tier ADD COLUMN confidence REAL NOT NULL DEFAULT 0.5;
```

`importance` is recalculated during sleep cycles as:

```
importance = w1 * recency_score      -- exponential decay from last_accessed
           + w2 * frequency_score    -- log(access_count + 1) / log(max_access + 1)
           + w3 * centrality_score   -- entity mention count + relationship degree
           + w4 * reflection_score   -- cited in reflections / contradictions
           + w5 * stability_score    -- 1.0 - (recent_revision_rate)
```

Default weights: w1=0.25, w2=0.20, w3=0.20, w4=0.15, w5=0.20

`confidence` reflects how settled the memory is. High confidence = few recent revisions, consistent with graph, corroborated by multiple sources.

## Sleep Cycle Phases

### Phase 1: Scoring (fast, no LLM)

Recalculate `importance` and `confidence` for all warm-tier rows based on:
- Retrieval log events since last cycle
- Current graph connectivity
- Time since last revision
- Reflection citation count

This is pure SQL — no external model calls.

### Phase 2: Triage (fast, no LLM)

- Archive warm-tier rows where `importance < eviction_threshold` to cold tier
- Flag rows where `confidence < revision_threshold` for revision in Phase 3
- Flag entity relationships not seen in N cycles for staleness review

### Phase 3: Revision (LLM-powered, incremental)

For each flagged memory (processed in priority order, bounded by budget):

1. **Gather context**: The memory's content, its entity relationships, related memories (by graph proximity and vector similarity), recent retrieval log entries, and any reflections that cite it.

2. **Send to LLM** with a revision prompt:
   > "Here is a stored memory and its current context. Based on newer information, related memories, and known entity relationships, should this memory be revised? If so, produce the revised version. Explain what changed and why. Rate your confidence 0.0-1.0."

3. **LLM returns** one of:
   - **No revision needed** — memory is current and accurate. Bump confidence.
   - **Augment** — add context or detail from related memories. Preserve original meaning.
   - **Correct** — fix factual errors based on newer, more reliable information.
   - **Merge** — this memory substantially overlaps with another; combine them.
   - **Compress** — this memory is verbose; distill to essential content.

4. **Apply revision**: Update warm_tier content, increment revision_count, log in memory_revisions, re-generate embedding for the revised content.

### Phase 4: Graph Maintenance (LLM-powered, incremental)

- For flagged stale relationships: check if still valid against recent memories
- Invalidate edges that are contradicted (set valid_until timestamp)
- Merge duplicate entities detected by name similarity + context overlap
- Update relationship weights based on revision evidence

### Phase 5: Reflection (LLM-powered, periodic)

Same as current reflection system, but now operating on the *revised* memory base rather than raw accumulations. Reflections are higher quality because the underlying memories are more accurate.

## Budget and Scheduling

### Compute Budget

Each sleep cycle has a configurable **token budget** that limits LLM calls:

```
SLEEP_CYCLE_TOKEN_BUDGET=100000     # max tokens per cycle
SLEEP_CYCLE_MODEL=ollama:llama3.2   # model for revision (can differ from consolidation model)
SLEEP_CYCLE_INTERVAL_MS=3600000     # how often to run (default: 1 hour)
SLEEP_CYCLE_IDLE_TRIGGER_MS=300000  # run after 5 min of no API activity
```

Phase 1-2 (scoring + triage) always run — they're pure SQL.
Phase 3-5 (revision + graph + reflection) consume the token budget.

Memories are processed in priority order: highest-importance, lowest-confidence first. If the budget runs out, remaining memories wait for the next cycle. This means the system naturally focuses its compute on the memories that matter most and are least certain.

### Model Selection

The revision model is configurable independently from the consolidation model:

- **Remote model** (Anthropic/OpenAI): Higher quality revisions, higher cost. Best for important memories.
- **Local model** (Ollama): Lower cost, faster iteration. Good for routine maintenance.
- **Hybrid**: Use local model for Phase 2 triage decisions, remote model for Phase 3 revisions of high-importance memories.

The system could also adapt: use a cheaper model for low-importance revisions and a more capable model for high-importance ones, within the same cycle.

## Evaluation Metrics

The revision history enables self-evaluation without external benchmarks:

### Memory-Level Metrics
- **Revision velocity**: revisions/day — decreasing over time means convergence
- **Confidence trajectory**: is confidence trending up? (learning)
- **Access-after-revision rate**: are revised memories retrieved more often? (usefulness)
- **Contradiction rate**: does this memory appear in fewer contradiction reports after revision?

### System-Level Metrics
- **Knowledge stability**: what % of memories were unchanged in the last cycle?
- **Graph coherence**: what % of entity relationships are non-contradicted?
- **Retrieval relevance**: what % of retrievals are from high-confidence memories?
- **Revision ROI**: do revised memories get accessed more than unrevised ones?

These can be exposed via `/memory/:agentId/health` as a memory quality dashboard.

## Example: Memory Lifecycle

```
Day 1: Agent stores "Alice manages the payments team"
        → warm_tier row #42, importance=0.5, confidence=0.5

Day 3: Retrieved 5 times across different queries
        → retrieval_log entries, access_count=5
        → Sleep cycle: importance increases to 0.72

Day 7: Agent stores "Bob is now leading the payments team"
        → New warm_tier row #89
        → Sleep cycle Phase 3: MRE detects row #42 conflicts with #89
        → Revision: row #42 rewritten to "Alice previously managed the payments team (superseded)"
        → Graph: relationship "Alice manages payments-team" gets valid_until=Day 7
        → Graph: new relationship "Bob manages payments-team" valid_from=Day 7
        → memory_revisions logs the change with reason="superseded by newer information"
        → row #42 confidence drops to 0.3 (revised), row #89 confidence=0.6

Day 14: Nobody retrieves row #42 anymore; row #89 retrieved frequently
         → Sleep cycle: row #42 importance decays below threshold
         → Triage: row #42 archived to cold tier
         → The canonical knowledge is now just row #89
```

The agent never has to compare two contradictory memories at query time. The sleep cycle already resolved it.

## Downstream Outcome Feedback (v2.1.0)

The feedback system closes the reinforcement loop:

```
Agent queries memory → retrieval_log events created
Agent uses memory → outcome observed
Agent calls POST /feedback → outcome recorded on retrieval_log
Sleep cycle → importance adjusted based on outcome patterns
```

Positive feedback boosts linked memory importance by 0.05; negative penalizes by 0.05. Over time, memories that consistently lead to good outcomes surface higher in search results.

## Entity Deduplication (v2.1.0)

Knowledge graphs accumulate duplicate entities that fragment relationships. During sleep cycle Phase 4, MemForge detects candidates using PostgreSQL `pg_trgm` similarity:

```sql
SELECT a.id, b.id, similarity(a.name, b.name)
FROM entities a JOIN entities b ON a.agent_id = b.agent_id
  AND a.id < b.id AND a.entity_type = b.entity_type
WHERE similarity(a.name, b.name) >= 0.7
```

The entity with more mentions is kept. The merge process:
1. Repoint `warm_tier_entities` references to the canonical entity
2. Repoint `relationships` (both source and target sides)
3. Delete orphaned references that would violate uniqueness constraints
4. Merge mention counts, take earliest `first_seen`
5. Delete the duplicate entity

All within a transaction — merge is atomic.

## Hierarchical Reflection (v2.1.0)

First-order reflections synthesize insights from raw memories. Meta-reflections (level 2) synthesize principles from reflections:

```
Memories → Reflection (level 1): "Users consistently prefer dark mode"
Memories → Reflection (level 1): "Deploy failures correlate with Friday pushes"
Memories → Reflection (level 1): "Alice's reviews always catch edge cases"

Reflections → Meta-Reflection (level 2): "The team has implicit quality gates
  (Alice's reviews, no-Friday-deploy rule) that are more effective than
  formal processes. Codify these rather than adding more process."
```

Meta-reflections require 3+ first-order reflections. The system prompt focuses on cross-reflection patterns, blind spots, and durable principles rather than re-summarizing individual reflections.

## Active Recall (v2.1.0)

Most memory failures are "forgot to look" failures — the information existed but the agent didn't check. Active recall preempts this:

```
Agent: "About to deploy v2.4.0"
POST /active-recall { context: "deploying v2.4.0" }
→ memories: "Never deploy on Fridays — learned this the hard way"
→ procedures: "When deploying, check the Grafana latency dashboard first"
```

Runs memory search and procedure lookup in parallel against the provided context.

## Module Structure

```
src/
├── memory-manager.ts   Core API — all memory operations
├── sleep-cycle.ts      5-phase background processor
├── server.ts           Express REST API (18 endpoints)
├── llm.ts              LLM provider abstraction (Anthropic, OpenAI, Ollama)
├── embedding.ts        Embedding provider abstraction
├── client.ts           TypeScript HTTP client SDK
├── mcp.ts              MCP server (17 tools, stdio transport)
├── tool-definitions.ts LLM function calling schemas
├── types.ts            Shared TypeScript interfaces
├── cache.ts            Redis caching layer
├── dashboard.ts        Cache monitoring HTML dashboard
├── auth.ts             Bearer token + scope authorization
├── metrics.ts          Prometheus metrics
├── openapi.ts          OpenAPI 3.0 specification
├── db.ts               PostgreSQL connection pool
├── index.ts            Library entry point (npm exports)
└── version.ts          Version constant

schema/
├── schema.sql          Complete PostgreSQL schema (12 tables)
└── migration-v*.sql    Incremental migrations

tests/
├── integration.test.ts Database integration tests
└── cache.test.ts       Redis cache tests
```

## Database Schema

12 tables with the following relationships:

```
agents (1) ─┬── hot_tier (N)        Raw events
             ├── warm_tier (N)       Consolidated, searchable
             │   ├── warm_tier_entities (N:M) ── entities (N)
             │   ├── retrieval_log (N)           Query hit tracking
             │   └── memory_revisions (N)        Revision history
             ├── cold_tier (N)       Archived audit trail
             ├── consolidation_log (N)           Run history
             ├── entities (N) ── relationships (N:N between entities)
             ├── reflections (N)     Insights + meta-reflections
             └── procedures (N)      Condition→action rules
```
