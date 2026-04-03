# Development Guide

## Prerequisites

- **Node.js** >= 20 (tested with 22)
- **PostgreSQL** 16+ with extensions:
  - `pgvector` — vector similarity search
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
psql memforge -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql memforge -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# Apply schema
psql memforge -f schema/schema.sql

# If upgrading, apply migrations in order:
psql memforge -f schema/migration-v1.2.sql
psql memforge -f schema/migration-v1.3.sql
# ... etc
psql memforge -f schema/migration-v2.1.sql
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

### What's NOT Tested (Gaps)

These require LLM calls and need mocked providers:

- **Summarize consolidation** — LLM-driven distillation, entity/relationship extraction
- **Reflection** — LLM synthesis of insights, contradiction detection
- **Meta-reflection** — Second-order reflection synthesis
- **Sleep cycle Phase 3** — LLM memory revision (augment/correct/merge/compress)
- **Procedural extraction** — LLM extraction of condition→action rules
- **Semantic/hybrid search** — Requires embedding provider

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

## Troubleshooting

**"relation does not exist"** — Schema not applied. Run `psql "$DATABASE_URL" -f schema/schema.sql`

**"extension vector does not exist"** — Install pgvector: `sudo apt install postgresql-16-pgvector` or use the Docker setup.

**"Semantic search requires an embedding provider"** — Set `EMBEDDING_PROVIDER=openai` or `ollama`, or use `mode=keyword` explicitly.

**Redis connection errors** — MemForge works without Redis. Set `REDIS_URL` to empty to suppress warnings, or start Redis.

**LLM timeout during sleep cycle** — Reduce `SLEEP_CYCLE_TOKEN_BUDGET` or use a faster model via `REVISION_LLM_PROVIDER=ollama`.
