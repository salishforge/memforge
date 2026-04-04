# MemForge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Alpha](https://img.shields.io/badge/Status-Alpha-orange.svg)](#project-status)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791.svg)](https://www.postgresql.org)

Neuroscience-inspired memory system for AI agents. Sleep cycles consolidate, revise, and strengthen memories — just like biological brains.

MemForge manages agent memory across three tiers (hot → warm → cold) with vector search, a knowledge graph, LLM-driven reflection, procedural learning, and a memory revision engine that actively improves stored knowledge during idle periods.

> **For AI agents reading this:** See [CLAUDE.md](CLAUDE.md) for project instructions, code conventions, and architecture rules. See [BACKLOG.md](BACKLOG.md) for open issues and improvement areas.

## Project Status

**Alpha** — Architecture is complete, code compiles and passes type-checking and linting, but MemForge has not yet been validated in operation against a live database. Expect bugs in SQL queries, LLM response parsing, and Docker orchestration. The integration test suite exists but requires a running PostgreSQL instance to execute.

We're releasing early because the design is novel and we want feedback on the architecture before investing in production hardening. If the approach resonates, help us get to beta — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [ROADMAP.md](ROADMAP.md).

**What works:** TypeScript compilation, ESLint, type safety, API design, MCP tool definitions, client SDK, documentation.

**What needs validation:** Everything that touches a database, an LLM, or Redis in production.

## Why MemForge?

Most AI memory systems are passive stores — they save and retrieve, but the stored knowledge never improves. MemForge is different:

- **Memories get better over time.** Sleep cycles actively rewrite low-confidence memories using LLM review, producing progressively more accurate knowledge.
- **The system measures its own quality.** Revision stability, retrieval correlation, and contradiction rates tell you whether memory is actually improving — without external benchmarks.
- **Retrieval reinforces memory.** Memories that are frequently accessed and lead to good outcomes become stronger. Unused memories decay naturally.
- **One database does everything.** PostgreSQL handles storage, full-text search, vector similarity, and graph traversal. No Neo4j, no Pinecone, no separate systems to manage.

See [INTEGRATION.md](INTEGRATION.md) for how to wire MemForge into your agent (any framework, any language). See [SPECIFICATION.md](SPECIFICATION.md) for design philosophy and [ARCHITECTURE.md](ARCHITECTURE.md) for internal architecture.

## Features

- **Tiered Memory** — Hot (raw events) → Warm (consolidated, searchable, scored) → Cold (archived audit trail)
- **Hybrid Search** — Keyword (PostgreSQL FTS + trigram), semantic (pgvector HNSW), and reciprocal rank fusion
- **Knowledge Graph** — Entities and relationships extracted during consolidation, traversable via recursive CTEs
- **Sleep Cycles** — 5-phase background processor: scoring → triage → revision → graph maintenance → reflection
- **Memory Revision** — LLM rewrites low-confidence memories (augment, correct, merge, compress)
- **Reflection** — LLM synthesizes higher-order insights and detects contradictions
- **Meta-Reflection** — Second-order reflection on reflections surfaces durable principles
- **Procedural Memory** — Condition→action rules extracted from reflections
- **Outcome Feedback** — Track whether retrieved memories led to good outcomes
- **Active Recall** — Proactively surface relevant memories before agent actions
- **Entity Deduplication** — Trigram-based duplicate entity detection and merge
- **Temporal Intelligence** — Time-bounded queries, decay scoring, timeline view
- **Multi-Tenant** — All operations scoped by agent ID
- **MCP Server** — 17 tools for Claude Code, Cursor, and MCP-compatible AI tools
- **TypeScript SDK** — Zero-dependency HTTP client for any JS runtime

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

# Apply database schema
psql "$DATABASE_URL" -f schema/schema.sql
# If upgrading from v2.0.0:
psql "$DATABASE_URL" -f schema/migration-v2.1.sql

npm run build
npm start
# → [memforge] listening on port 3333
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
| GET | `/api/docs` | Interactive Swagger UI |
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
    Phase 1: Score importance (SQL)
    Phase 2: Triage — evict low-value, flag for revision
    Phase 3: Revise — LLM rewrites flagged memories
    Phase 4: Graph maintenance + entity deduplication
    Phase 5: Reflection — synthesize insights
