# Development Guide

## Prerequisites

- **Node.js** >= 22
- **PostgreSQL** 16+ with extensions:
  - `pgvector` 0.5+ — vector similarity search; 0.5+ required for `halfvec` (float16) storage
  - `pg_trgm` — trigram fuzzy matching (used for entity dedup and search fallback)
- **Redis** 7+ (optional — MemForge works without it, just slower)
- **Git**

## Setup

```bash
git clone https://github.com/salishforge/memforge.git
cd memforge
npm install
```

### Database Setup

```bash
# Create database
createdb memforge

# Enable extensions (requires superuser or rds_superuser)
# pgvector 0.5+ required for halfvec (float16) storage
psql memforge -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql memforge -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# Apply schema (fresh install)
psql memforge -f schema/schema.sql

# If upgrading from v2.1.x, apply migrations in order:
psql memforge -f schema/migration-v2.2.sql   # dedup, confidence graduation, outcome tagging
psql memforge -f schema/migration-v2.3.sql   # RLS policies (requires superuser)
psql memforge -f schema/migration-v2.4.sql   # hints table, supersession, weight adaptation
psql memforge -f schema/migration-v2.6.sql   # AKM: memory_conflicts, memory_sequences, knowledge_gaps, surprise_score, staleness_score
psql memforge -f schema/migration-v2.7.sql   # halfvec (float16) vector storage: 2x compression (requires pgvector 0.5+)

# Full migration sequence from v1.x:
psql memforge -f schema/migration-v1.2.sql
psql memforge -f schema/migration-v1.3.sql
psql memforge -f schema/migration-v1.4.sql
psql memforge -f schema/migration-v1.6.sql
psql memforge -f schema/migration-v2.0.sql
psql memforge -f schema/migration-v2.1.sql
psql memforge -f schema/migration-v2.2.sql
psql memforge -f schema/migration-v2.3.sql
psql memforge -f schema/migration-v2.4.sql
psql memforge -f schema/migration-v2.6.sql
psql memforge -f schema/migration-v2.7.sql
```

### Environment

```bash
cp .env.example .env
```

At minimum, set `DATABASE_URL`:

```
DATABASE_URL=postgresql://localhost:5432/memforge
```

For development without LLM features:
```
EMBEDDING_PROVIDER=none
LLM_PROVIDER=none
CONSOLIDATION_MODE=concat
```

For development with local in-process embeddings (no external service needed):
```
EMBEDDING_PROVIDER=local
# Optional overrides:
# EMBEDDING_MODEL=Xenova/bge-small-en-v1.5
# EMBEDDING_DIMENSIONS=384
```

### Running

```bash
npm run dev          # Watch mode with auto-reload
npm start            # Production (requires npm run build first)
npm run build        # Compile TypeScript
npm run type-check   # Check types without emitting
```

## Testing

### Test Architecture

Tests use Node.js built-in `node:test` runner with `tsx` for TypeScript execution. No external test framework.

```bash
npm test                  # All tests
npm run test:integration  # Database tests (requires PostgreSQL)
npm run test:cache        # Cache tests (requires Redis)
npm run test:llm          # Mock LLM path tests (no API keys needed)
npm run test:http         # HTTP API endpoint tests (in-process, no port binding)
npm run test:load         # Load tests (p95 latency targets)
npm run test:security     # Security / input-validation tests
npm run benchmark         # LongMemEval harness (requires dataset in benchmarks/data/)
```

### Integration Tests

`tests/integration.test.ts` tests the `MemoryManager` API against a real PostgreSQL database. Coverage:

