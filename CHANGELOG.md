# Changelog

All notable changes to MemForge are documented here.

## [2.2.0] - 2026-04-08

### Features

- **In-Process Local Embeddings** — `EMBEDDING_PROVIDER=local` generates embeddings in-process using `@xenova/transformers` with `Xenova/bge-small-en-v1.5` as the default model (7.3 ms/embed, ~137 embeds/sec on CPU). No external service, API key, or Ollama instance required. Model configurable via `EMBEDDING_MODEL`; output dimensions configurable via `EMBEDDING_DIMENSIONS`.
- **Concurrency-Limited Embedding Provider** — `ConcurrencyLimitedEmbeddingProvider` wraps Ollama and OpenAI embedding providers with a semaphore (`EMBEDDING_CONCURRENCY_LIMIT`, default 3). Prevents request pileup during large consolidation batches. Fixes #67.
- **Query Understanding — Preprocessing** — Query text is normalised before retrieval: question scaffolding ("what is", "tell me about", etc.) is stripped, time references ("yesterday", "last week", "two days ago") are automatically converted to `after`/`before` date filters, and compound queries are split at conjunctions for multi-query retrieval.
- **Multi-Query Retrieval** — Compound queries are split into up to 3 independent sub-queries, each run through the full retrieval pipeline. Results are merged by highest rank across sub-queries, improving recall on queries that combine unrelated topics.
- **Asymmetric RRF** — Reciprocal rank fusion now weights semantic results 1.5× relative to keyword results in hybrid mode, improving precision for conversational queries.
- **Result Deduplication** — Top-k results are deduplicated by a first-100-character fingerprint before returning to callers. Prevents near-identical consolidated rows from consuming multiple result slots.
- **Minimum Quality Threshold** — Results scoring below 10% of the top-ranked result's score are discarded, preventing low-quality noise from appearing in top-k output.
- **Entity Detection Boost** — Query terms matched against the knowledge graph entity table receive a scoring boost, improving recall for queries about known entities.
- **Term-Memory Affinity** — Positive feedback stores query-term → memory associations as affinity weights. Future retrievals for those query terms preferentially surface the associated memories, creating a retrieval reinforcement loop.
- **Active Ingest — Hints API** — `POST /memory/:agentId/hints` accepts structured retrieval hints (keywords, entities, temporal anchors) that bias future search scoring without requiring a full memory write. Agents can now participate directly in memory management.
- **Active Ingest — Preference Extraction** — Automatic extraction of user preferences from stored content during consolidation. Preferences are tagged and weighted for priority retrieval.
- **Active Ingest — Entity Detection** — Lightweight heuristic pre-screening detects named entities before sending content to the LLM, reducing unnecessary LLM calls.
- **Active Ingest — Supersession** — New memories can mark prior memories as superseded, propagating confidence decay and graph edge invalidation automatically.
- **Content Deduplication** — Trigram-similarity dedup check at ingest time. Near-duplicate content (>0.85 similarity) is merged rather than stored as a new row.
- **Confidence Graduation** — Memories that are repeatedly retrieved and receive positive feedback automatically graduate to higher confidence tiers, reducing LLM revision load.
- **Outcome Tagging** — Feedback events now carry structured outcome tags (`task_completed`, `user_corrected`, `agent_recovered`, etc.) for richer reinforcement signal.
- **Dual-Tokenizer Search** — Query pipeline now runs both `plainto_tsquery` and `websearch_to_tsquery` in parallel, merging results for better recall on natural-language queries.
- **Keyword Overlap Boost** — Configurable boost (`KEYWORD_OVERLAP_BOOST`, default 0.3) applied when query tokens overlap with memory content keywords, tunable per deployment.
- **Temporal Proximity Scoring** — Configurable proximity window (`TEMPORAL_PROXIMITY_DAYS`, default 7) boosts memories created near the query's temporal anchor.
- **Configurable Consolidation Batch Size** — `CONSOLIDATION_INNER_BATCH_SIZE` controls how many hot-tier rows are processed per inner loop iteration (default 50), allowing memory-vs-throughput tuning.
- **Agent Resumption Endpoint** — `GET /memory/:agentId/resume` returns a compact context bundle (recent memories, active entities, pending procedures, latest reflection) for fast agent warm-start after downtime or context window loss.
- **Post-Retrieval LLM Reranking** — Optional `ENABLE_LLM_RERANK=true` runs a lightweight LLM pass over top-k results to reorder by relevance. Disabled by default.
- **LLM-Assisted Ingest** — Optional `ENABLE_LLM_INGEST=true` extracts entities, sentiment, and tags at write time. Disabled by default to keep hot path fast.
- **Autonomous Weight Adaptation** — Sleep cycle Phase 1 now adjusts importance-weight hyperparameters based on retrieval outcome correlation, gradually tuning the scoring formula to deployment patterns.
- **LongMemEval Benchmark Harness** — `benchmarks/` directory contains the full evaluation harness, 500-question dataset driver, and reproducible run scripts. Current score: 88.0% R@5 (keyword mode).

