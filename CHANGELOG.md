# Changelog

All notable changes to MemForge are documented here.

## [Unreleased]

### Added

- **Claude Dreaming compatibility — Layer 3 (Service)** — when
  `DREAMS_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` are set, dream
  runs created with `source: 'anthropic'` delegate the curation pass
  to Anthropic's Dreams API after the local sleep cycle finishes.
  Local Phase 1/2/2.5/3 still run with MemForge's domain-specific
  scoring (drift, frequency, role-aware importance); Anthropic wins
  `content` and dedup, MemForge wins `importance`, `confidence`,
  `valid_until`, and graph metadata. `dream_runs.cost_usd_micros`,
  `usage_in_tokens`, `usage_out_tokens`, `external_dream_id`,
  `external_memory_store_id`, `external_output_store_id` populated
  on completion. New module `src/dreams-anthropic.ts` (HTTP client,
  retries, budget, mapper) — no `@anthropic-ai/sdk` runtime dep so
  the integration stays optional. New env: `DREAMS_PROVIDER`,
  `DREAMS_MODEL`, `DREAMS_BUDGET_USD_MICROS` (per-agent rolling 24h
  cap, default $5), `DREAMS_KILL_SWITCH`. Failure modes: 401/403
  fail the run (no fallback — surfaces misconfiguration); 429/5xx
  retry up to 3× with exponential backoff, then fall back to local
  cycle and annotate `error='anthropic_unavailable_local_fallback'`.
  Tests in `tests/dreams-anthropic.test.ts` cover success, 401 hard-
  fail, and 5xx local fallback against a stub Anthropic server.

- **Claude Dreaming compatibility — Layer 2 (Drop-in)** — adds the
  `/v1/dreams` route group that mirrors Anthropic's Managed Agents
  Dreams API shape (`POST /v1/dreams`, `GET /v1/dreams/:id`,
  `POST /v1/dreams/:id/cancel`). Lets callers written against
  `client.beta.dreams.create()` swap base URLs and keep their
  request/response code unchanged. `memory_store_id` is treated as
  the MemForge `agent_id` directly — no extra registry table for a
  feature whose primary value is shape compatibility. New
  `ANTHROPIC_COMPAT_ALLOW_ANY_TOKEN` env (default `false`) gates the
  `x-api-key` auth fallback; the `Authorization: Bearer` path always
  works. Errors return Anthropic's `{ type, error: { type, message } }`
  envelope, not MemForge's `{ ok, error }` shape — matches what the
  Anthropic SDK expects to deserialize. New `OpenAPI` tag
  `DreamsCompat` separates the drop-in surface from native `/dreams`.
  Tests in `tests/dreams-compat.test.ts` cover x-api-key + Bearer paths,
  strict-zod rejection of unknown fields, the session_ids cap, and
  Anthropic-shape responses.

