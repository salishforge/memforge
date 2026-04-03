# MemForge Backlog

Issues to create on GitHub once the repository is public. Each section maps to one GitHub issue.

---

## Testing

### 1. Add mocked LLM provider tests for consolidation, reflection, and sleep cycle

**Labels:** `enhancement`, `testing`

The integration test suite covers core CRUD paths but all LLM-dependent codepaths are untested:

- **Summarize consolidation** — LLM distillation, entity/fact extraction, relationship creation
- **Reflection** — LLM insight synthesis, contradiction detection, procedural extraction
- **Meta-reflection** — Second-order reflection on accumulated reflections
- **Sleep cycle Phase 3** — LLM memory revision (augment/correct/merge/compress decisions)
- **Procedural extraction** — LLM condition→action rule extraction from reflections
- **Semantic/hybrid search** — Requires embedding provider

**Approach:** Create mock `LLMProvider` and `EmbeddingProvider` implementations that return deterministic JSON matching expected schemas. Use in `tests/llm-paths.test.ts`.

**Acceptance criteria:**
- All LLM-dependent paths have at least one happy-path test
- Mock providers return valid JSON matching each system prompt's expected schema
- Tests run against real PostgreSQL
- Revision history verified after sleep cycle test

### 2. Add end-to-end API tests via HTTP

**Labels:** `enhancement`, `testing`

Current tests call `MemoryManager` directly. Need HTTP-level tests that exercise the full Express stack: auth middleware, rate limiting, request validation, response format, error handling.

**Approach:** Start the server on a random port, make HTTP requests with `fetch()`, assert response bodies and status codes. Test auth failures, invalid input, and rate limiting.

### 3. Add load/performance tests

**Labels:** `enhancement`, `testing`, `performance`

No performance benchmarks exist beyond the Redis cache microbenchmark. Need tests for:
- Query latency at various warm-tier sizes (1K, 10K, 100K rows)
- Consolidation throughput (rows/second)
- Sleep cycle duration vs. dataset size
- Concurrent query handling

---

## Infrastructure

### 4. Add GitHub Actions CI/CD pipeline

**Labels:** `enhancement`, `infrastructure`

No CI/CD pipeline exists. PRs can be merged without type-checking or testing.

**Required jobs:**
1. `type-check` — `npm run type-check` on Node 22
2. `test-integration` — with PostgreSQL service container (`pgvector/pgvector:pg16`)
3. `test-cache` — with Redis service container
4. `lint` — ESLint

**Service containers:** `pgvector/pgvector:pg16` (includes pg_trgm), `redis:7-alpine`

**Triggers:** Push to `main`, all PRs. Matrix test on Node 20 and 22.

### 5. Publish to npm as @salishforge/memforge

**Labels:** `enhancement`, `infrastructure`

Package.json is configured with exports, bin entries, and files list. Needs:
- npm account setup for @salishforge scope
- GitHub Actions publish workflow (on tag push)
- Verify `npm pack` includes only intended files
- Test installation in a fresh project

---

## Performance

### 6. Streaming consolidation for large hot-tier backlogs

**Labels:** `enhancement`, `performance`

`consolidate()` loads all pending hot-tier rows into memory at once (up to `CONSOLIDATION_BATCH_SIZE`, default 500). For agents with large backlogs (10K+ events), this causes high memory usage.

**Approach:** Use cursor-based pagination — process 50 rows at a time, commit each batch independently. Requires breaking the single-transaction model into per-batch transactions with idempotent re-runs.

**Challenges:**
- Transaction boundaries: currently entire consolidation is one transaction
- Error recovery: partial progress must be preserved on crash
- LLM calls remain the real bottleneck regardless of streaming

### 7. Connection pool tuning and health checks

**Labels:** `enhancement`, `performance`

The PostgreSQL connection pool uses default `pg.Pool` settings. For production workloads:
- Pool size should auto-scale based on concurrent requests
- Idle connection cleanup should be configured
- Connection health checks should detect stale connections
- Pool exhaustion should return clear errors, not hang