| Area | What's Tested |
|------|--------------|
| Agent registration | Auto-registration on first add |
| Add & query | Hot→warm consolidation, keyword search, empty results, limit |
| Timeline | Chronological ordering, limit parameter |
| Consolidation | Concat mode, idempotent re-consolidation |
| Clear/archival | Hot+warm→cold archival, zero counts after |
| Stats | Tier counts, unknown agent error |
| Feedback | Positive/negative recording, invalid outcome rejection, empty IDs |
| Entity dedup | Similar entity merge, dissimilar entity preservation |
| Active recall | Memory+procedure surfacing, empty context rejection |
| Memory health | All metric fields present and typed |
| Input validation | Empty agentId, empty content, empty query |
| Hints API | Hint submission, retrieval influence |
| Agent resumption | Context bundle fields, empty-state handling |
| Content dedup | Near-duplicate suppression at ingest |

### Mock LLM Tests (`tests/llm-mock.test.ts`)

Tests all LLM-dependent paths using an in-process mock provider — no API keys required:

- **Summarize consolidation** — entity/relationship extraction, summary format
- **Reflection** — insight synthesis, contradiction detection
- **Meta-reflection** — second-order synthesis from multiple reflections
- **Sleep cycle Phase 3** — revision decisions (augment/correct/merge/compress/leave)
- **Procedural extraction** — condition→action rule format

### HTTP API Tests (`tests/http.test.ts`)

Exercises all 18 REST endpoints via supertest against the `createApp()` factory. Covers:
- Authentication (valid token, missing token, wrong token)
- Zod validation errors (400 responses with structured messages)
- Route-level error propagation (404, 500)

### Load Tests (`tests/load.test.ts`)

Validates p95 latency targets under 50 concurrent requests:
- Query endpoint: p95 < 100 ms
- Add endpoint: p95 < 50 ms

### What's Still NOT Tested

- **Semantic/hybrid search** — Requires a live embedding provider (no mock yet)
- **RLS enforcement** — Requires Postgres running with per-agent roles configured

### Writing Tests

Follow the existing pattern:

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('Feature name', () => {
  before(async () => {
    await cleanup();
    // Set up test data
  });

  after(cleanup);

  it('does the thing', async () => {
    const result = await manager.someMethod(TEST_AGENT, ...);
    assert.equal(result.field, expectedValue);
  });
});
```

Key rules:
- Each `describe` block cleans up in `before` and `after`
- Use a dedicated `TEST_AGENT` constant to avoid collision with real data
- Clean up in dependency order (revisions before warm_tier, etc.)

### Testing with LLM Mocking

To test LLM-dependent paths, create a mock provider:

```typescript
const mockLlm: LLMProvider = {
  model: 'mock-model',
  async chat(system: string, user: string): Promise<string> {
    // Return valid JSON matching the expected schema
    return JSON.stringify({ reflection: '...', key_insights: [...] });
  },
  async summarize(raw: string): Promise<ConsolidationSummary> {
    return { summary: raw, keyFacts: [], entities: [], relationships: [] };
  },
};
```

## Configuration Reference

All configuration is via environment variables. Copy `.env.example` to `.env` to start.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://localhost:5432/memforge` |

### LLM Providers

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `none` | `anthropic`, `openai`, `ollama`, or `none` |
| `ANTHROPIC_API_KEY` | — | Required when `LLM_PROVIDER=anthropic` |
| `OPENAI_API_KEY` | — | Required when `LLM_PROVIDER=openai` (also used for embeddings) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL |
| `LLM_MODEL` | provider default | Model name override |
| `REVISION_LLM_PROVIDER` | (uses `LLM_PROVIDER`) | Separate provider for sleep cycle revisions |
| `EMBEDDING_PROVIDER` | `none` | `local`, `openai`, `ollama`, or `none`. `local` runs in-process via `@xenova/transformers` — no external service required. |
| `EMBEDDING_MODEL` | provider default | Embedding model name override. Default for `local`: `Xenova/bge-small-en-v1.5`. |
| `EMBEDDING_DIMENSIONS` | provider default | Output embedding dimensions override (required when using a non-default model). |
| `EMBEDDING_CONCURRENCY_LIMIT` | `3` | Max parallel in-flight requests for external embedding providers (Ollama, OpenAI). Prevents request pileup during consolidation. |
| `CONSOLIDATION_MODE` | `concat` | `concat` (fast, no LLM) or `summarize` (LLM-driven) |

