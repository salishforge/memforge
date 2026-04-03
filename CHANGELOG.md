# Changelog

All notable changes to MemForge are documented here.

## [2.1.0] - 2026-04-02

### Added
- **Downstream Outcome Feedback** — `POST /memory/:agentId/feedback` records whether retrieved memories led to good outcomes. Positive feedback boosts memory importance, negative penalizes it. Closes the self-improvement loop.
- **Entity Deduplication** — Trigram similarity-based duplicate entity detection and merge. Runs automatically during sleep cycle Phase 4 and available as standalone `POST /memory/:agentId/dedup-entities` endpoint.
- **Hierarchical Meta-Reflection** — `POST /memory/:agentId/meta-reflect` synthesizes second-order principles from accumulated first-order reflections. Requires 3+ reflections. Produces level-2 reflections with a dedicated system prompt focused on cross-reflection patterns.
- **Active Recall / Proactive Surfacing** — `POST /memory/:agentId/active-recall` surfaces relevant memories and matching procedures given an action context. Prevents "forgot to look" failures.
- **Integration Test Suite** — `tests/integration.test.ts` with 15+ test cases covering agent registration, add/query, consolidation, timeline, clear/archival, stats, feedback, entity dedup, active recall, memory health, and input validation.
- **Sleep Cycle Scheduling Documentation** — README section with cron, MCP, idle-detection webhook, Claude Code hook, and workload-based cadence recommendations.
- 5 new MCP tools: `memforge_feedback`, `memforge_meta_reflect`, `memforge_dedup_entities`, `memforge_active_recall`
- 5 new LLM tool definitions for function calling
- 4 new client SDK methods: `feedback()`, `metaReflect()`, `deduplicateEntities()`, `activeRecall()`
- 4 new REST endpoints with OpenAPI documentation
- Database migration: `schema/migration-v2.1.sql`

### Changed
- `SleepCycleResult` now includes `phase4_entities_merged` count
- `Reflection` type now includes `reflection_level` and `source_reflection_ids` fields
- `ReflectionResult` now includes `reflection_level` field
- Sleep cycle Phase 4 now runs entity deduplication after graph maintenance
- README completely rewritten for v2.1.0 with full API reference, architecture diagram, and examples

## [2.0.0] - 2026-04-02

### Added
- **Sleep Cycle Engine** — 5-phase background processor: importance scoring → triage/eviction → LLM memory revision → graph maintenance → reflection. Configurable token budget, eviction and revision thresholds.
- **Memory Revision Engine** — LLM reviews low-confidence memories and decides to augment, correct, merge, compress, or leave as-is. Full revision history preserved in `memory_revisions` table.
- **Retrieval Event Logging** — Every query hit logged to `retrieval_log` table with query text, mode, and rank position for reinforcement analysis.
- **Composite Importance Scoring** — `importance = f(recency, frequency, centrality, reflection_count, revision_stability)` with configurable weights. Recalculated during sleep cycle Phase 1.
- **Importance-Weighted Search** — Search results boosted by memory importance score across all query modes.
- **Temporal Edge Annotations** — `valid_from`/`valid_until` on relationships for temporal knowledge graph.
- **Edge Invalidation** — Stale relationship edges decayed and invalidated during sleep cycle Phase 4.
- **Procedural Memory** — Condition→action rules extracted from reflections via LLM. Stored in `procedures` table, accessible via API.
- **Memory Health Metrics** — `GET /memory/:agentId/health` returns importance/confidence averages, revision velocity, knowledge stability, contradiction rate.
- **Configurable Revision LLM** — `REVISION_LLM_PROVIDER` env var allows a separate (e.g., cheaper local) model for sleep cycle revisions.

### Changed
- All search queries now factor in importance when ranking results
- Warm tier schema expanded with `importance`, `confidence`, `revision_count` columns
- Reflection now auto-extracts procedural memory from insights

## [1.5.0] - 2026-04-02

### Added
- **MCP Server** — Model Context Protocol server with 12 tools for Claude Code and MCP-compatible AI tools. Stdio transport, no external SDK dependency.
- **TypeScript Client SDK** — Zero-dependency HTTP client for Node.js, Deno, Bun, and browser environments.
- **LLM Tool Definitions** — Compatible with OpenAI function calling and Anthropic tool_use formats. `toOpenAITools()` converter included.
- **Docker Support** — Dockerfile with multi-stage build, docker-compose.yml with PostgreSQL and Redis services.

## [1.4.0] - 2026-04-02

### Added
- **Reflection Engine** — LLM-driven synthesis of higher-order insights from recent memories. Detects contradictions with prior reflections. Stores insights, contradictions, and source memory links.
- **Contradiction Detection** — Reflections identify conflicts between new and existing knowledge.
- Reflections stored in dedicated `reflections` table with array columns for insights and contradictions.

## [1.3.0] - 2026-04-02

### Added
- **LLM-Driven Consolidation** — `summarize` mode sends memory batches to an LLM for intelligent distillation. Extracts entities, relationships, key facts, and sentiment.
- **Knowledge Graph** — Entities and relationships extracted during summarize consolidation. Stored in `entities` and `relationships` tables with `warm_tier_entities` junction.
- **Graph Traversal** — `GET /memory/:agentId/graph` with recursive CTE supporting bidirectional traversal up to 5 hops with cycle detection.
- **Entity Search** — `GET /memory/:agentId/entities` with case-insensitive search, type filtering, and linked memory IDs.
- Pluggable LLM providers: Anthropic, OpenAI-compatible, Ollama.

## [1.2.0] - 2026-04-02

### Added
- **Vector Search** — pgvector HNSW index for semantic similarity search.
- **Hybrid Search** — Reciprocal rank fusion (RRF) combining keyword and semantic results.
- **Temporal Intelligence** — `time_start`/`time_end` bounds on warm tier rows. `after`/`before` query filters. Configurable temporal decay scoring.
- **Timeline Endpoint** — `GET /memory/:agentId/timeline` for chronological memory retrieval.
- **Access Tracking** — `access_count` and `last_accessed` on warm tier rows, incremented on query hits.
- Pluggable embedding providers: OpenAI-compatible, Ollama, NoOp.

## [1.1.0] - 2026-04-02

### Added
- **Redis Caching** — Three-tier cache with automatic invalidation on writes. ~10x query performance improvement.
- **Cache Dashboard** — Live monitoring UI at `/admin/cache/dashboard`.
- **Cache Admin API** — Stats and flush endpoints at `/admin/cache/*`.

### Changed
- Query and timeline endpoints now check cache before database.
- Write operations invalidate all cache entries for the affected agent.

## [1.0.0] - 2026-04-02

### Added
- Initial release: three-tier memory (hot → warm → cold)
- PostgreSQL full-text search with trigram fallback
- Hot→warm consolidation (concat mode)
- Multi-tenant isolation by agent ID
- Bearer token authentication with timing-safe comparison
- Express REST API with rate limiting
- Prometheus metrics and OpenAPI/Swagger documentation
- Health check endpoint
