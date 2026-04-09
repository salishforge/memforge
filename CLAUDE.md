# MemForge — Project Instructions for AI Agents

This file provides complete context for AI agents (Claude Code, Cursor, etc.) working on this codebase. Reading this file alone should be sufficient to understand the system.

## Section 1: What This Project Is

MemForge is a neuroscience-inspired memory system for AI agents. It provides:

- **Tiered storage** — Hot (raw events) → Warm (consolidated, searchable, scored) → Cold (archived audit trail)
- **Hybrid retrieval** — Dual-tokenizer FTS, pgvector HNSW semantic search, reciprocal rank fusion, keyword overlap boost, temporal proximity scoring
- **Knowledge graph** — Entities and relationships extracted during consolidation, traversable via recursive CTEs in PostgreSQL
- **Sleep cycles** — 10-phase background processor that actively revises and improves stored knowledge during idle periods
- **Active ingest** — Hints API, preference extraction, entity detection, supersession. Agents participate in their own memory management.
- **Active Knowledge Management** — Staleness detection, conflict resolution, knowledge gap tracking, schema crystallization, prioritized experience replay, temporal event chains
- **LLM opt-in** — Post-retrieval reranking and LLM-assisted ingest available but disabled by default
- **Export/import** — Full memory export as JSONL, bulk import from JSONL
- **Webhooks** — Event-driven notifications for consolidated/revised/reflected/evicted/graduated events

MemForge is a standalone HTTP service. Agents connect via REST API, TypeScript SDK, Python SDK, or MCP tools.

**Key design documents:**
- [INTEGRATION.md](INTEGRATION.md) — How to wire MemForge into any agent (REST, SDK, MCP, LangChain, CrewAI, etc.)
- [SPECIFICATION.md](SPECIFICATION.md) — Design philosophy, objectives, and core tenets
- [ARCHITECTURE.md](ARCHITECTURE.md) — Internal architecture, data models, module structure
- [DEVELOPMENT.md](DEVELOPMENT.md) — Setup, testing, extension points, configuration reference
- [CHANGELOG.md](CHANGELOG.md) — Version history

## Section 2: Quick Start for AI Agents

### Deploy

**Docker standalone (single container — no separate Postgres/Redis needed):**
```bash
docker run -p 3333:3333 salishforge/memforge:standalone
```

**Docker Compose (recommended for production):**
```bash
cp .env.docker .env   # set POSTGRES_PASSWORD, MEMFORGE_TOKEN, ADMIN_TOKEN
docker compose up -d
```

**Manual:**
```bash
npm install
cp .env.example .env   # set DATABASE_URL at minimum
psql "$DATABASE_URL" -f schema/schema.sql
npm run build && npm start
# → {"level":"info","msg":"memforge listening","port":3333}
```

Node.js 22+ required. PostgreSQL 16 with `pgvector` 0.5+ (halfvec float16) and `pg_trgm` extensions required. Redis is optional.

### Integrate

**REST API (any language):**
```bash
curl -X POST http://localhost:3333/memory/agent-1/add \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "User prefers dark mode"}'

curl "http://localhost:3333/memory/agent-1/query?q=user+preferences" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN"
```

**TypeScript SDK:**
```typescript
import { ResilientMemForgeClient } from '@salishforge/memforge/client';
const memory = new ResilientMemForgeClient({ baseUrl: 'http://localhost:3333', token: '...' });
await memory.add('agent-1', 'User prefers dark mode');
const results = await memory.query('agent-1', { q: 'preferences', mode: 'hybrid' });
const ctx = await memory.resume('agent-1');  // warm-start context bundle
```

**Python SDK:**
```python
from memforge import MemForgeClient, ConversationMemory

# Direct client
client = MemForgeClient(base_url="http://localhost:3333", token="...")
await client.add("agent-1", "User prefers dark mode")
results = await client.query("agent-1", q="preferences", mode="hybrid")

# ConversationMemory adapter — wraps add/query into a chat-friendly interface
memory = ConversationMemory(client, agent_id="agent-1")
await memory.add_turn("user", "Hello, I prefer dark mode")
context = await memory.get_context("current topic")
```

