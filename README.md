# MemForge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Beta](https://img.shields.io/badge/Status-Beta-yellow.svg)](#project-status)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791.svg)](https://www.postgresql.org)
[![Security Audited](https://img.shields.io/badge/Security-9%20Audits%20Passed-brightgreen.svg)](ADVERSARIAL-ASSESSMENT.md)
[![LongMemEval R@5](https://img.shields.io/badge/LongMemEval%20R%405-93.2%25%20hybrid-blue.svg)](benchmarks/RESULTS.md)

Neuroscience-inspired memory system for AI agents. Sleep cycles consolidate, revise, and strengthen memories — just like biological brains.

MemForge manages agent memory across three tiers (hot → warm → cold) with vector search, a knowledge graph, LLM-driven reflection, procedural learning, and a memory revision engine that actively improves stored knowledge during idle periods.

> **For AI agents reading this:** See [CLAUDE.md](CLAUDE.md) for project instructions, code conventions, and architecture rules. See the [GitHub issues](https://github.com/salishforge/memforge/issues) for open work and improvement areas, and [ROADMAP.md](ROADMAP.md) for the phased plan.

## Project Status

**Beta** — Production hardening is complete. MemForge has passed 9 rounds of security audit (all clean at MEDIUM+), ships with a CI/CD pipeline, and has been benchmarked on LongMemEval (93.2% R@5 hybrid mode, 35.0% R@5 keyword mode). The full test suite covers integration paths, LLM-dependent paths via mock providers, HTTP API endpoints, and load targets.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute and the [ROADMAP.md](ROADMAP.md) for the long-term plan.

## Why MemForge?

Most AI memory systems are passive stores — they save and retrieve, but the stored knowledge never improves. MemForge is different:

- **Memories get better over time.** Sleep cycles actively rewrite low-confidence memories using LLM review, producing progressively more accurate knowledge.
- **The system measures its own quality.** Revision stability, retrieval correlation, and contradiction rates tell you whether memory is actually improving — without external benchmarks.
- **Retrieval reinforces memory.** Memories that are frequently accessed and lead to good outcomes become stronger. Unused memories decay naturally.
- **One database does everything.** PostgreSQL handles storage, full-text search, vector similarity, and graph traversal. No Neo4j, no Pinecone, no separate systems to manage.

See [INTEGRATION.md](INTEGRATION.md) for how to wire MemForge into your agent (any framework, any language). See [SPECIFICATION.md](SPECIFICATION.md) for design philosophy and [ARCHITECTURE.md](ARCHITECTURE.md) for internal architecture.

## Features

- **Tiered Memory** — Hot (raw events) → Warm (consolidated, searchable, scored) → Cold (archived audit trail)
- **Hybrid Search** — Dual-tokenizer keyword (PostgreSQL FTS + trigram), semantic (pgvector HNSW with halfvec float16 — 2x compression), and asymmetric reciprocal rank fusion (semantic 1.5×) with keyword overlap boost, temporal proximity scoring, result deduplication, quality threshold, and entity detection
- **Local In-Process Embeddings** — `EMBEDDING_PROVIDER=local` uses `@xenova/transformers` (bge-small-en-v1.5 default) to generate embeddings in-process at ~137/sec on CPU. No Ollama or OpenAI required. `@xenova/transformers` is an optional peer dependency — install it separately with `npm install @xenova/transformers` when using `EMBEDDING_PROVIDER=local`.
- **Query Understanding** — Strips question scaffolding, auto-extracts time references as date filters, splits compound queries into independent sub-queries for multi-query retrieval
- **Knowledge Graph** — Entities and relationships extracted during consolidation, traversable via recursive CTEs
- **Sleep Cycles** — 10-phase background processor: scoring → triage → conflict resolution → revision → graph maintenance → temporal chains → reflection → schema detection → meta-reflection → gap analysis. Includes autonomous weight adaptation.
- **Active Knowledge Management** — Staleness detection, prioritized experience replay, conflict resolution (Phase 2.5), temporal event chains, knowledge gap tracking, schema crystallization
- **Memory Revision** — LLM rewrites low-confidence memories (augment, correct, merge, compress). High-surprise memories revised first.
- **Reflection** — LLM synthesizes higher-order insights and detects contradictions
- **Meta-Reflection** — Second-order reflection on reflections surfaces durable principles
- **Procedural Memory** — Condition→action rules extracted from reflections
- **Active Ingest** — Hints API, preference extraction, entity detection, supersession. Agents participate in their own memory management.
- **Content Deduplication** — Near-duplicate detection at ingest time prevents redundant storage
- **Confidence Graduation** — High-retrieval, high-feedback memories automatically strengthen
- **Outcome Feedback** — Structured outcome tags close the self-improvement loop
- **Active Recall** — Proactively surface relevant memories before agent actions
- **Agent Resumption** — Single endpoint returns a full context bundle for fast warm-start
- **Entity Deduplication** — Trigram-based duplicate entity detection and merge
- **Temporal Intelligence** — Time-bounded queries, decay scoring, timeline view, temporal event chains
- **Export / Import** — Full JSONL export and bulk import for memory migration and seeding
- **Webhooks** — Event-driven notifications on consolidated/revised/reflected/evicted/graduated
- **Multi-Tenant** — All operations scoped by agent ID
- **Security Hardened** — Zod validation, advisory locks, prompt injection boundaries, RLS, SSRF prevention, security headers. 9 audit rounds, all clean at MEDIUM+.
- **MCP Server** — 17 tools for Claude Code, Cursor, and MCP-compatible AI tools
- **TypeScript SDK** — Zero-dependency HTTP client for any JS runtime
- **Python SDK** — `MemForgeClient`, `ResilientMemForgeClient`, `ConversationMemory` adapter, OpenAI + Anthropic tool definitions. `pip install memforge`.
- **Docker Standalone** — Single container image with embedded PostgreSQL. `docker run -p 3333:3333 salishforge/memforge:standalone`
- **ChatGPT Plugin** — `public/ai-plugin.json` manifest for direct ChatGPT integration
- **LLM Opt-In** — Post-retrieval reranking and LLM-assisted ingest available but off by default

## Getting Started

Choose the path that fits your setup:

### Path 1: Docker Standalone (quickest — zero dependencies)

```bash
docker run -p 3333:3333 salishforge/memforge:standalone
```

A single container starts MemForge with an embedded PostgreSQL database. No separate Postgres, Redis, or Node.js required. Ideal for evaluation and local development.

### Path 2: Python SDK

```bash
pip install memforge
```

```python
from memforge import MemForgeClient, ResilientMemForgeClient, ConversationMemory
import asyncio

async def main():
    # ResilientMemForgeClient never raises — safe for production agents
    client = ResilientMemForgeClient(base_url="http://localhost:3333", token="your-token")

    # Store and query
    await client.add("agent-1", "User prefers dark mode")
    results = await client.query("agent-1", q="user preferences", mode="hybrid")

    # ConversationMemory adapter for chat agents
    memory = ConversationMemory(client, agent_id="agent-1")
    session_id = await memory.start_session()
    await memory.add_turn("user", "What layout do I prefer?")
    context = await memory.get_context("layout preferences")
    await memory.end_session(session_id)

asyncio.run(main())
```

See [INTEGRATION.md](INTEGRATION.md) for the full Python SDK reference and framework examples.

### Path 3: TypeScript SDK

```bash
npm install @salishforge/memforge
```

```typescript
import { ResilientMemForgeClient } from '@salishforge/memforge/client';

const memory = new ResilientMemForgeClient({
  baseUrl: 'http://localhost:3333',
  token: process.env.MEMFORGE_TOKEN,
});

await memory.add('agent-1', 'User prefers dark mode');
const results = await memory.query('agent-1', { q: 'preferences', mode: 'hybrid' });
const ctx = await memory.resume('agent-1');  // warm-start context bundle
```

### Platform Integrations

| Platform | Setup | Guide |
|----------|-------|-------|
| **Claude Desktop** | Add MCP config → 16 memory tools available | [Setup guide](plugins/claude-desktop/README.md) · [Tool reference](plugins/claude-desktop/TOOLS.md) |
| **Microsoft 365 Copilot** | API plugin, Power Automate, or Copilot Studio | [Setup guide](plugins/m365-copilot/README.md) · [Tool reference](plugins/m365-copilot/TOOLS.md) |
| **ChatGPT** | Plugin manifest at `/api/spec.json` | [ai-plugin.json](public/ai-plugin.json) |
| **LangChain / CrewAI** | Python SDK adapters | [Examples](examples/) |
| **OpenAI / Anthropic** | Function calling tool definitions | [openai_tools.py](examples/openai_tools.py) · [claude_tools.py](examples/claude_tools.py) |

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **PostgreSQL** 16+ with `pgvector` and `pg_trgm` extensions
- **Redis** (optional — degrades gracefully if unavailable)

### Install & Run

```bash
git clone https://github.com/salishforge/memforge.git
cd memforge
npm install
cp .env.example .env  # edit DATABASE_URL at minimum

# Apply database schema (fresh install — all 21 tables, no migrations needed)
psql "$DATABASE_URL" -f schema/schema.sql

# If upgrading an existing deployment, apply migrations in order instead:
# psql "$DATABASE_URL" -f schema/migration-v2.2.sql
# psql "$DATABASE_URL" -f schema/migration-v2.3.sql
# psql "$DATABASE_URL" -f schema/migration-v2.4.sql
# psql "$DATABASE_URL" -f schema/migration-v2.6.sql
# psql "$DATABASE_URL" -f schema/migration-v2.7.sql  # halfvec float16 (requires pgvector 0.5+)

# Optional: local in-process embeddings (no external service needed)
# npm install @xenova/transformers
# Then set EMBEDDING_PROVIDER=local in .env

npm run build
npm start
# → {"level":"info","msg":"memforge listening","port":3333}
```

### Docker

```bash
docker compose up -d
```

## API Reference

All `/memory/*` routes require a Bearer token (`MEMFORGE_TOKEN` env var).

### Memory Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/memory/:agentId/add` | Store a memory event in the hot tier |
| GET | `/memory/:agentId/query?q=...` | Search warm-tier memory (keyword/semantic/hybrid) |
| POST | `/memory/:agentId/consolidate` | Trigger hot→warm consolidation |
| GET | `/memory/:agentId/timeline` | Retrieve memories in chronological order |
| GET | `/memory/:agentId/stats` | Memory tier statistics |
| POST | `/memory/:agentId/clear` | Archive all memory to cold tier |
| POST | `/memory/:agentId/hints` | Submit retrieval hints (keywords, entities, temporal anchors) |
| GET | `/memory/:agentId/resume` | Get context bundle for agent warm-start |
| GET | `/memory/:agentId/export` | Export all memories as JSONL |
| POST | `/memory/:agentId/import` | Bulk import memories from JSONL |
| GET | `/memory/:agentId/conflicts` | List detected memory conflicts |

### Knowledge Graph

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/memory/:agentId/entities` | Search knowledge graph entities |
| GET | `/memory/:agentId/graph?entity=...` | Traverse graph from an entity |
| POST | `/memory/:agentId/dedup-entities` | Merge duplicate entities |

### Reflection & Learning

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/memory/:agentId/reflect` | Trigger LLM reflection on recent memories |
| GET | `/memory/:agentId/reflections` | Retrieve stored reflections |
| POST | `/memory/:agentId/meta-reflect` | Second-order reflection on reflections |
| GET | `/memory/:agentId/procedures` | Retrieve learned condition→action rules |

### Sleep Cycle & Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/memory/:agentId/sleep` | Trigger a full sleep cycle |
| GET | `/memory/:agentId/health` | Memory health metrics |
| POST | `/memory/:agentId/feedback` | Record retrieval outcome feedback |
| POST | `/memory/:agentId/active-recall` | Proactively surface relevant memories |

### System & Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| GET | `/metrics` | Prometheus metrics |
| GET | `/api/docs` | Redirects to `/api/spec.json` |
| GET | `/api/spec.json` | OpenAPI 3.0 spec |
| GET | `/admin/cache/stats` | Cache hit/miss statistics |
| POST | `/admin/cache/clear` | Flush Redis cache |
| GET | `/admin/cache/dashboard` | Live cache monitoring UI |

### Query Parameters

**Search** (`/query`):
- `q` — Search text (required)
- `limit` — Max results, 1-200 (default 10)
- `mode` — `keyword`, `semantic`, or `hybrid` (default: hybrid if embeddings enabled)
- `after` / `before` — ISO 8601 time bounds
- `decay` — Temporal decay rate per hour
- `rerank` — `true` to enable LLM post-retrieval reranking (requires `ENABLE_LLM_RERANK=true`)

**Timeline** (`/timeline`):
- `from` / `to` — ISO 8601 time range
- `limit` — Max results, 1-500 (default 50)

### Request/Response Format

All responses use `{ ok: true, data: ... }` on success and `{ ok: false, error: "..." }` on failure.

```bash
# Add a memory
curl -X POST http://localhost:3333/memory/agent-1/add \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "User prefers dark mode and compact layouts"}'

# Search memories
curl "http://localhost:3333/memory/agent-1/query?q=user+preferences&mode=hybrid" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN"

# Trigger sleep cycle
curl -X POST http://localhost:3333/memory/agent-1/sleep \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tokenBudget": 50000}'

# Active recall before an action
curl -X POST http://localhost:3333/memory/agent-1/active-recall \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"context": "About to modify the user dashboard layout"}'
```

## Architecture

```
                    ┌─────────┐
                    │ Hot Tier │  Raw events (write-heavy)
                    └────┬────┘
                         │ consolidate (concat or LLM summarize)
                    ┌────▼────┐
                    │Warm Tier│  Searchable, scored, embedded
                    └────┬────┘
          ┌──────────────┼──────────────┐
          │              │              │
    ┌─────▼─────┐  ┌────▼────┐  ┌──────▼──────┐
    │ Knowledge │  │Retrieval│  │  Reflection  │
    │   Graph   │  │   Log   │  │   Engine     │
    └───────────┘  └─────────┘  └──────┬───────┘
                                       │
                                ┌──────▼──────┐
                                │  Procedural  │
                                │   Memory     │
                                └──────────────┘

    Sleep Cycle (background):
    Phase 0:   Pre-flight — refresh staleness scores
    Phase 1:   Score importance (SQL, weight adaptation)
    Phase 2:   Triage — evict low-value, flag for revision
    Phase 2.5: Conflict resolution — multi-factor scoring
    Phase 3:   Revise — LLM rewrites flagged memories
    Phase 4:   Graph maintenance + entity deduplication
    Phase 4b:  Temporal chains — link adjacent memories
    Phase 5:   Reflection — synthesize insights
    Phase 5.5: Schema detection — crystallize patterns
    Phase 5b:  Meta-reflection
    Phase 6:   Gap analysis — record knowledge gaps
```

### Sleep Cycles

Sleep cycles are MemForge's primary differentiator. Inspired by complementary learning systems theory, they actively improve memory quality during idle periods:

0. **Pre-flight** — Refresh staleness scores; auto-reduce confidence on stale memories
1. **Scoring** — Composite importance from recency, frequency, centrality, reflection count, and revision stability; adapt weights based on retrieval outcome correlation
2. **Triage** — Evict memories below importance threshold to cold tier; flag low-confidence for revision
3. **Conflict Resolution** (Phase 2.5) — Multi-factor scoring resolves contradictions; pairs recorded in `memory_conflicts`
4. **Revision** — LLM reviews flagged memories with context (entities, retrieval history, neighbors). High-`surprise_score` memories processed first (prioritized experience replay).
5. **Graph Maintenance** — Decay stale relationship edges; deduplicate similar entities
6. **Temporal Chains** (Phase 4b) — Link temporally adjacent memories in `memory_sequences`
7. **Reflection** — Synthesize insights from the revised knowledge base; extract procedural rules
8. **Schema Detection** (Phase 5.5) — Crystallize repeated temporal patterns as `entity_type='schema'` entities
9. **Meta-Reflection** (Phase 5b) — Second-order reflection on accumulated first-order reflections
10. **Gap Analysis** (Phase 6) — Record zero-result query patterns in `knowledge_gaps`

Each phase respects a token budget to control LLM costs.

## MCP Integration

MemForge ships as an MCP server with 17 tools. Add to Claude Code:

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "memforge": {
      "command": "npx",
      "args": ["memforge-mcp"],
      "env": {
        "MEMFORGE_URL": "http://localhost:3333",
        "MEMFORGE_TOKEN": "your-token"
      }
    }
  }
}
```

Available tools: `memforge_add`, `memforge_query`, `memforge_timeline`, `memforge_entities`, `memforge_graph`, `memforge_reflect`, `memforge_reflections`, `memforge_consolidate`, `memforge_procedures`, `memforge_sleep`, `memforge_health`, `memforge_stats`, `memforge_feedback`, `memforge_meta_reflect`, `memforge_dedup_entities`, `memforge_active_recall`.

## TypeScript SDK

```typescript
import { MemForgeClient } from '@salishforge/memforge/client';

const client = new MemForgeClient({
  baseUrl: 'http://localhost:3333',
  token: 'your-token',
});

// Store memories
await client.add('agent-1', 'User requested dark mode');
await client.add('agent-1', 'Deployed v2.3.0 to production');

// Consolidate
await client.consolidate('agent-1', 'summarize');

// Search
const results = await client.query('agent-1', { q: 'deployment', mode: 'hybrid' });

// Reflect
await client.reflect('agent-1');

// Sleep cycle
const sleepResult = await client.sleep('agent-1', { tokenBudget: 50000 });

// Active recall
const context = await client.activeRecall('agent-1', 'About to deploy v2.4.0');

// Feedback loop
await client.feedback('agent-1', [retrievalId], 'positive', ['task_completed']);

// Meta-reflection
await client.metaReflect('agent-1');

// Submit retrieval hints
await client.hints('agent-1', { keywords: ['dark mode', 'layout'], entities: ['dashboard'] });

// Warm-start context bundle
const resume = await client.resume('agent-1');
```

## LLM Tool Definitions

For direct LLM function calling (without MCP):

```typescript
import { tools, toOpenAITools } from '@salishforge/memforge/tools';

// Anthropic tool_use format
const response = await anthropic.messages.create({ tools, ... });

// OpenAI function calling format
const response = await openai.chat.completions.create({
  tools: toOpenAITools(), ...
});
```

## Benchmark Results

MemForge is evaluated on [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025) — a 500-question benchmark measuring session-level recall across multi-session and temporal reasoning tasks.

### LongMemEval — Hybrid Mode (v2.2.0, recommended)

| Metric | Score |
|--------|-------|
| Recall@1 | 81.0% |
| Recall@3 | 90.8% |
| Recall@5 | **93.2%** |
| Recall@10 | 96.4% |

**Per-category breakdown:**

| Category | R@5 | R@10 |
|----------|-----|------|
| single-session-assistant | 100.0% | 100.0% |
| knowledge-update | 97.4% | 100.0% |
| multi-session | 96.2% | 98.5% |
| temporal-reasoning | 91.0% | 94.7% |
| single-session-user | 87.1% | 90.0% |
| single-session-preference | 80.0% | 93.3% |

**Latency:** p50 32 ms, p95 47 ms per query (hybrid mode, local PostgreSQL).

Configuration: concat consolidation, `EMBEDDING_PROVIDER=local`, `KEYWORD_OVERLAP_BOOST=0.3`, `TEMPORAL_PROXIMITY_DAYS=7`.

### LongMemEval — Keyword Mode (v2.2.0, no embedding provider needed)

| Metric | Score |
|--------|-------|
| Recall@1 | 33.4% |
| Recall@3 | 34.6% |
| Recall@5 | **35.0%** |
| Recall@10 | 35.0% |

**Latency:** p50 39 ms, p95 50 ms per query (keyword mode, local PostgreSQL).

Configuration: concat consolidation, `KEYWORD_OVERLAP_BOOST=0.3`, `TEMPORAL_PROXIMITY_DAYS=7`. See [`benchmarks/RESULTS.md`](benchmarks/RESULTS.md) for full methodology.

## Configuration

See `.env.example` for the full list. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | required | PostgreSQL connection string |
| `MEMFORGE_TOKEN` | required | Bearer token for `/memory/*` routes |
| `PORT` | `3333` | HTTP listen port |
| `REDIS_URL` | `redis://localhost:6379` | Redis URL (optional) |
| `EMBEDDING_PROVIDER` | `none` | `local`, `openai`, `ollama`, or `none`. `local` runs in-process (zero external dependency). |
| `EMBEDDING_MODEL` | provider default | Embedding model override. Default for `local`: `Xenova/bge-small-en-v1.5`. |
| `EMBEDDING_DIMENSIONS` | provider default | Output dimensions override (required if model differs from default). |
| `EMBEDDING_CONCURRENCY_LIMIT` | `3` | Max parallel requests for external embedding providers (Ollama, OpenAI). |
| `LLM_PROVIDER` | `none` | `anthropic`, `openai`, `ollama`, or `none` |
| `CONSOLIDATION_MODE` | `concat` | `concat` (fast) or `summarize` (LLM) |
| `CONSOLIDATION_INNER_BATCH_SIZE` | `50` | Hot-tier rows per consolidation batch |
| `TEMPORAL_DECAY_RATE` | `0` | Decay rate per hour (0 = disabled) |
| `KEYWORD_OVERLAP_BOOST` | `0.3` | Score boost when query tokens overlap memory keywords |
| `TEMPORAL_PROXIMITY_DAYS` | `7` | Days window for temporal proximity scoring boost |
| `ENABLE_LLM_RERANK` | `false` | Enable LLM post-retrieval reranking |
| `ENABLE_LLM_INGEST` | `false` | Enable LLM entity/tag extraction at ingest time |
| `REVISION_LLM_PROVIDER` | (uses LLM_PROVIDER) | Separate LLM for sleep cycle revisions |
| `SLEEP_CYCLE_TOKEN_BUDGET` | `100000` | Max tokens per sleep cycle |
| `AUDIT_HMAC_KEY` | required in prod | HMAC key for audit chain integrity verification |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `DB_POOL_MAX` | `10` | PostgreSQL connection pool size |
| `RATE_LIMIT_MAX` | `100` | Requests per minute per IP (0 = disabled) |
| `ADMIN_TOKEN` | (open) | Bearer token for `/admin/*` routes |
| `OAUTH2_REQUIRED` | `false` | Require OAuth2 JWT on all `/memory/*` routes |
| `WEBHOOK_URL` | — | URL to POST event payloads to (optional) |
| `WEBHOOK_EVENTS` | (all) | Comma-separated event filter: `consolidated`, `revised`, `reflected`, `evicted`, `graduated` |

## Scheduling Sleep Cycles

Sleep cycles require external triggering — they don't run automatically. Recommended approaches:

### Cron Job

```bash
# Run every 6 hours for each agent
0 */6 * * * curl -X POST http://localhost:3333/memory/agent-1/sleep \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tokenBudget": 100000}'
```

### MCP Tool (Claude Code)

Ask Claude to run a sleep cycle during conversation idle time:

```
"Run a sleep cycle for agent-1 to consolidate and revise memories"
```

Claude will call `memforge_sleep` via MCP. You can also use meta-reflection:

```
"Run a meta-reflection for agent-1 to synthesize higher-order patterns"
```

### Idle-Detection Webhook

If your agent framework supports idle callbacks, trigger sleep on inactivity:

```typescript
import { MemForgeClient } from '@salishforge/memforge/client';

const client = new MemForgeClient();

agent.onIdle(async (agentId, idleMs) => {
  if (idleMs > 5 * 60_000) { // 5 minutes idle
    await client.sleep(agentId, { tokenBudget: 50000 });
  }
});
```

### Claude Code Hook

Add to your project's `.claude/settings.json` to run sleep cycles after long sessions:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Task",
        "command": "curl -s -X POST http://localhost:3333/memory/$AGENT_ID/sleep -H 'Authorization: Bearer $MEMFORGE_TOKEN' -H 'Content-Type: application/json' -d '{\"tokenBudget\":50000}'"
      }
    ]
  }
}
```

### Recommended Cadence

| Workload | Sleep Frequency | Token Budget | Meta-Reflection |
|----------|----------------|--------------|-----------------|
| Light (< 100 memories/day) | Every 12 hours | 50,000 | Weekly |
| Moderate (100-1000/day) | Every 6 hours | 100,000 | Every 2-3 days |
| Heavy (1000+/day) | Every 2 hours | 200,000 | Daily |

## Redis Caching

MemForge caches hot-path queries in Redis with automatic invalidation on writes.

| Tier | Routes | TTL |
|------|--------|-----|
| Hot (stats) | `/memory/:id/stats` | 5 min |
| Search | `/memory/:id/query`, `/timeline` | 10 min |

Cache key format: `memforge:{agentId}:{sha256(query+limit)[0:12]}`

All write operations (`/add`, `/consolidate`, `/sleep`, etc.) immediately invalidate the affected agent's cache. If Redis is unavailable, MemForge serves directly from PostgreSQL with no downtime.

Visit `http://localhost:3333/admin/cache/dashboard` for live monitoring.

## Database

PostgreSQL with 21 tables: `agents`, `hot_tier`, `warm_tier`, `cold_tier`, `consolidation_log`, `entities`, `relationships`, `warm_tier_entities`, `reflections`, `retrieval_log`, `memory_revisions`, `procedures`, `memory_conflicts`, `memory_sequences`, `knowledge_gaps`, and 6 additional tables added through v2.7.

Schema: `schema/schema.sql` is the complete 21-table fresh-install schema — a single `psql -f schema/schema.sql` is all new installs need. Incremental migrations in `schema/migration-*.sql` are only required when upgrading an existing deployment.

## Testing

```bash
npm test                  # All tests
npm run test:integration  # Database integration tests (requires PostgreSQL)
npm run test:cache        # Cache tests (requires Redis)
npm run type-check        # TypeScript strict mode check
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for test architecture, coverage gaps, and how to write tests.

## Known Limitations

- **No built-in scheduler** — Sleep cycles must be triggered externally (cron, MCP, webhook). This is by design — see Scheduling section above.
- **Single process** — No clustering or worker threads. Sleep cycles run in the main event loop. For high-throughput deployments, run separate instances for API serving and sleep cycle processing.
- **LLM-dependent features require API keys** — Summarize consolidation, reflection, meta-reflection, sleep cycle revision, and procedural extraction all require an LLM provider. Without one, MemForge still works as a tiered search engine with concat consolidation.
- **No streaming consolidation** — Large hot-tier backlogs (10K+ events) load into memory at once. See [issue #11](https://github.com/salishforge/memforge/issues/11).
- **Limited semantic search test coverage** — Mock LLM tests cover all LLM-dependent paths. Semantic/hybrid search paths still require a live embedding provider; no mock embedding provider exists yet.
- **No HTTPS** — Run behind a TLS-terminating reverse proxy in production. See [SECURITY.md](SECURITY.md).

## Project Documentation

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Quick start, API reference, usage examples |
| [SPECIFICATION.md](SPECIFICATION.md) | Design philosophy, objectives, core tenets |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Internal architecture, data models, module structure |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Developer setup, testing guide, extension points |
| [CLAUDE.md](CLAUDE.md) | Instructions for AI agents working on the codebase |
| [CHANGELOG.md](CHANGELOG.md) | Version history (latest: v3.0.0-beta.3 — RLS in canonical schema, documentation consolidation) |
| [INTEGRATION.md](INTEGRATION.md) | How to wire MemForge into any agent (custom, LangChain, CrewAI, MCP, OpenAI, Anthropic, Python SDK) |
| [ROADMAP.md](ROADMAP.md) | Long-term vision: 5-phase plan from production hardening to autonomous knowledge |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute, code style, PR process |
| [SECURITY.md](SECURITY.md) | Security policy, architecture, hardening checklist |
| [THREAT_MODEL.md](THREAT_MODEL.md) | Comprehensive threat model — attack vectors, bypass techniques, integrity |
| [ADVERSARIAL-ASSESSMENT.md](ADVERSARIAL-ASSESSMENT.md) | Adversarial audit results — 4 rounds, 25 findings |
| [HARDENING-PLAN.md](HARDENING-PLAN.md) | Production hardening checklist and remediation tracking |
| [DEPLOYMENT-SECURITY.md](DEPLOYMENT-SECURITY.md) | Deployment security guide: network, secrets, TLS, RLS, monitoring |
| [benchmarks/RESULTS.md](benchmarks/RESULTS.md) | LongMemEval benchmark results and methodology |
| [LICENSE](LICENSE) | MIT License |

## License

MIT — see [LICENSE](LICENSE) for details.
