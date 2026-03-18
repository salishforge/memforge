# MemForge

Neuroscience-inspired memory consolidation service for AI agents.

MemForge manages agent memory across three tiers:
- **Hot**: Recent events, unprocessed
- **Warm**: Consolidated, searchable, semantic  
- **Cold**: Archived, rare access

## Quick Start

```bash
npm install
npm run build
npm start
```

### Prerequisites

- PostgreSQL (with schema applied via `npm run migrate`)
- Redis at `localhost:6379` (optional — degrades gracefully if unavailable)

```bash
# macOS
brew install redis && brew services start redis

# Linux
sudo apt-get install redis-server && sudo systemctl start redis
```

## API

- `POST /memory/{agentId}/add` — Add memory event (invalidates cache)
- `GET /memory/{agentId}/query?q=search[&limit=10]` — Full-text search (cached 10 min)
- `POST /memory/{agentId}/consolidate` — Trigger hot→warm consolidation (invalidates cache)
- `GET /memory/{agentId}/stats` — Memory tier statistics (cached 5 min)
- `GET /health` — Health check
- `GET /metrics` — Prometheus metrics
- `GET /api/docs` — Interactive Swagger UI
- `GET /admin/cache/stats` — Cache hit/miss statistics + Redis info
- `POST /admin/cache/clear` — Flush cache (body: `{ "agentId"?: string }`)
- `GET /admin/cache/dashboard` — Live cache monitoring UI

## Redis Caching (v1.1.0)

MemForge caches hot-path queries in Redis for ~10× query speed improvement.

| Tier          | Routes                     | TTL    |
|---------------|---------------------------|--------|
| Hot (stats)   | `/memory/:id/stats`       | 5 min  |
| Search        | `/memory/:id/query`       | 10 min |
| Consolidation | —                         | 30 min |

**Cache key format:** `memforge:{agentId}:{sha256(query+limit)[0:12]}`

**Invalidation:** All write operations (`/add`, `/consolidate`) immediately invalidate all
cache entries for the affected agent.

**Graceful degradation:** If Redis is unreachable, MemForge serves requests directly from
PostgreSQL without failing — no code changes required.

### Performance

```
Cache avg latency: ~0.11 ms  (Redis localhost)
Simulated DB:      ~5 ms
Speedup:           ~45×
```

### Cache monitoring

Visit `http://localhost:3333/admin/cache/dashboard` after starting the server for a
live dashboard showing hit rate, Redis memory usage, eviction counts, and TTL config.

## Database

PostgreSQL with hot_tier, warm_tier, cold_tier tables. See schema/schema.sql.

## Multi-Tenant

Each agent has isolated memory. Queries filtered by agent_id.

## Environment Variables

| Variable                   | Default                 | Description                         |
|---------------------------|-------------------------|-------------------------------------|
| `DATABASE_URL`            | required                | PostgreSQL connection string        |
| `REDIS_URL`               | `redis://localhost:6379`| Redis connection URL                |
| `PORT`                    | `3333`                  | HTTP listen port                    |
| `ADMIN_TOKEN`             | `` (open)              | Bearer token for `/admin/*` routes  |
| `MEMFORGE_TOKEN`          | required                | Bearer token for `/memory/*` routes |
| `CONSOLIDATION_BATCH_SIZE`| `500`                   | Max events per consolidation run    |
| `CONSOLIDATION_THRESHOLD` | `50`                    | Min hot events before consolidation |

## Testing

```bash
# Run cache integration tests (requires Redis)
npm run test:cache
```

## License

MIT