**MCP (Claude Code / Cursor):**
```json
{ "mcpServers": { "memforge": { "command": "npx", "args": ["memforge-mcp"],
  "env": { "MEMFORGE_URL": "http://localhost:3333", "MEMFORGE_TOKEN": "your-token" } } } }
```

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/memory/:id/add` | Store event in hot tier |
| GET | `/memory/:id/query?q=` | Search warm tier |
| POST | `/memory/:id/consolidate` | Hot→warm consolidation |
| GET | `/memory/:id/timeline` | Chronological retrieval |
| POST | `/memory/:id/sleep` | Run full sleep cycle |
| GET | `/memory/:id/health` | Memory health metrics |
| POST | `/memory/:id/reflect` | LLM reflection |
| POST | `/memory/:id/active-recall` | Proactive context surfacing |
| POST | `/memory/:id/hints` | Submit retrieval hints (v2.2.0) |
| GET | `/memory/:id/resume` | Warm-start context bundle (v2.2.0) |
| POST | `/memory/:id/feedback` | Record outcome feedback |
| GET | `/memory/:id/stats` | Tier statistics |
| GET | `/memory/:id/export` | Export all memories as JSONL (v2.6.0) |
| POST | `/memory/:id/import` | Bulk import memories from JSONL (v2.6.0) |
| GET | `/memory/:id/conflicts` | List detected memory conflicts (v2.6.0) |

All `/memory/*` routes require `Authorization: Bearer <MEMFORGE_TOKEN>`.
All responses: `{ ok: true, data: ... }` or `{ ok: false, error: "..." }`.

## Section 3: Tech Stack

| Component | Version | Notes |
|-----------|---------|-------|
| Language | TypeScript 5.7 | Strict mode, ES modules (NodeNext) |
| Runtime | Node.js 22+ | |
| Database | PostgreSQL 16 | `pgvector` 0.5+ (halfvec float16, 2x compression) + `pg_trgm` extensions required |
| Cache | Redis 7 | Optional — graceful degradation |
| Framework | Express 4 | |
| Logging | pino | Structured JSON, request correlation IDs |
| Validation | Zod | All request bodies and query params validated at boundary |
| SQL | raw `pg` | No ORM — parameterized queries only |

## Section 4: Architecture Overview

### Storage: Tiered Memory

```
Hot Tier  ──► Warm Tier  ──► Cold Tier
(hot_tier)   (warm_tier)   (cold_tier)
raw events   consolidated,  archived,
             searchable,    audit trail
             scored
```

Hot tier fills on every `add()` call. Consolidation (concat or LLM summarize) produces warm-tier rows with embeddings, importance scores, and knowledge graph links. Clear/archival moves all tiers to cold.

### Retrieval Pipeline

```
Raw query text
  ├─► Query preprocessing
  │     ├─► strip question scaffolding ("what is", "tell me about", …)
  │     ├─► extract time references (yesterday, last week → after/before filters)
  │     └─► compound query splitting (at conjunctions → up to 3 sub-queries)
  │
  └─► Per sub-query (multi-query retrieval, results merged by highest rank)
        ├─► plainto_tsquery (FTS)        ─┐
        ├─► websearch_to_tsquery (FTS)    ├─► asymmetric RRF (semantic 1.5×)
        └─► pgvector HNSW (semantic,      ─┘
              halfvec float16 — 2x storage compression)
              ─► result dedup (first 100 chars fingerprint)
              ─► min quality threshold (≥10% of top score)
              ─► entity detection boost (terms in knowledge graph)
              ─► keyword overlap boost
              ─► temporal proximity boost
              ─► importance × score
              ─► term-memory affinity (query terms → memory associations)
              ─► [optional LLM rerank]
              ─► top-k results
```

Query preprocessing normalises natural-language phrasing and auto-applies time filters. Compound queries are split at conjunctions and run as independent sub-queries, with results merged by best rank (up to 3 sub-queries). Asymmetric RRF weights semantic results 1.5× higher than keyword to improve precision in hybrid mode. Result deduplication and a minimum quality threshold prevent noise from polluting top-k results. Configurable boosts tune scoring per deployment.

### Active Ingest

Active ingest (v2.2.0) lets agents participate in their own memory management:

1. **Hints API** — Submit keywords/entities/temporal anchors that bias retrieval without writing a memory.
2. **Preference extraction** — Auto-extracted from content during consolidation when `ENABLE_LLM_INGEST=true`.
3. **Entity detection** — Heuristic pre-screening before LLM calls reduces unnecessary API usage.
4. **Supersession** — New memories can mark prior memories stale, propagating confidence decay.

### Sleep Cycle (10 Phases)

Triggered externally (cron, MCP, idle webhook). Runs within a single PostgreSQL advisory lock per agent.

| Phase | Name | Description |
|-------|------|-------------|
| 0 | Pre-flight | Refresh staleness scores; auto-reduce confidence on stale memories |
| 1 | Scoring | Recalculate composite importance: `f(recency, frequency, centrality, reflection_count, revision_stability)`. Adapt weights based on retrieval outcome correlation. |
| 2 | Triage | Evict below-threshold memories to cold tier; flag low-confidence for revision |
| 2.5 | Conflict Resolution | Multi-factor conflict scoring (supersession → corroboration → temporal → confidence); resolve pairs recorded in `memory_conflicts` |
| 3 | Revision | LLM reviews flagged memories with context (entities, retrieval history, neighbors). High-`surprise_score` memories processed first (prioritized experience replay). Decisions: augment, correct, merge, compress, or leave. |
| 4 | Graph Maintenance | Decay stale edges, deduplicate similar entities (trigram similarity) |
| 4b | Temporal Chains | Link temporally adjacent memories in `memory_sequences` table |
| 5 | Reflection | Synthesize insights from revised knowledge base; extract procedural rules |
| 5.5 | Schema Detection | Crystallize repeated temporal patterns as `entity_type='schema'` entries |
| 5b | Meta-Reflection | Second-order reflection when sufficient first-order reflections have accumulated |
| 6 | Gap Analysis | Record zero-result query patterns in `knowledge_gaps` table; include in health metrics |

Each phase respects a configurable token budget (`SLEEP_CYCLE_TOKEN_BUDGET`).

### Active Knowledge Management

Six features that keep memories accurate and current between sleep cycles:

| Feature | Mechanism | Effect |
|---------|-----------|--------|
| **Staleness detection** | `staleness_score` computed in Phase 0 based on age, corroboration, and access patterns | Confidence auto-decays on stale memories; `health()` reports `stale_memory_count` and `avg_staleness` |
| **Prioritized experience replay** | `surprise_score` tracked on negative-after-positive feedback transitions | Phase 3 revision processes high-surprise memories first |
| **Conflict resolution** | Phase 2.5 multi-factor scoring: supersession → corroboration → temporal → confidence | Winner marked in `memory_conflicts`; loser confidence decayed |
| **Temporal event chains** | Phase 4b links temporally adjacent warm-tier memories | `memory_sequences` table enables causal chain queries |
| **Knowledge gap detection** | Zero-result queries recorded in `knowledge_gaps` table | `health()` reports `knowledge_gap_count_7d`; gaps deduped + 1000/agent cap |
| **Schema detection** | Phase 5.5 detects repeated temporal patterns | Patterns crystallized as `entity_type='schema'` knowledge graph entries |

### Knowledge Graph

Entities stored in `entities` table; relationships in `relationships` table with `valid_from`/`valid_until` for temporal validity. Graph traversal uses recursive CTEs — no external graph database. Entity dedup uses trigram similarity (`pg_trgm`).

### Logging and Observability

All log output is structured JSON via pino. Request correlation IDs (`X-Request-Id`) propagate through all log entries. Prometheus metrics at `/metrics`. Swagger UI at `/api/docs`.

## Section 5: Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/memory-manager.ts` | ~2,727 | Core API — all memory operations |
| `src/app.ts` | ~995 | Express app factory (`createApp()`) — all routes, middleware, validation |
| `src/sleep-cycle.ts` | ~872 | Sleep cycle engine (10 phases) |
| `src/server.ts` | ~121 | Thin bootstrap — creates providers, calls `createApp()`, binds port |
| `src/types.ts` | ~435 | All TypeScript interfaces |
| `src/client.ts` | ~374 | HTTP client SDK (`MemForgeClient`, `ResilientMemForgeClient`) |
| `src/mcp.ts` | ~484 | MCP server (17 tools, stdio transport, no external SDK) |
| `src/llm.ts` | ~334 | LLM providers + system prompts |
| `src/schemas.ts` | ~145 | Zod schemas for all request validation |
| `src/logger.ts` | ~75 | Pino logger + request correlation ID middleware |
| `src/tool-definitions.ts` | ~236 | LLM tool definitions (Anthropic + OpenAI formats) |
| `src/openapi.ts` | ~409 | OpenAPI 3.0 spec |
| `src/embedding.ts` | ~295 | Embedding providers (local in-process, Ollama, OpenAI, concurrency limiter) |
| `src/db.ts` | ~70 | PostgreSQL pool setup |
| `schema/schema.sql` | ~230 | Canonical "from scratch" schema (12 tables) |
| `python/python/memforge/client.py` | ~268 | Python SDK — `MemForgeClient` (18 async methods) |
| `python/python/memforge/resilient.py` | ~174 | Python SDK — `ResilientMemForgeClient` (graceful degradation) |
| `python/python/memforge/conversation.py` | ~150 | Python SDK — `ConversationMemory` adapter |
| `python/python/memforge/tools.py` | ~152 | Python SDK — tool definitions for OpenAI + Anthropic |
| `Dockerfile.standalone` | — | Single-container image with embedded PostgreSQL |

## Section 6: Configuration Reference

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `MEMFORGE_TOKEN` | Bearer token for `/memory/*` routes |

### LLM Providers

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `none` | `anthropic`, `openai`, `ollama`, or `none` |
| `ANTHROPIC_API_KEY` | — | Required when `LLM_PROVIDER=anthropic` |
| `OPENAI_API_KEY` | — | Required when `LLM_PROVIDER=openai` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL |
| `LLM_MODEL` | provider default | Model name override |
| `REVISION_LLM_PROVIDER` | (uses `LLM_PROVIDER`) | Separate provider for sleep cycle revisions |
| `EMBEDDING_PROVIDER` | `none` | `local`, `openai`, `ollama`, or `none`. `local` uses in-process @xenova/transformers (zero external dependency). |
| `EMBEDDING_MODEL` | provider default | Embedding model name override. Default for `local`: `Xenova/bge-small-en-v1.5`. |
| `EMBEDDING_DIMENSIONS` | provider default | Override output embedding dimensions (required if model differs from default). |
| `EMBEDDING_CONCURRENCY_LIMIT` | `3` | Max parallel in-flight requests for external embedding providers (Ollama, OpenAI). Fixes request pileup under load. |
| `CONSOLIDATION_MODE` | `concat` | `concat` (fast) or `summarize` (LLM) |

### Retrieval Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `KEYWORD_OVERLAP_BOOST` | `0.3` | Score boost when query tokens overlap memory keywords |
| `TEMPORAL_PROXIMITY_DAYS` | `7` | Days window for temporal proximity boost |
| `CONSOLIDATION_INNER_BATCH_SIZE` | `50` | Hot-tier rows per inner consolidation batch |
| `TEMPORAL_DECAY_RATE` | `0` | Score decay per hour (0 = disabled) |

### LLM Opt-In

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_LLM_RERANK` | `false` | LLM post-retrieval reranking of top-k results |
| `ENABLE_LLM_INGEST` | `false` | LLM entity/tag extraction at write time |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_TOKEN` | (open) | Bearer token for `/admin/*` routes |
| `AUDIT_HMAC_KEY` | — | HMAC key for audit chain integrity (required in production) |
| `OAUTH2_REQUIRED` | `false` | Require OAuth2 JWT on `/memory/*` routes |
| `OAUTH2_JWKS_URI` | — | JWKS endpoint URI when `OAUTH2_REQUIRED=true` |
| `OAUTH2_AUDIENCE` | — | Expected JWT audience when `OAUTH2_REQUIRED=true` |
| `ALLOWED_LLM_HOSTS` | (none) | Allowlist for outbound LLM/embedding hosts (SSRF prevention) |

### Webhooks

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_URL` | — | URL to POST event payloads to (optional) |
| `WEBHOOK_EVENTS` | (all) | Comma-separated event filter: `consolidated`, `revised`, `reflected`, `evicted`, `graduated` |

Webhook payloads are `POST`ed as JSON: `{ event, agentId, data, timestamp }`.

### Operations

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3333` | HTTP listen port |
| `LOG_LEVEL` | `info` | Pino log level: `trace`, `debug`, `info`, `warn`, `error` |
| `REDIS_URL` | `redis://localhost:6379` | Redis URL (optional) |
| `DB_POOL_MAX` | `10` | PostgreSQL connection pool size |
| `RATE_LIMIT_MAX` | `100` | Requests per minute per IP (0 = disabled) |
| `SLEEP_CYCLE_TOKEN_BUDGET` | `100000` | Max tokens per sleep cycle |

## Section 7: Code Conventions

- **All SQL uses parameterized queries** — never interpolate user input
- **All operations scoped by agentId** — multi-tenant isolation is mandatory
- **Types are in `src/types.ts`** — shared interfaces, no inline type definitions
- **Validation in `src/schemas.ts`** — Zod schemas for all request bodies and query params
- **No `any` types** — `noUncheckedIndexedAccess` is enabled
- **Error handling**: catch specific errors, return typed error responses with `{ ok: false, error: "..." }`
- **Success responses**: always `{ ok: true, data: ... }`
- **Fire-and-forget**: async operations that don't affect the response use `void promise.catch(...)` pattern
- **Imports**: use `.js` extensions for local imports (ESM requirement)
- **Logging**: use `logger` from `src/logger.ts`, never `console.log` in production paths

## Section 8: Architecture Rules

- **Pure PostgreSQL** — no Neo4j or separate graph database. Knowledge graph uses recursive CTEs.
- **No external MCP SDK** — the MCP server implements the protocol directly (minimal dependencies).
- **No built-in scheduler** — sleep cycles are triggered externally by design.
- **Pluggable providers** — LLM and embedding providers are interfaces in `llm.ts` and `embedding.ts`.
- **No premature abstraction** — concrete implementations over generic helpers.
- **App factory pattern** — `src/app.ts` exports `createApp()`. `src/server.ts` is a thin bootstrap. Never add route logic to `server.ts`.
- **Schema migrations** — never modify `schema/schema.sql` for existing columns. Create `schema/migration-v*.sql`. Keep `schema.sql` in sync as the canonical from-scratch schema.

## When Adding New Features

1. Add types to `src/types.ts`
2. Add Zod schema to `src/schemas.ts`
3. Add the core method to `MemoryManager` in `src/memory-manager.ts`
4. Add the REST endpoint to `src/app.ts` (not `server.ts`)
5. Add the client method to `src/client.ts`
6. Add the MCP tool to `src/mcp.ts` (both definition and executor)
7. Add the tool definition to `src/tool-definitions.ts`
8. Add the OpenAPI spec entry to `src/openapi.ts`
9. Add a database migration if needed in `schema/migration-*.sql`
10. Add tests to `tests/integration.test.ts` (and `tests/http.test.ts` for the route)
11. Run `npm run type-check` — must pass with 0 errors

## When Modifying the Schema

- Never modify `schema/schema.sql` for existing columns — create a new `schema/migration-v*.sql`
- `schema/schema.sql` is the canonical "from scratch" schema — keep it in sync with migrations
- All tables have `agent_id` columns with foreign key to `agents` table
- Use `CASCADE` on foreign keys where appropriate

## Section 9: Model Routing Strategy

When spawning subagents with the Agent tool, select the model tier based on task impact:

| Model | Use For |
|-------|---------|
| **Opus 4.6** (`model: "opus"`) | Planning, architecture, security reviews, audit, integration design, complex multi-file coding |
| **Sonnet 4.6** (`model: "sonnet"`) | Documentation, moderate coding, code review, test writing, refactoring |
| **Haiku 4.5** (`model: "haiku"`) | Quick lookups, simple file searches, boilerplate generation, formatting |
| **gemma4:31b-cloud** (via `ollama run`) | Parallel routine coding where output is easy to verify: scaffolding, repetitive transforms, bulk edits, simple implementations |

**Principles:**
- Use Claude models when output quality affects production results. Use gemma4 via Ollama CLI to preserve Anthropic API quota on commodity tasks.
- Don't use Opus for tasks Sonnet handles well. Don't use Sonnet for tasks Haiku or gemma4 handles well.
- Ollama models are invoked via shell (`ollama run gemma4:31b-cloud "prompt"`) — Claude Code does not support routing subagents to non-Anthropic providers.
- Ollama API key is in `~/.claude/ollama.env`.

## Section 10: Testing

### Test Suites

| Suite | File | Requires | What It Tests |
|-------|------|----------|---------------|
| Integration | `tests/integration.test.ts` | PostgreSQL | MemoryManager API, CRUD, consolidation, graph, feedback, hints, resume |
| Mock LLM | `tests/llm-mock.test.ts` | PostgreSQL | All LLM-dependent paths (summarize, reflect, revise) via mock provider |
| HTTP API | `tests/http.test.ts` | PostgreSQL | All 18 REST endpoints via supertest — auth, validation, errors |
| Cache | `tests/cache.test.ts` | Redis | Cache hit/miss, invalidation, TTL |
| Load | `tests/load.test.ts` | PostgreSQL | p95 latency targets under 50 concurrent requests |
| Security | `tests/security.test.ts` | PostgreSQL | Zod validation, injection boundaries, auth bypass attempts |
| Benchmarks | `benchmarks/` | PostgreSQL + dataset | LongMemEval 500-question harness |

### Run Commands

```bash
npm run type-check        # Must pass before running tests
npm test                  # All suites
npm run test:integration  # Integration tests (requires PostgreSQL)
npm run test:cache        # Cache tests (requires Redis)
npm run test:llm          # Mock LLM tests (no API keys needed)
npm run test:http         # HTTP API tests (no port binding)
npm run test:load         # Load tests
npm run test:security     # Security / input-validation tests
npm run benchmark         # LongMemEval harness
```

### Test Rules

- Tests use Node.js built-in `node:test` runner — no Jest, no Vitest
- Integration tests require a real PostgreSQL database with schema applied
- Each `describe` block cleans up in `before` and `after`
- Use a dedicated `TEST_AGENT` constant to avoid collision
- Run `npm run type-check` before running tests — type errors cause confusing failures

### Writing Mock LLM Tests

```typescript
const mockLlm: LLMProvider = {
  model: 'mock-model',
  async chat(system: string, user: string): Promise<string> {
    return JSON.stringify({ reflection: '...', key_insights: [...] });
  },
  async summarize(raw: string): Promise<ConsolidationSummary> {
    return { summary: raw, keyFacts: [], entities: [], relationships: [] };
  },
};
```

## Section 11: Recent Changes

### v2.6.0 — Active Knowledge Management + Integration Improvements

#### Python SDK (`python/`)
- **`MemForgeClient`** — 18 async methods mirroring the TypeScript SDK, built on `httpx`
- **`ResilientMemForgeClient`** — Graceful degradation wrapper; returns safe defaults on errors
- **`ConversationMemory`** — Chat-oriented adapter: `add_turn()`, `get_context()`, `start_session()`, `end_session()`
- Tool definitions for OpenAI function calling and Anthropic tool_use formats
- Install: `pip install memforge` or `cd python && pip install -e .` for development

#### Framework Examples (`examples/`)
- `simple_chatbot.py` — Minimal Python chatbot with MemForge memory
- `openai_tools.py` — OpenAI function calling with MemForge tools
- `claude_tools.py` — Anthropic tool_use with MemForge tools
- `langchain_memory.py` — LangChain memory integration
- `quickstart.py` / `quickstart.ts` — Hello-world walkthroughs in Python and TypeScript

#### Docker Standalone
- `Dockerfile.standalone` — Single container with embedded PostgreSQL; no separate Postgres required
- `docker run -p 3333:3333 salishforge/memforge:standalone`

#### Export / Import
- `GET /memory/:agentId/export` — Download all warm-tier memories as JSONL
- `POST /memory/:agentId/import` — Bulk-load memories from JSONL (migration, seeding)

#### Webhooks
- `WEBHOOK_URL` + `WEBHOOK_EVENTS` env vars
- Events: `consolidated`, `revised`, `reflected`, `evicted`, `graduated`
- Payload: `{ event, agentId, data, timestamp }`

#### ChatGPT Plugin
- `public/ai-plugin.json` — ChatGPT plugin manifest for direct ChatGPT integration

### v2.7.0 — halfvec Vector Storage

- **halfvec (float16) vector storage** — Embedding columns converted from pgvector `vector` (float32) to `halfvec` (float16). 2x storage compression with zero quality loss. Requires pgvector 0.5+.
- **Migration v2.7.sql** — Converts existing `vector` columns to `halfvec` for upgrading deployments.

#### Active Knowledge Management (#75–#80)
- **Staleness detection** (#78) — `staleness_score` column on `warm_tier`; computed in sleep Phase 0; confidence auto-reduced; `health()` reports `stale_memory_count` and `avg_staleness`
- **Prioritized experience replay** (#79) — `surprise_score` column on `warm_tier`; tracked on negative-after-positive feedback; Phase 3 revises high-surprise memories first
- **Conflict resolution** (#80) — Sleep Phase 2.5; multi-factor scoring (supersession → corroboration → temporal → confidence); `memory_conflicts` table records pairs, winners, and resolution strategy
- **Temporal event chains** (#76) — Phase 4b links temporally adjacent memories; `memory_sequences` table with `gap_seconds`
- **Knowledge gap detection** (#77) — Zero-result queries recorded in `knowledge_gaps` table; deduped + 1000/agent cap; `health()` reports `knowledge_gap_count_7d`
- **Schema detection** (#75) — Sleep Phase 5.5 crystallizes repeated temporal patterns as `entity_type='schema'` entities
- **Migration v2.6.sql** — 3 new tables (`memory_conflicts`, `memory_sequences`, `knowledge_gaps`), 3 new columns (`surprise_score`, `staleness_score`, `last_corroborated`)

#### Security Round 9
- Agent-scoped conflict resolution queries prevent cross-agent leakage
- Multi-factor conflict heuristic replaces cascading approach (more deterministic)
- Feedback deduplication: each `retrieval_id` can only be rated once per agent (prevents spam)
- Knowledge gap dedup prevents duplicate zero-result entries
- Batched retrieval logging via single `INSERT ... unnest()` (fixes per-query N+1)
- All new endpoints and tables pass MEDIUM+ audit

### v2.2.0 — Production Hardening, Embeddings, Retrieval Quality

#### Production Hardening
- CI/CD pipeline via GitHub Actions (type-check → lint → test → build)
- Structured JSON logging via pino (`src/logger.ts`) with request correlation IDs
- `createApp()` factory in `src/app.ts` — Express app is now testable without port binding
- Mock LLM test suite covers all LLM-dependent paths without API keys
- HTTP API test suite covers all 18 endpoints via supertest
- Load tests validate p95 latency targets

#### Embeddings
- **In-process local embeddings** (`EMBEDDING_PROVIDER=local`) — uses `@xenova/transformers` with `Xenova/bge-small-en-v1.5` by default (7.3 ms/embed, ~137 embeds/sec on CPU). No external service required.
- **Concurrency-limited external embeddings** — `ConcurrencyLimitedEmbeddingProvider` wraps Ollama/OpenAI with a semaphore (`EMBEDDING_CONCURRENCY_LIMIT`, default 3). Prevents request pileup under consolidation bursts.

#### Security
- 9 rounds of security audit (8 prior + round 9 for AKM features), all clean at MEDIUM+
- Zod validation on all request boundaries (`src/schemas.ts`)
- PostgreSQL advisory locks prevent concurrent sleep cycle races
- Prompt injection boundaries: user content wrapped in XML delimiters + injection-resistance instructions
- RLS migration (`schema/migration-v2.3.sql`) adds row-level security policies
- SSRF prevention on outbound LLM/embedding provider URLs
- Security headers via `helmet` middleware

#### Retrieval Quality
- Query preprocessing: strip question scaffolding, extract time references, split compound queries
- Multi-query retrieval: compound queries split and run independently (up to 3 sub-queries)
- Asymmetric RRF: semantic results weighted 1.5× in hybrid mode
- Result deduplication, minimum quality threshold, entity detection boost, term-memory affinity
- LongMemEval benchmark: **93.2% R@5** / 96.4% R@10 hybrid mode (500 questions, local embeddings)
