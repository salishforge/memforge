# MemForge — Project Instructions for AI Agents

This file provides complete context for AI agents (Claude Code, Cursor, etc.) working on this codebase. Reading this file alone should be sufficient to understand the system.

## Section 1: What This Project Is

MemForge is a neuroscience-inspired memory system for AI agents. It provides:

- **Tiered storage** — Hot (raw events) → Warm (consolidated, searchable, scored) → Cold (archived audit trail)
- **Hybrid retrieval** — Dual-tokenizer FTS, pgvector HNSW semantic search, reciprocal rank fusion, keyword overlap boost, temporal proximity scoring
- **Knowledge graph** — Entities and relationships extracted during consolidation, traversable via recursive CTEs in PostgreSQL
- **Sleep cycles** — 5-phase background processor that actively revises and improves stored knowledge during idle periods
- **Active ingest** — Hints API, preference extraction, entity detection, supersession. Agents participate in their own memory management.
- **LLM opt-in** — Post-retrieval reranking and LLM-assisted ingest available but disabled by default

MemForge is a standalone HTTP service. Agents connect via REST API, TypeScript SDK, or MCP tools.

**Key design documents:**
- [INTEGRATION.md](INTEGRATION.md) — How to wire MemForge into any agent (REST, SDK, MCP, LangChain, CrewAI, etc.)
- [SPECIFICATION.md](SPECIFICATION.md) — Design philosophy, objectives, and core tenets
- [ARCHITECTURE.md](ARCHITECTURE.md) — Internal architecture, data models, module structure
- [DEVELOPMENT.md](DEVELOPMENT.md) — Setup, testing, extension points, configuration reference
- [CHANGELOG.md](CHANGELOG.md) — Version history

## Section 2: Quick Start for AI Agents

### Deploy

**Docker (recommended):**
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

Node.js 22+ required. PostgreSQL 16 with `pgvector` and `pg_trgm` extensions required. Redis is optional.

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

All `/memory/*` routes require `Authorization: Bearer <MEMFORGE_TOKEN>`.
All responses: `{ ok: true, data: ... }` or `{ ok: false, error: "..." }`.

## Section 3: Tech Stack

| Component | Version | Notes |
|-----------|---------|-------|
| Language | TypeScript 5.7 | Strict mode, ES modules (NodeNext) |
| Runtime | Node.js 22+ | |
| Database | PostgreSQL 16 | `pgvector` + `pg_trgm` extensions required |
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
        └─► pgvector HNSW (semantic)     ─┘
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

### Sleep Cycle (5 Phases)

Triggered externally (cron, MCP, idle webhook). Runs within a single PostgreSQL advisory lock per agent.

1. **Scoring** — Recalculate composite importance: `f(recency, frequency, centrality, reflection_count, revision_stability)`. Adapt weights based on retrieval outcome correlation.
2. **Triage** — Evict below-threshold memories to cold tier; flag low-confidence for revision.
3. **Revision** — LLM reviews flagged memories with context (entities, retrieval history, neighbors) and decides: augment, correct, merge, compress, or leave as-is.
4. **Graph maintenance** — Decay stale edges, deduplicate similar entities (trigram similarity).
5. **Reflection** — Synthesize insights from revised knowledge base; extract procedural rules.

Each phase respects a configurable token budget (`SLEEP_CYCLE_TOKEN_BUDGET`).

### Knowledge Graph

Entities stored in `entities` table; relationships in `relationships` table with `valid_from`/`valid_until` for temporal validity. Graph traversal uses recursive CTEs — no external graph database. Entity dedup uses trigram similarity (`pg_trgm`).

### Logging and Observability

All log output is structured JSON via pino. Request correlation IDs (`X-Request-Id`) propagate through all log entries. Prometheus metrics at `/metrics`. Swagger UI at `/api/docs`.

## Section 5: Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/memory-manager.ts` | ~2,535 | Core API — all memory operations |
| `src/app.ts` | ~954 | Express app factory (`createApp()`) — all routes, middleware, validation |
| `src/sleep-cycle.ts` | ~682 | Sleep cycle engine (5 phases) |
| `src/server.ts` | ~117 | Thin bootstrap — creates providers, calls `createApp()`, binds port |
| `src/types.ts` | ~425 | All TypeScript interfaces |
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

## Section 11: Recent Changes (v2.2.0)

### Production Hardening (Phase 1)

- CI/CD pipeline via GitHub Actions (type-check → lint → test → build)
- Structured JSON logging via pino (`src/logger.ts`) with request correlation IDs
- `createApp()` factory in `src/app.ts` — Express app is now testable without port binding
- Mock LLM test suite covers all LLM-dependent paths without API keys
- HTTP API test suite covers all 18 endpoints via supertest
- Load tests validate p95 latency targets

### Embeddings

- **In-process local embeddings** (`EMBEDDING_PROVIDER=local`) — uses `@xenova/transformers` with `Xenova/bge-small-en-v1.5` by default (7.3 ms/embed, ~137 embeds/sec on CPU). No external service required. Model configurable via `EMBEDDING_MODEL`.
- **Concurrency-limited external embeddings** — `ConcurrencyLimitedEmbeddingProvider` wraps Ollama/OpenAI with a semaphore (`EMBEDDING_CONCURRENCY_LIMIT`, default 3). Prevents request pileup under consolidation bursts (fixes #67).

### Security

- 8 rounds of security audit, all clean at MEDIUM+
- Zod validation on all request boundaries (`src/schemas.ts`)
- PostgreSQL advisory locks prevent concurrent sleep cycle races
- Prompt injection boundaries: user content wrapped in XML delimiters + injection-resistance instructions
- RLS migration (`schema/migration-v2.3.sql`) adds row-level security policies
- SSRF prevention on outbound LLM/embedding provider URLs
- Security headers via `helmet` middleware
- See `ADVERSARIAL-ASSESSMENT.md`, `HARDENING-PLAN.md`, `DEPLOYMENT-SECURITY.md`

### Retrieval Quality

- Query preprocessing: strip question scaffolding, extract time references, split compound queries
- Multi-query retrieval: compound queries split and run independently (up to 3 sub-queries)
- Asymmetric RRF: semantic results weighted 1.5× in hybrid mode
- Result deduplication: first-100-char fingerprint prevents duplicate warm-tier rows in top-k
- Minimum quality threshold: results below 10% of top score are discarded
- Entity detection boost: terms matched in knowledge graph entities are scored higher
- Term-memory affinity: query terms → memory associations stored for future retrieval improvement
- Dual-tokenizer search (plainto + websearch) reduces missed recall
- Configurable keyword overlap boost (`KEYWORD_OVERLAP_BOOST`)
- Temporal proximity scoring (`TEMPORAL_PROXIMITY_DAYS`)
- Configurable consolidation batch size (`CONSOLIDATION_INNER_BATCH_SIZE`)
- Optional LLM post-retrieval reranking (`ENABLE_LLM_RERANK`)
- LongMemEval benchmark: 92.0% R@5 hybrid mode (per-session + local embeddings); 88.0% R@5 keyword baseline (vs. Hippo 74.0%)

### Community Enhancements

- Content deduplication at ingest (trigram similarity, >0.85 threshold)
- Confidence graduation for high-retrieval, high-feedback memories
- Structured outcome tags on feedback events
- Active ingest: Hints API, preference extraction, entity detection, supersession
- Agent resumption endpoint (`GET /memory/:id/resume`)
- Autonomous weight adaptation in sleep cycle Phase 1
- Optional LLM-assisted ingest (`ENABLE_LLM_INGEST`)