```

### Sleep Cycles

Sleep cycles are MemForge's primary differentiator. Inspired by complementary learning systems theory, they actively improve memory quality during idle periods:

1. **Scoring** — Composite importance from recency, frequency, centrality, reflection count, and revision stability
2. **Triage** — Evict memories below importance threshold to cold tier; flag low-confidence for revision
3. **Revision** — LLM reviews flagged memories with context (related entities, retrieval history, neighboring memories) and decides to augment, correct, merge, compress, or leave as-is
4. **Graph Maintenance** — Decay stale relationship edges; deduplicate similar entities
5. **Reflection** — If enough revisions occurred, synthesize insights from the revised knowledge base

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
await client.feedback('agent-1', [retrievalId], 'positive');

// Meta-reflection
await client.metaReflect('agent-1');
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

## Configuration

See `.env.example` for the full list. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | required | PostgreSQL connection string |
| `MEMFORGE_TOKEN` | required | Bearer token for `/memory/*` routes |
| `PORT` | `3333` | HTTP listen port |
| `REDIS_URL` | `redis://localhost:6379` | Redis URL (optional) |
| `EMBEDDING_PROVIDER` | `none` | `openai`, `ollama`, or `none` |
| `LLM_PROVIDER` | `none` | `anthropic`, `openai`, `ollama`, or `none` |
| `CONSOLIDATION_MODE` | `concat` | `concat` (fast) or `summarize` (LLM) |
| `TEMPORAL_DECAY_RATE` | `0` | Decay rate per hour (0 = disabled) |
| `REVISION_LLM_PROVIDER` | (uses LLM_PROVIDER) | Separate LLM for sleep cycle revisions |
| `SLEEP_CYCLE_TOKEN_BUDGET` | `100000` | Max tokens per sleep cycle |
| `RATE_LIMIT_MAX` | `100` | Requests per minute per IP (0 = disabled) |
| `ADMIN_TOKEN` | (open) | Bearer token for `/admin/*` routes |

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

PostgreSQL with 12 tables: `agents`, `hot_tier`, `warm_tier`, `cold_tier`, `consolidation_log`, `entities`, `relationships`, `warm_tier_entities`, `reflections`, `retrieval_log`, `memory_revisions`, `procedures`.

Schema: `schema/schema.sql` + incremental migrations in `schema/migration-*.sql`.

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
- **No streaming consolidation** — Large hot-tier backlogs (10K+ events) load into memory at once. See [BACKLOG.md](BACKLOG.md) issue #6.
- **Cold tier grows indefinitely** — No retention policy or hard deletion. Archived memories accumulate forever.
- **No unit tests for LLM paths** — Integration tests cover CRUD operations but LLM-dependent codepaths (summarize, reflect, revise) need mocked provider tests. See [BACKLOG.md](BACKLOG.md) issue #1.
- **No HTTPS** — Run behind a TLS-terminating reverse proxy in production. See [SECURITY.md](SECURITY.md).

## Project Documentation

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Quick start, API reference, usage examples |
| [SPECIFICATION.md](SPECIFICATION.md) | Design philosophy, objectives, core tenets |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Internal architecture, data models, module structure |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Developer setup, testing guide, extension points |
| [CLAUDE.md](CLAUDE.md) | Instructions for AI agents working on the codebase |
| [CHANGELOG.md](CHANGELOG.md) | Version history from v1.0.0 to v2.1.0 |
| [INTEGRATION.md](INTEGRATION.md) | How to wire MemForge into any agent (custom, LangChain, CrewAI, MCP, OpenAI, Anthropic) |
| [ROADMAP.md](ROADMAP.md) | Long-term vision: 5-phase plan from production hardening to autonomous knowledge |
| [BACKLOG.md](BACKLOG.md) | Open issues, improvements, and challenges (17 items) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute, code style, PR process |
| [SECURITY.md](SECURITY.md) | Security policy, architecture, hardening checklist |
| [THREAT_MODEL.md](THREAT_MODEL.md) | Comprehensive threat model — attack vectors, bypass techniques, integrity |
| [LICENSE](LICENSE) | MIT License |

## License

MIT — see [LICENSE](LICENSE) for details.
