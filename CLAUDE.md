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

See [ARCHITECTURE.md](ARCHITECTURE.md) for full architecture details (tiered storage, retrieval pipeline, sleep cycle phases, knowledge graph).

Key concepts: Hot → Warm → Cold tiers. Hybrid retrieval (FTS + pgvector HNSW). 10-phase sleep cycle for revision/reflection. Knowledge graph via recursive CTEs. Active ingest with hints, supersession, and entity detection.

## Section 5: Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/memory-manager.ts` | ~2,400 | Core API — all memory operations |
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
| `schema/schema.sql` | ~400 | Complete fresh-install schema (21 tables) — no migrations needed for new installs |
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
| `EMBEDDING_PROVIDER` | `none` | `local`, `openai`, `ollama`, or `none`. `local` uses in-process `@huggingface/transformers` (optional peer dependency — install separately: `npm install @huggingface/transformers`). |
| `EMBEDDING_MODEL` | provider default | Embedding model name override. Default for `local`: `Xenova/bge-small-en-v1.5`. |
| `EMBEDDING_DIMENSIONS` | provider default | Override output embedding dimensions (required if model differs from default). |
| `EMBEDDING_CONCURRENCY_LIMIT` | `3` | Max parallel in-flight requests for external embedding providers (Ollama, OpenAI). Fixes request pileup under load. |
| `EMBEDDING_MIGRATION_BATCH` | `100` | Max warm_tier rows re-embedded per sleep cycle when the provider's `modelId` changes. Sleep Phase 5.9. |
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

## Section 9: Model Routing

See `~/.claude/templates/` for delegation templates and `.claude/agents/feature-dev.md` for the MemForge Sonnet agent definition. Model routing strategy is documented in the global cost optimization plan.

## Section 10: Testing

```bash
npm run type-check        # Must pass before running tests
npm test                  # All suites
npm run test:integration  # Integration tests (requires PostgreSQL)
npm run test:http         # HTTP API tests (no port binding)
npm run test:llm          # Mock LLM tests (no API keys needed)
npm run test:cache        # Cache tests (requires Redis)
npm run test:load         # Load tests
npm run test:security     # Security / input-validation tests
```

- Node.js built-in `node:test` runner — no Jest/Vitest
- Run `type-check` before tests — type errors cause confusing failures
- See [DEVELOPMENT.md](DEVELOPMENT.md) for test details and mock LLM patterns

## Section 11: Recent Changes

See [CHANGELOG.md](CHANGELOG.md) for full version history. Current version: v3.0.0-beta.3.

Key versions: v3.0.0-beta.3 (RLS + audit trigger in canonical schema, version regularization, doc cleanup), v2.7.1 (beta release cleanup, dead code removal), v2.7.0 (halfvec storage), v2.6.0 (active knowledge management, Python SDK), v2.2.0 (production hardening, embeddings, retrieval quality).