---

## Features

### 8. Multi-model revision strategy for sleep cycles

**Labels:** `enhancement`, `feature`

Currently sleep cycles use a single LLM for all revisions. A smarter approach:
- **Cheap model** (Ollama/local) for `compress` and `none` decisions
- **Capable model** (Claude/GPT-4) for `correct` and `augment` on high-importance memories
- **Two-pass triage**: cheap model classifies revision type, expensive model executes non-trivial revisions

This could reduce sleep cycle LLM costs by 60-80% while maintaining quality for important memories.

### 9. Cold tier querying and restoration

**Labels:** `enhancement`, `feature`

Cold tier is write-only — archived memories cannot be searched or restored. Useful for:
- Auditing: "what did the agent know about X before the revision on date Y?"
- Recovery: restore accidentally evicted memories
- Compliance: prove what the agent knew at a specific point in time

**Approach:** Add `GET /memory/:agentId/cold?q=...` search endpoint and `POST /memory/:agentId/restore` to move cold→warm.

### 10. Webhook/event system for memory lifecycle events

**Labels:** `enhancement`, `feature`

External systems may want to react to memory events:
- Memory consolidated (new warm-tier entry)
- Memory revised (content changed)
- Memory evicted (moved to cold tier)
- Reflection created (new insights available)
- Entity merged (dedup occurred)

**Approach:** Optional webhook URL per agent. POST event payloads on lifecycle transitions. Could also support Redis pub/sub for local integrations.

### 11. Memory namespaces/tags for content organization

**Labels:** `enhancement`, `feature`

All memories for an agent are in a single namespace. For agents with diverse responsibilities, it would help to tag or namespace memories:
- `project:frontend` vs `project:backend`
- `type:decision` vs `type:observation`
- Query filters by tag/namespace

This would improve retrieval precision for agents managing multiple domains.

### 12. Configurable importance scoring weights per agent

**Labels:** `enhancement`, `feature`

Importance scoring weights (recency=0.25, frequency=0.20, centrality=0.20, reflection=0.15, stability=0.20) are global. Different agents may need different profiles:
- A customer support agent should weight recency highly
- A research agent should weight centrality and reflection higher
- A monitoring agent should weight frequency highest

**Approach:** Store weight profiles in agent metadata, read during sleep cycle Phase 1 scoring.

---

## Security & Operations

### 13. Add CORS configuration

**Labels:** `enhancement`, `security`

No CORS headers are set. If MemForge is accessed from browser-based agents or dashboards, proper CORS configuration is needed. Should be configurable via env vars (`CORS_ORIGIN`, `CORS_METHODS`).

### 14. Add request logging/audit trail

**Labels:** `enhancement`, `operations`

No structured request logging beyond console.error for errors. For production:
- Structured JSON logging (timestamp, method, path, status, duration, agentId)
- Configurable log level
- Request ID for tracing
- Separate access log from error log

### 15. Add graceful cold tier cleanup/retention policy

**Labels:** `enhancement`, `operations`

Cold tier grows indefinitely — no retention policy, no hard deletion. For long-running agents this becomes a storage concern.

**Approach:** Add `COLD_TIER_RETENTION_DAYS` env var. Sleep cycle or cron job prunes cold-tier entries older than retention period. Must be opt-in (default: keep forever).

---

## Documentation

### 16. Add integration guides for common agent frameworks

**Labels:** `documentation`

MemForge is framework-agnostic but users need guidance for specific integrations:
- LangChain/LangGraph memory integration
- AutoGen agent memory
- CrewAI agent memory
- Custom agent loop with MCP
- Claude Code with MCP (already partially documented)

### 17. Add architecture decision records (ADRs)

**Labels:** `documentation`

Key decisions (pure Postgres, no Neo4j, no built-in scheduler, pluggable providers) are mentioned in CLAUDE.md but not formally recorded with rationale. ADRs help contributors understand *why* things are the way they are.