- **Claude Dreaming compatibility — Layer 1 (Parity)** — async
  sleep-cycle job model with first-class run records, status polling,
  and cancellation, mirroring Anthropic's "Dreams" feature shape so
  external orchestrators built against `client.beta.dreams.create()`
  have a familiar surface on MemForge. New `dream_runs` table
  (migration `v3.6.sql`) with run id, immutable input snapshot
  (warm-row id capture at run-start), session_id scoping (≤100 to
  match Anthropic's cap), free-text instructions plumbed into Phase 3
  (Revision) prompts, and lifecycle pending → running → completed |
  failed | canceled. Worker (`src/dream-runs.ts`) wakes on
  `LISTEN dream_runs_inserted` and uses `FOR UPDATE SKIP LOCKED` so
  multi-instance deployments don't double-process. New routes
  `POST /memory/:id/dreams`, `GET /memory/:id/dreams/:runId`,
  `GET /memory/:id/dreams`, `POST /memory/:id/dreams/:runId/cancel`.
  TypeScript SDK adds `client.dreams.{create, status, list, cancel,
  waitFor}` matching the Anthropic SDK shape so callers can swap
  providers with a base-URL change. MCP tools:
  `memforge_dreams_create`, `memforge_dreams_status`,
  `memforge_dreams_list`, `memforge_dreams_cancel`. The synchronous
  `/sleep` route is unchanged — `/dreams` is additive. Cancellation
  inside a running cycle exits at the next phase boundary via a new
  `DreamCancellationError`. `output_mode='new_namespace'` is rejected
  at the boundary pending namespace-scoped sleep phases (a follow-up).

- **Selective forgetting (deprecated namespaces)** — closes the
  fourth and final residual Phase 4 item from the ROADMAP. Operators
  can now mark a namespace as deprecated via
  `POST /memory/:id/namespaces/:ns/deprecate`; sleep cycle Phase 5.10
  decays importance (−0.1/cycle) and confidence (−0.05/cycle) on
  warm_tier rows in that namespace each subsequent cycle. Eviction
  is handled by the existing Phase 2 path once importance falls
  below `evictionThreshold` — no new eviction logic. Graduated rows
  decay at half rate (importance −0.05, confidence −0.025) to
  reflect their earned stability. Reversible via
  `DELETE /memory/:id/namespaces/:ns/deprecate`. New
  `deprecated_namespaces` table (migration `v3.4.sql`).
  TypeScript SDK methods: `deprecateNamespace`,
  `undeprecateNamespace`, `listDeprecatedNamespaces` (also on the
  resilient client). MCP tools: `memforge_deprecate_namespace`,
  `memforge_undeprecate_namespace`,
  `memforge_list_deprecated_namespaces`. `SleepCycleResult` exposes
  `deprecated_decayed` when non-zero.

- **Reflection-driven revision priorities** — warm_tier rows cited
  by a recent (≤14 days) reflection whose `contradictions` array is
  non-empty are now flagged for revision regardless of confidence
  or retrieval outcomes. This is the third entry channel into the
  Phase 2 revision queue, alongside the existing "gap" (low
  confidence) and "outcome" (negative-dense) channels.
  Meta-reflections (`reflection_level > 1`) rank above first-order
  reflections in the priority order — they capture deeper pattern
  matching across prior reflections, so memories they cite get
  attention first. The `meta_contradiction_debt` signal in
  `sleepAdvisory()` continues to escalate overall urgency; this
  change wires the same signal into the queue itself so the next
  cycle actually focuses on what the reflections flagged.

- **Outcome-driven revision priorities** — memories that cause
  observed failures now enter the revision queue regardless of
  current confidence. Phase 2 triage widens its entry gate: a
  warm_tier row with ≥2 negative retrievals in the last 7 days and
  a >50% negative ratio is flagged for revision even if its
  confidence is still high. Phase 1 scoring also drifts confidence
  downward (−0.1/cycle, or −0.05 for graduated rows) when a row has
  ≥3 negatives and >50% negative ratio — the "learn from mistakes"
  channel that keeps chronic failures visible across cycles until
  they either get revised or drop into eviction.

- **Incremental embedding migration** — warm_tier rows now carry their
  embedding provider identity (`embedding_model`, e.g.
  `openai/text-embedding-3-small`, `huggingface/Xenova/bge-small-en-v1.5@q8`).
  Sleep cycle Phase 5.9 re-embeds rows whose `embedding_model` differs
  from the current provider at up to `EMBEDDING_MIGRATION_BATCH` rows
  per cycle (default 100). Legacy rows with NULL `embedding_model` are
  backfilled under the current provider. Dimension mismatches are
  refused — that case requires an explicit column rebuild. The
  `SleepCycleResult` now includes `embeddings_migrated` and
  `embeddings_migration_backlog` when non-zero.
- **Stats endpoint** (`GET /memory/:id/stats`) now reports
  `stale_embedding_count` — the number of warm_tier rows scheduled for
  re-embedding by the next sleep cycle. Omitted when embeddings are
  disabled.

### Security

- **Local embedding provider migrated to `@huggingface/transformers`**
  (replaces the unmaintained `@xenova/transformers`). Closes a
  critical-severity transitive CVE chain
  (`@xenova/transformers` → `onnxruntime-web` → `onnx-proto` →
  `protobufjs <7.5.5`, [GHSA-xq3m-2v4x-88gg](https://github.com/advisories/GHSA-xq3m-2v4x-88gg),
  arbitrary code execution). `npm audit` is now clean.

### Changed

- **Optional peer dependency renamed**: install
  `@huggingface/transformers` (≥4.2.0) instead of
  `@xenova/transformers` when using `EMBEDDING_PROVIDER=local`.
- **`LocalEmbeddingProvider` options**: the `quantized: boolean`
  option is replaced by `dtype: 'q8' | 'fp16' | 'fp32' | 'q4'`
  (default `'q8'` matches the prior quantized default).
- Model names (`Xenova/bge-small-en-v1.5`, etc.) are unchanged —
  Hugging Face kept the legacy paths.

## [3.2.0] - 2026-04-18 — Phase 4 (Sprint B): Continuous Adaptation

Opens Phase 4 of the ROADMAP with temporal knowledge management,
procedural evolution, and drift detection. Sleep cycles now penalize
expired memories, evolve procedure confidence from observed outcomes,
and record drift snapshots so advisory urgency reflects degrading
trends.

### Added

- **Temporal knowledge management** — new `warm_tier.valid_until`
  column (nullable) sets a validity window on a memory.
  `POST /memory/:id/:warmId/validity` writes it; pass `valid_until: null`
  to clear. Sleep cycle Phase 5.6 penalizes expired rows
  (confidence −0.2 with floor 0.05, surprise_score = 1.0) so the
  next cycle's triage flags them for LLM revision.
- **Procedural evolution** — `POST /memory/:id/procedures/:procId/outcome`
  records a `positive`/`negative`/`neutral` outcome against a
  procedure. Sleep cycle Phase 5.7 adjusts confidence from the
  observed distribution: ≥5 successes and ≤20% failure rate lifts
  confidence by 0.05; ≥3 failures and >50% failure rate drops it by
  0.1 and deactivates the procedure once confidence falls below 0.1.
  New columns `success_count`, `failure_count`, `last_outcome`,
  `last_outcome_at` on `procedures`.
- **Drift detection** — new `drift_signals` table captures a per-cycle
  snapshot of `contradiction_rate`, `staleness_p90`,
  `revision_velocity`, `stale_cluster_count`, and `expired_count`.
  Sleep cycle Phase 5.8 records one row per cycle.
  `GET /memory/:id/drift` returns a trend classification
  (`stable | degrading | recovering | insufficient_data`) from the
  last 10 snapshots. `sleepAdvisory()` gains a seventh signal —
  `knowledge_drift` — which escalates urgency when
  contradiction or staleness trends rise.
- **Embedding-model tracking** — new `warm_tier.embedding_model`
  column (nullable) records which model produced each embedding so
  future incremental re-embedding knows what to migrate.

### Surface

All three endpoints are exposed via HTTP, the TypeScript SDK
(base + resilient clients: `setMemoryValidity`,
`recordProcedureOutcome`, `detectDrift`), MCP tools
(`memforge_set_validity`, `memforge_record_procedure_outcome`,
`memforge_drift`), and the OpenAPI spec.

### Schema

Migration `schema/migration-v3.3.sql` — safe to run on existing
databases. Adds columns and the `drift_signals` table; indexes:
`warm_tier_valid_until_idx` (partial on `valid_until IS NOT NULL`),
`drift_signals_agent_idx`.

---

## [3.1.0] - 2026-04-18 — Phase 3 completion: Cross-Agent Learning

Completes Phase 3 of the ROADMAP. Adds procedure sharing across pools,
expertise discovery across pool members, and role-aware memory — the
remaining three items that were deferred from the initial Phase 3 cut.

### Added

- **Procedure sharing** — `POST /pool/:id/procedures/publish/:agentId`
  copies an agent's active procedures to a shared pool with a 0.8×
  confidence discount (same hearsay model as memory publishing).
  `GET /pool/:id/procedures?q=` returns active shared procedures ranked
  by confidence and corroboration count. New `shared_procedures` table
  (`schema/migration-v3.2.sql`). Available via HTTP, MCP
  (`memforge_publish_procedures`, `memforge_shared_procedures`),
  TypeScript SDK, and OpenAPI.

- **Expertise discovery** — `GET /pool/:id/expertise?q=topic` ranks
  pool members by FTS relevance score across all their warm-tier
  memories. Returns per-agent score, match count, and top matching
  memory excerpts. Use this to route questions to the right agent in
  a multi-agent system. Available via HTTP, MCP (`memforge_expertise`),
  TypeScript SDK, and OpenAPI.

- **Role-aware memory** — agents declare or auto-detect expertise
  domains. `POST /memory/:id/roles` declares a role (upserts on
  `(agent_id, domain)`). `GET /memory/:id/roles` returns all roles
  ordered by confidence. `DELETE /memory/:id/roles/:domain` removes
  one. `POST /memory/:id/roles/detect` auto-detects domains from the
  knowledge graph entity-type distribution and active procedure count —
  no LLM required. New `agent_roles` table
  (`schema/migration-v3.2.sql`). Available via HTTP, MCP
  (`memforge_declare_role`, `memforge_roles`, `memforge_detect_roles`),
  TypeScript SDK, and OpenAPI.

### Changed

- `deletePool()` comment updated to note that `shared_procedures` also
  cascades on pool deletion.

---

## [3.0.0-beta.4] - 2026-04-18 — Phase 2: Long-Term Memory at Scale

Completes Phase 2 of the ROADMAP. Adds domain partitioning, cold-tier
recovery, hard memory budgets, and adaptive scheduling hints — plus the
first release publishing via npm **Trusted Publishing (OIDC)** instead
of a long-lived token.

### Added

- **Memory namespaces (#16)** — optional `namespace` argument on
  `add` / `query` / `consolidate` / `timeline` / `stats` / `resume` /
  `export` / `import` / `pruneColdTier`. Default namespace is
  `'default'`, so existing callers are unaffected. Entities and
  relationships remain agent-scoped (knowledge graph shared across
  namespaces by design). Migration `schema/migration-v3.1.sql`
  adds a `namespace TEXT NOT NULL DEFAULT 'default'` column to
  eight memory tables with composite `(agent_id, namespace)` indexes.
  Public surface covers HTTP, MCP, TypeScript SDK, Python SDK, and
  OpenAPI. Sleep cycles are intentionally agent-wide (not
  namespace-scoped) — the 10-phase cycle doesn't yet filter by
  namespace, and `SleepSchema` explicitly does not accept a
  namespace argument so the API doesn't claim behavior it can't
  deliver.
- **Cold tier search + restoration (#14)** —
  `MemoryManager.searchColdTier(agentId, opts)` filters archived
  rows by content substring, namespace, archive-timestamp range,
  and source table with limit/offset paging.
  `restoreColdTier(agentId, coldTierId, opts?)` copies a cold row
  back into warm tier non-destructively (cold row preserved, warm
  row stamped with `metadata._restored_from_cold_id` for audit).
  New routes `GET /memory/:id/cold` and `POST /memory/:id/restore`,
  plus MCP tools and SDK methods. No schema migration needed.
- **Memory budgeting** — new opt-in `WARM_TIER_MAX_PER_AGENT` env
  var enforces a per-agent hard cap on warm_tier rows. Capacity
  eviction runs as Phase 2b of the sleep cycle (after threshold
  eviction) and archives lowest-importance rows — not oldest —
  until the cap is met. Uses the existing `warm_tier_importance_idx`
  for efficient scans. Graduated memories are NOT exempt: cap is a
  hard limit; graduation affects retrieval scoring only.
  `SleepCycleResult.capacity_evicted` is set when a cap is
  configured.
- **Adaptive sleep advisory (Phase 2 adaptive scheduling)** —
  `MemoryManager.sleepAdvisory(agentId)` returns a
  health-metric-based scheduling recommendation over five signals:
  hot backlog, contradiction rate, revision debt, time since last
  sleep, and an inverse stability signal that clamps urgency
  downward when the knowledge base is highly graduated.
  `recommended` flips to `true` at urgency `'medium'` or `'high'`.
  External orchestrators (cron, dashboards, control planes) call
  this instead of scheduling blindly — MemForge stays
  scheduler-free by design. New HTTP route
  `GET /memory/:id/sleep/advisory`, MCP tool `memforge_sleep_advisory`,
  and SDK methods on both TS and Python clients. Thresholds
  configurable via `SLEEP_ADVISORY_*` env vars.
- **Optional HNSW index template** (#95) — new
  `schema/hnsw-indexes.example.sql` documents how operators who use
  embeddings should pin the `warm_tier.embedding` and
  `shared_memories.embedding` halfvec columns to their provider's
  dimension and build HNSW indexes for fast cosine similarity.
  Common dimensions (384, 768, 1536, 3072) listed inline.

### Changed

- **npm publish switched to Trusted Publishing (OIDC)** — release
  workflow no longer requires `NODE_AUTH_TOKEN`; the
  `id-token: write` permission is enough, and npm validates the
  publish came from this specific repo + workflow via OIDC. No
  long-lived token to rotate or leak. The `NPM_TOKEN` secret can
  now be deleted from the repo (kept as fallback for beta.4 out
  of caution).
- **`schema/schema.sql`** no longer tries to build HNSW indexes on
  bare-dimension halfvec columns (#95). The two failing
  `CREATE INDEX ... USING hnsw` statements have been replaced with
  comments pointing to `hnsw-indexes.example.sql`. Fresh installs
  without embeddings are now silent (no `psql` ERROR lines); installs
  with embeddings apply the example after choosing a dimension.
  Semantic search falls back to sequential scan on unindexed halfvec
  columns — correct but slower.
- **Bumped `package.json` to `3.0.0-beta.4`**.
- **Closed GitHub issues** — #10 (npm publish), #14 (cold tier
  search + restoration), #16 (namespaces), #17 (per-agent weights
  — previously shipped in v2.4), #18 (CORS), #35 (audit
  immutability), #43 (global rate limiting), #46 (deployment
  security guide), #50 (knowledge graduation). All were already
  shipped but not yet closed on the tracker.

### Known gaps documented

- **#13 Multi-model revision — two-pass triage variant** — still
  future work. The basic cheap/capable split via
  `REVISION_LLM_PROVIDER` already works today.
- **#41 Redis cache poisoning** — confirmed `src/cache.ts` does not
  Zod-validate deserialised cache entries. Future security sprint.
- **#21 Integration guides** — LangChain and CrewAI are covered;
  AutoGen remains gap in `INTEGRATION.md`.
- **#22 Architecture Decision Records** — still future docs work.

## [3.0.0-beta.3] - 2026-04-17 — Documentation & Schema Consolidation

This release regularizes the `v3.0.0-beta.x` series. `v3.0.0-beta.1` and
`v3.0.0-beta.2` were tagged without a CHANGELOG entry; the changes below
cover everything since `v2.7.1` that had not yet been documented, plus the
documentation and schema cleanup landed in beta.3 itself.

### Added

- **RLS policies and audit delete trigger in canonical `schema/schema.sql`** — Fresh installs are now secure-by-default. Previously, Row-Level Security and the audit chain delete prevention trigger required running `migration-v2.3.sql` as a separate step; both are now included in `schema.sql`. The application role (DB owner or member of `memforge_app`) continues to bypass RLS, so normal app operation is unchanged. RLS now protects against cross-agent reads when non-owner roles connect directly to the database.
- **Idempotent `DROP POLICY IF EXISTS` before each `CREATE POLICY`** in both `schema.sql` and `migration-v2.3.sql`, so operators can safely re-run either script without errors.

### Changed

- **Version strings regularized across the project.** `package.json` bumped from `2.2.0` (stale) to `3.0.0-beta.3`. `CLAUDE.md` Section 11 and `ROADMAP.md` now agree on the current version.
- **`migration-v2.3.sql` scope clarified** — the header now notes that Parts A (RLS) and B (audit trigger) have been folded into `schema.sql` for v3+ fresh installs; this migration should only be applied when upgrading a deployment originally installed on v2.2 or earlier.
- **Type surface tightening across the codebase** (21 commits since `v3.0.0-beta.2`, PR #86 and related): unexported internal provider configs, narrowed JSON-schema types, DRY'd deduplication helpers, consolidated the pipeline type graph, removed dead types and stale re-exports, tightened SQL parameter types, dropped unnecessary try/catch blocks that hid errors, and narrowed cache return types.
- **Comment cleanup across modules** — stale issue-number references, attribution comments, and "fix-reference" annotations removed in favor of comments that describe behavior. No functional changes.
- **`ROADMAP.md`** updated to reflect that Phase 1 hardening is substantially complete (3 of 4 Tier 1 HARDENING items done; prompt injection defenses, consolidation race fixes, and sleep-cycle mutex are in place).

### Removed

- **`BACKLOG.md`** — the file was stale (its items had either been shipped or superseded by GitHub issues). README references have been redirected to the GitHub issue tracker and `ROADMAP.md`.

### Internal (unreleased previously)

- **`v3.0.0-beta.1` → `v3.0.0-beta.2` (cb83cf7)** — test and CI stabilization: test-race fixes in reflection/meta-reflection paths, SQL bug fixes in graph CTE and import-entities, HTTP test alignment, singleton DB pool teardown in CI, cache test hang fix, and lint cleanup. No production behavior changes.

## [2.7.1] - 2026-04-08 — Beta Release Cleanup

### Changed

- **`@xenova/transformers` is now an optional peer dependency** — It is no longer installed by default. Run `npm install @xenova/transformers` explicitly when using `EMBEDDING_PROVIDER=local`. No change for deployments using `openai`, `ollama`, or `none` embedding providers.
- **`/api/docs` removed Swagger UI** — The interactive Swagger UI has been removed. `/api/docs` now redirects to `/api/spec.json`. The raw OpenAPI 3.0 spec remains available at `/api/spec.json`.
- **`schema/schema.sql` regenerated as complete 21-table fresh-install schema** — The canonical schema now reflects all tables through v2.7. New installs no longer need to run any migrations; a single `psql -f schema/schema.sql` is sufficient. Migrations remain in `schema/migration-*.sql` for upgrading existing deployments.
- **`schema/migration-v2.3.sql` SQL syntax fixed** — Corrected a syntax error in the RLS migration that caused failures on some PostgreSQL configurations.

### Removed

- **Dead code removed from `src/memory-manager.ts`** — The following features were implemented but never wired into the retrieval pipeline and have been removed: `postIngestAnalysis`, `llmIngestAnalysis`, preference extraction, correction detection, and term-memory affinity scoring. These had no effect on query results. `memory-manager.ts` is now ~2,400 lines (down from ~2,727).

## [2.7.0] - 2026-04-08

### Changed

- **halfvec (float16) vector storage** — Vector embeddings now stored as `halfvec` (pgvector float16) instead of `float32 vector`. 2x storage compression with zero quality loss. Validated by TurboQuant research.
- Migration `schema/migration-v2.7.sql` — Converts existing `vector` columns to `halfvec` for all deployments upgrading from v2.6.x.

## [2.6.0] - 2026-04-08

### Features

#### Python SDK

- **`MemForgeClient`** — 18 async methods over `httpx` mirroring the TypeScript SDK. Full type annotations via `memforge/types.py`.
- **`ResilientMemForgeClient`** — Wraps `MemForgeClient` with per-method error handling. Returns safe defaults (empty arrays, null) on any error rather than raising. Accepts a custom `on_error` callback for logging.
- **`ConversationMemory`** — Chat-oriented adapter with `add_turn(role, content)`, `get_context(query)`, `start_session()`, and `end_session(session_id)`. Automatically consolidates on session end.
- **Tool definitions** — `memforge/tools.py` exports tool schemas for OpenAI function calling and Anthropic tool_use formats.
- Install: `pip install memforge` or `cd python/python && pip install -e .` for development.

#### Framework Examples (`examples/`)

- `quickstart.py` — Hello-world: add, query, sleep in Python
- `simple_chatbot.py` — Minimal chatbot with MemForge memory and graceful degradation
- `openai_tools.py` — OpenAI function calling with MemForge tool definitions
- `claude_tools.py` — Anthropic tool_use with MemForge tool definitions
- `langchain_memory.py` — LangChain custom memory integration
- `quickstart.ts` — Hello-world walkthrough in TypeScript

#### Docker Standalone

- `Dockerfile.standalone` — Single container with embedded PostgreSQL. Run `docker run -p 3333:3333 salishforge/memforge:standalone`. No external Postgres or Redis required.

#### Memory Export / Import

- `GET /memory/:agentId/export` — Download full warm-tier memory as JSONL. Each line: `{ content, importance, confidence, created_at, metadata? }`.
- `POST /memory/:agentId/import` — Bulk-load memories from JSONL into warm tier. Embeddings regenerated if provider is configured.
- TypeScript: `client.export(agentId)` / `client.import(agentId, jsonl)`.
- Python: `await client.export(agent_id)` / `await client.import_memories(agent_id, jsonl)`.

#### Webhooks

- `WEBHOOK_URL` env var — POST event payloads to this URL after significant operations.
- `WEBHOOK_EVENTS` env var — Comma-separated filter: `consolidated`, `revised`, `reflected`, `evicted`, `graduated`. Omit to receive all.
- Payload: `{ event, agentId, data, timestamp }`. Delivery is best-effort (no retry on failure).

#### ChatGPT Plugin

- `public/ai-plugin.json` — ChatGPT plugin manifest for direct ChatGPT integration against a publicly accessible MemForge instance.

### Active Knowledge Management (#75–#80)

- **Staleness detection** (#78) — `staleness_score REAL` column added to `warm_tier`. Computed in sleep Phase 0 based on age, corroboration count, and access recency. Confidence auto-reduces on memories with high staleness. `health()` now reports `stale_memory_count` and `avg_staleness`.
- **Prioritized experience replay** (#79) — `surprise_score REAL` column added to `warm_tier`. Incremented when a memory transitions from positive to negative feedback (unexpected contradiction). Sleep Phase 3 processes memories in descending `surprise_score` order, ensuring surprising experiences are revised first.
- **Conflict resolution** (#80) — Sleep Phase 2.5 identifies contradictory warm-tier memory pairs via semantic similarity + entity overlap. Multi-factor resolution scoring: supersession annotations take priority, then corroboration count, then temporal recency, then confidence. Results stored in `memory_conflicts` table with `winner_id` and `resolution_strategy`.
- **Temporal event chains** (#76) — Sleep Phase 4b links warm-tier memories that are temporally adjacent (within a configurable gap window). Chains stored in `memory_sequences` table with `gap_seconds`. Enables causal and sequential reasoning queries.
- **Knowledge gap detection** (#77) — Zero-result query texts recorded in `knowledge_gaps` table. Deduplicated per agent (same query text → update `detected_at` rather than insert). Hard cap of 1000 gaps per agent. `health()` now reports `knowledge_gap_count_7d`.
- **Schema detection** (#75) — Sleep Phase 5.5 scans `memory_sequences` for repeated temporal patterns and crystallizes them as `entity_type='schema'` entries in the knowledge graph. Enables pattern recognition across multiple event chains.

### Security (Round 9)

- Agent-scoped conflict resolution queries — `memory_conflicts` JOIN enforces `agent_id` predicate, preventing cross-agent data leakage in conflict queries.
- Multi-factor conflict heuristic — Replaces earlier cascading priority approach with deterministic multi-factor scoring. Audit confirmed no tie-breaking ambiguity.
- Feedback deduplication — Each `(agent_id, retrieval_id)` pair may only receive one feedback event. Duplicate submissions return `409 Conflict`. Prevents adversarial feedback spam.
- Knowledge gap dedup — Duplicate zero-result queries update `detected_at` rather than accumulating unboundedly.
- Batched retrieval logging — Per-query `INSERT` into `retrieval_log` replaced with single `INSERT ... SELECT unnest(...)` per consolidation batch. Eliminates N+1 insert pattern.
- All new endpoints and migration objects confirmed clean at MEDIUM+ in round 9 audit.

### Infrastructure

- Migration `schema/migration-v2.6.sql` — 3 new tables (`memory_conflicts`, `memory_sequences`, `knowledge_gaps`), 3 new columns (`warm_tier.surprise_score`, `warm_tier.staleness_score`, `warm_tier.last_corroborated`).
- `python/` directory — Python SDK and examples added to repository.

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
- **LongMemEval Benchmark Harness** — `benchmarks/` directory contains the full evaluation harness, 500-question dataset driver, reproducible run scripts, retry logic with incremental manifest saving. Current score: 93.2% R@5 (hybrid mode), 35.0% R@5 (keyword mode).

### Security

- **Zod Input Validation** — All REST endpoints now validate request bodies and query parameters against Zod schemas (`src/schemas.ts`). Malformed input is rejected at the boundary with structured 400 responses.
- **Advisory Locks** — PostgreSQL advisory locks prevent concurrent sleep cycles from racing on the same agent. Lock acquisition is timed out (5 s) to prevent queue buildup.
- **Prompt Injection Boundaries** — LLM calls now wrap user-supplied content in explicit XML delimiters (`<user_content>…</user_content>`) and system prompts include injection-resistance instructions. Validated against a test suite of known injection patterns.
- **Row-Level Security Migration** — `schema/migration-v2.3.sql` adds PostgreSQL RLS policies on all agent-scoped tables. Applications connecting with per-agent roles get OS-level isolation, not just application-level.
- **SSRF Prevention** — Outbound HTTP calls from the embedding and LLM provider factories validate destination URLs against an allowlist. Private IP ranges are blocked.
- **Security Headers** — HTTP responses now include `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, and `Referrer-Policy` headers via the `helmet` middleware.
- **8 Rounds of Security Audits** — All rounds clean at MEDIUM+ severity. Prior rounds resolved 25 findings across authentication, input handling, SQL construction, LLM prompt safety, and deployment configuration. See `ADVERSARIAL-ASSESSMENT.md` and `DEPLOYMENT-SECURITY.md`.

### Performance

- **93.2% Recall@5 — Hybrid mode** — LongMemEval 500-question benchmark with `EMBEDDING_PROVIDER=local`. Full R@k: R@1 81.0% → R@3 90.8% → R@5 93.2% → R@10 96.4%. Per-category: knowledge-update 97.4% R@5 / 100.0% R@10, multi-session 96.2% / 98.5%, single-session-assistant 100.0% / 100.0%, temporal-reasoning 91.0% / 94.7%, single-session-user 87.1% / 90.0%, single-session-preference 80.0% / 93.3%. Closes to within 3.4 points of MemPalace (96.6%) while running on pure PostgreSQL.
- **35.0% Recall@5 — Keyword mode** — LongMemEval per-session keyword baseline. No embedding provider required. Lower score is expected — FTS is weak on short per-session rows. Use hybrid mode for best results.
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