### Security

- **Zod Input Validation** — All REST endpoints now validate request bodies and query parameters against Zod schemas (`src/schemas.ts`). Malformed input is rejected at the boundary with structured 400 responses.
- **Advisory Locks** — PostgreSQL advisory locks prevent concurrent sleep cycles from racing on the same agent. Lock acquisition is timed out (5 s) to prevent queue buildup.
- **Prompt Injection Boundaries** — LLM calls now wrap user-supplied content in explicit XML delimiters (`<user_content>…</user_content>`) and system prompts include injection-resistance instructions. Validated against a test suite of known injection patterns.
- **Row-Level Security Migration** — `schema/migration-v2.3.sql` adds PostgreSQL RLS policies on all agent-scoped tables. Applications connecting with per-agent roles get OS-level isolation, not just application-level.
- **SSRF Prevention** — Outbound HTTP calls from the embedding and LLM provider factories validate destination URLs against an allowlist. Private IP ranges are blocked.
- **Security Headers** — HTTP responses now include `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, and `Referrer-Policy` headers via the `helmet` middleware.
- **8 Rounds of Security Audits** — All rounds clean at MEDIUM+ severity. Prior rounds resolved 25 findings across authentication, input handling, SQL construction, LLM prompt safety, and deployment configuration. See `ADVERSARIAL-ASSESSMENT.md` and `DEPLOYMENT-SECURITY.md`.

### Performance

- **92.0% Recall@5 — Hybrid mode** — LongMemEval per-session benchmark with `EMBEDDING_PROVIDER=local`. Properly differentiated R@k: R@1 74% → R@3 88% → R@5 92% → R@10 94%. Closes to within 4.6 points of MemPalace (96.6%) while running on pure PostgreSQL.
- **88.0% Recall@5 — Keyword mode** — LongMemEval keyword-only baseline. No embedding provider required. Outperforms Hippo (74.0% R@5 BM25) by 14 percentage points.
- **Local embedding throughput** — `@xenova/transformers` with bge-small-en-v1.5: 7.3 ms/embed, ~137 embeds/sec on CPU, in-process with no network overhead.
- **Hybrid mode latency** — p50 32 ms, p95 47 ms per query (local PostgreSQL with local embeddings).
- **Keyword mode latency** — p50 39 ms, p95 50 ms per query (PostgreSQL FTS).
- Dual-tokenizer search reduces missed recall on natural-language queries by ~8% in internal testing.
- Keyword overlap boost improves MRR by ~0.04 on the LongMemEval multi-session category.
- Configurable batch size allows high-memory deployments to process consolidation 2-3x faster.

### Infrastructure

- **CI/CD Pipeline** — GitHub Actions workflow: `type-check` → `lint` → `test:integration` → `test:cache` → build on every push and pull request.
- **Structured Logging (pino)** — All log output is now structured JSON via pino (`src/logger.ts`). Request correlation IDs (`X-Request-Id`) propagate through all log entries. `LOG_LEVEL` env var controls verbosity.
- **App Factory Refactor** — Express application logic extracted from `src/server.ts` into `src/app.ts` (`createApp()` factory). `server.ts` is now a thin bootstrap (~115 lines). Enables in-process HTTP testing without port binding.
- **Mock LLM Test Suite** — `tests/llm-mock.test.ts` covers all LLM-dependent paths (summarize consolidation, reflection, meta-reflection, sleep cycle revision, procedural extraction) using an in-process mock provider. No API keys required.
- **HTTP API Test Suite** — `tests/http.test.ts` exercises all 18 REST endpoints via supertest against the `createApp()` factory. Covers auth, validation, and error responses.
- **Load Tests** — `tests/load.test.ts` validates p95 latency targets under 50 concurrent requests.
- **New migration files**: `schema/migration-v2.2.sql` (dedup, confidence, outcome tagging), `schema/migration-v2.3.sql` (RLS policies), `schema/migration-v2.4.sql` (hints, supersession, weight adaptation).

### Documentation

- `ADVERSARIAL-ASSESSMENT.md` — Full adversarial assessment: attack surface analysis, injection test results, finding severity breakdown.
- `HARDENING-PLAN.md` — Production hardening checklist and remediation tracking.
- `DEPLOYMENT-SECURITY.md` — Deployment security guide: network topology, secrets management, TLS, RLS setup, monitoring.
- `benchmarks/RESULTS.md` — Benchmark methodology and full LongMemEval results with per-category breakdown.

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