### Retrieval Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `KEYWORD_OVERLAP_BOOST` | `0.3` | Score boost applied when query tokens overlap memory keywords |
| `TEMPORAL_PROXIMITY_DAYS` | `7` | Days window for temporal proximity scoring boost |
| `CONSOLIDATION_INNER_BATCH_SIZE` | `50` | Hot-tier rows processed per inner consolidation loop |
| `TEMPORAL_DECAY_RATE` | `0` | Score decay per hour for older memories (0 = disabled) |

### LLM Opt-In Features

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_LLM_RERANK` | `false` | Enable LLM post-retrieval reranking of top-k results |
| `ENABLE_LLM_INGEST` | `false` | Enable LLM entity/tag extraction at write time |

### Webhooks

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_URL` | — | URL to POST event payloads to (optional) |
| `WEBHOOK_EVENTS` | (all) | Comma-separated event filter: `consolidated`, `revised`, `reflected`, `evicted`, `graduated` |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMFORGE_TOKEN` | required | Bearer token for all `/memory/*` routes |
| `ADMIN_TOKEN` | (open) | Bearer token for `/admin/*` routes |
| `AUDIT_HMAC_KEY` | — | HMAC key for audit chain integrity (required in production) |
| `OAUTH2_REQUIRED` | `false` | Require OAuth2 JWT on all `/memory/*` routes |
| `OAUTH2_JWKS_URI` | — | JWKS endpoint URI when `OAUTH2_REQUIRED=true` |
| `OAUTH2_AUDIENCE` | — | Expected JWT audience when `OAUTH2_REQUIRED=true` |
| `ALLOWED_LLM_HOSTS` | (none) | Comma-separated allowlist for outbound LLM/embedding hosts (SSRF prevention) |

### Operations

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3333` | HTTP listen port |
| `LOG_LEVEL` | `info` | Pino log level: `trace`, `debug`, `info`, `warn`, `error` |
| `REDIS_URL` | `redis://localhost:6379` | Redis URL (optional — graceful degradation if absent) |
| `DB_POOL_MAX` | `10` | PostgreSQL connection pool size |
| `RATE_LIMIT_MAX` | `100` | Max requests per minute per IP (0 = disabled) |
| `SLEEP_CYCLE_TOKEN_BUDGET` | `100000` | Max tokens consumed per sleep cycle |

## Architecture Overview

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

### Request Flow

```
HTTP Request
  → Express middleware (rate limit, metrics, auth)
    → Route handler (server.ts)
      → MemoryManager method (memory-manager.ts)
        → PostgreSQL queries (parameterized)
        → Redis cache check/set (optional)
        → LLM/embedding provider calls (optional)
      → JSON response { ok: true/false, data/error }
```

### Extension Points

**Adding a new LLM provider:**
1. Implement the `LLMProvider` interface in `src/llm.ts`
2. Add a case to `createLLMProvider()` factory
3. Document the env vars in `.env.example`

**Adding a new embedding provider:**
1. Implement the `EmbeddingProvider` interface in `src/embedding.ts`
2. Add a case to `createEmbeddingProvider()` factory
3. Document the env vars in `.env.example`

**Adding a new API endpoint:**
See the checklist in [CLAUDE.md](CLAUDE.md) — there are 10 files to update.

### Database Connection Management

- Connection pool managed by `pg.Pool` in `src/db.ts`
- Pool size configurable via `DB_POOL_MAX` (default 10)
- Long-running operations (consolidation, clear) use `pool.connect()` for transaction support
- Fire-and-forget operations use `pool.query()` directly

### Error Handling Patterns

```typescript
// Route handlers: catch and categorize
try {
  const result = await manager.method(getAgentId(req), ...);
  ok(res, result);
} catch (err) {
  const e = err as Error;
  if (e instanceof TypeError) {
    fail(res, 400, e.message);    // Client error
  } else if (e.message.includes('not found')) {
    fail(res, 404, e.message);    // Not found
  } else {
    fail(res, 500, e.message);    // Server error
  }
}

// Manager methods: throw typed errors
if (!agentId || typeof agentId !== 'string') {
  throw new TypeError('agentId must be a non-empty string');
}

// Fire-and-forget: void + catch
void this.pool.query(...).catch(err =>
  console.error('[memforge] operation failed:', err.message)
);
```

## Performance Considerations

### Query Performance

- Keyword search uses PostgreSQL FTS (`tsvector` + `plainto_tsquery`) with trigram fallback
- Semantic search uses pgvector HNSW index (approximate nearest neighbor)
- Hybrid search runs keyword + semantic in parallel, fuses with RRF
- All searches are boosted by `importance` score: `rank * (0.5 + 0.5 * importance)`
- Redis caching provides ~10x speedup for repeated queries

### Consolidation Performance

- Hot-tier rows are batched (50 per batch) for consolidation
- Embedding generation uses batch API where available
- Entity upserts use `unnest()` arrays for batch SQL operations
- LLM calls are the bottleneck — concat mode is instant

### Sleep Cycle Performance

- Phase 1-2 are pure SQL — fast regardless of dataset size
- Phase 3 is bounded by token budget — processes most-important first
- Phase 4 entity dedup uses trigram index for fast candidate detection
- Phase 5 delegates to existing reflect() mechanism

## Docker Development

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f memforge

# Reset database
docker compose down -v
docker compose up -d
```

The docker-compose.yml mounts `schema/schema.sql` into PostgreSQL's init directory for automatic schema creation on first run.

## Python SDK Development

The Python SDK lives in `python/python/memforge/`. It is a separate package with its own `pyproject.toml`.

### Setup

```bash
cd python/python
pip install -e ".[dev]"
```

### Structure

| File | Purpose |
|------|---------|
| `memforge/client.py` | `MemForgeClient` — 18 async methods over `httpx` |
| `memforge/resilient.py` | `ResilientMemForgeClient` — wraps `MemForgeClient`, returns safe defaults on errors |
| `memforge/conversation.py` | `ConversationMemory` — chat-oriented adapter: `add_turn`, `get_context`, `start_session`, `end_session` |
| `memforge/tools.py` | Tool definitions for OpenAI function calling and Anthropic tool_use formats |
| `memforge/__init__.py` | Public exports |
| `memforge/types.py` | Typed dataclasses mirroring TypeScript interfaces |

### Publishing

```bash
cd python/python
python -m build
pip install twine
twine upload dist/*
```

Install from PyPI:

```bash
pip install memforge
```

### Framework Examples

`examples/` contains runnable Python examples:

| File | What it demonstrates |
|------|----------------------|
| `quickstart.py` | Hello-world: add, query, consolidate |
| `simple_chatbot.py` | Minimal chatbot with MemForge memory |
| `openai_tools.py` | OpenAI function calling with MemForge tools |
| `claude_tools.py` | Anthropic tool_use with MemForge tools |
| `langchain_memory.py` | LangChain memory integration |

Run any example with a running MemForge server:

```bash
MEMFORGE_URL=http://localhost:3333 MEMFORGE_TOKEN=dev python examples/quickstart.py
```

## Troubleshooting

**"relation does not exist"** — Schema not applied. Run `psql "$DATABASE_URL" -f schema/schema.sql`

**"extension vector does not exist"** — Install pgvector: `sudo apt install postgresql-16-pgvector` or use the Docker setup.

**"Semantic search requires an embedding provider"** — Set `EMBEDDING_PROVIDER=local` (no external service needed), `openai`, or `ollama`, or use `mode=keyword` explicitly.

**Redis connection errors** — MemForge works without Redis. Set `REDIS_URL` to empty to suppress warnings, or start Redis.

**LLM timeout during sleep cycle** — Reduce `SLEEP_CYCLE_TOKEN_BUDGET` or use a faster model via `REVISION_LLM_PROVIDER=ollama`.
