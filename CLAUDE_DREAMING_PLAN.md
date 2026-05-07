# MemForge × Claude Dreaming — Feature Review & Integration Plan

> **Status (2026-05-07):** All four layers + cross-cutting docs landed on
> branch `feat/multi-device-identity` in commits `fea6ff9` (Parity),
> `dde1808` (Drop-in), `a6fa793` (Service), `bf9d55d` (Bridge),
> `a440695` (docs). 131/131 tests pass with `npm test --test-concurrency=1`.
> Two follow-ups deferred (orphaned running-row recovery on worker
> startup; `input_warm_ids[]` size cap for very large agents) and
> `output_mode='new_namespace'` is rejected at the API boundary
> pending namespace-scoped sleep phases. Pre-existing
> `tests/http-api.test.ts` hang is unrelated and reproduces on baseline.
> Anthropic memory-store wire format is undocumented; mapper isolated
> to `src/dreams-anthropic.ts` for a one-file refit when the spec is
> public.

## Context

**Why this exists.** Anthropic shipped "Claude Dreaming" (formally **Dreams**) for Managed Agents in beta on **2026-04-21**: an async background job (`POST /v1/dreams`) that reviews a Memory Store + up to 100 past sessions and writes a *new*, deduped, contradiction-resolved Memory Store. It's a single-pass curation primitive scoped to Anthropic's first-party Memory Store API.

MemForge already implements a richer 10+ phase **sleep cycle** (`src/sleep-cycle.ts`, ~1,445 lines) covering scoring, triage, conflict resolution, revision, graph maintenance, reflection, schema detection, temporal validation, procedure evolution, drift snapshots, embedding migration, deprecated decay, and audit archive. Functionally MemForge is a superset, but the surface, lifecycle, and data shapes don't line up — Dreams is async-job-with-runId, MemForge is synchronous-fire-and-forget; Dreams writes a *new* Memory Store, MemForge mutates in place; Dreams takes `session_ids[]`, MemForge has session_id headers (`feat/multi-device-identity`, current branch).

**Goal.** Make MemForge interoperate with Claude Dreaming across **all four directions** the user approved (Bridge, Service, Drop-in, Parity), across **REST + SDK + MCP**, with **Anthropic dependency optional** (graceful degradation), and built on top of `feat/multi-device-identity` so `session_ids[]` maps cleanly to MemForge's existing per-device session_id.

---

## Feature comparison

| Capability | Claude Dreaming (Anthropic) | MemForge (today) | Gap |
| --- | --- | --- | --- |
| Async job lifecycle (pending→running→completed/failed/canceled) | Yes, with run id | No — `/sleep` is synchronous | **Add** in Parity layer |
| Run-level audit / status polling | `GET /v1/dreams/:id` | None — `SleepCycleResult` is a one-shot return | **Add** `dream_runs` table |
| Cancellation mid-run | Yes (`POST /v1/dreams/:id/cancel`) | No | **Add** cancel endpoint + per-phase check |
| Input scoping by session ids (≤100) | Yes (`session_ids[]`) | Implicit via `session_id` header on hot rows (current branch) | Map `session_ids[]` → MemForge `session_id` filter |
| Immutable input / new output store | Yes (input never modified) | No — sleep cycle mutates warm tier | **Add** `output_mode: 'new_namespace'` |
| Free-text instructions on the run | Yes (≤4096 chars) | No | Plumb into Phase 3/5 prompts |
| Model selection per run | Anthropic-only (`claude-opus-4-7`/`sonnet-4-6`) | Pluggable provider (anthropic/openai/ollama/none) | MemForge already broader |
| Deduplication | Yes | Phase 4 (graph maintenance) + Phase 2.5 (conflicts) | MemForge richer |
| Contradiction resolution | Yes | Phase 2.5 with importance/confidence/recency heuristics | MemForge richer |
| Stale removal | Yes | Phase 2 (triage) + Phase 5.6 (temporal validation) | MemForge richer |
| Pattern surfacing | Implicit | Phase 5 (reflection) + Phase 5.5 (schema detection) | MemForge richer |
| Procedure extraction | No | Phase 5.7 procedure evolution | MemForge-only |
| Embedding migration | No | Phase 5.9 | MemForge-only |
| Knowledge graph | No | entities/relationships + recursive CTE traversal | MemForge-only |
| Plugin / pluggable backend | No | LLM provider interface only | Both lack memory-backend plugins |
| Multi-tenant identity | Per memory store | `agent_id` + `namespace` + `session_id` | MemForge richer |
| Cost / budget tracking | Standard token billing | Token budget per cycle (`SLEEP_CYCLE_TOKEN_BUDGET`) | Add USD cost tracking for Service layer |
| SDK shape | `client.beta.dreams.create()` polling | `client.sleep(...)` synchronous | **Add** `client.dreams.{create,status,list,cancel,waitFor}` |
| MCP tools | None first-party (community AutoDream) | 22 tools, none Dreams-shaped | **Add** Dreams MCP tools |

**Net read.** MemForge is the deeper system; Claude Dreaming is the more developer-friendly *envelope*. Integration value is mostly in adopting the envelope (async + run ids + immutable input/output) and making the wire compatible — not in catching up on capabilities.

---

## Integration architecture — four layers

Build order **Parity → Drop-in → Service → Bridge**. Every later layer reuses earlier substrate.

### Layer 1 — Parity (no Anthropic dependency)

Foundation: async job model, run ids, status polling, immutable input snapshot, optional new-namespace output.

- **New table `dream_runs`** with `id`, `agent_id`, `namespace`, `session_ids[]`, `model`, `instructions`, `status` (pending/running/completed/failed/canceled), `source` (local/anthropic/bridge_pull/bridge_push), `output_namespace`, `input_warm_ids[]` (snapshot via row-id capture, not `pg_export_snapshot()`), `external_dream_id`, `external_memory_store_id`, `external_output_store_id`, `usage_in_tokens`, `usage_out_tokens`, `cost_usd_micros`, `sleep_cycle_result` JSONB, `error`, `cancel_requested_at`, timestamps.
- **Worker model.** In-process, single-flight per agent. Wake on `LISTEN dream_runs_inserted` (preferred) with 250 ms poll fallback. Multi-instance correctness via `SELECT … FOR UPDATE SKIP LOCKED` on `status='pending'`. Document the lock pattern; don't introduce a separate scheduler service (Ten Commandments #7).
- **New endpoints** — `POST /memory/:id/dreams`, `GET /memory/:id/dreams/:runId`, `GET /memory/:id/dreams`, `POST /memory/:id/dreams/:runId/cancel`. Return 202 + Location for native async path.
- **`/sleep` extended** with optional `async`, `output_mode: 'in_place' | 'new_namespace'`, `instructions?`. Default unchanged (sync, in-place) — no breakage.
- **Cancellation**: each phase boundary in `runSleepCycle` checks `cancel_requested_at IS NOT NULL` (~10 LOC per phase).
- **Output namespace pattern**: `<original>__dream__<runId>` when `output_mode='new_namespace'`. Inherits deprecation/session-id semantics from parent.

### Layer 2 — Drop-in (Anthropic-shaped API on MemForge)

Pure presentation layer over Parity routes — lets users point existing Anthropic SDK code at MemForge with one base-URL change.

- **Routes** — `POST /v1/dreams`, `GET /v1/dreams/:dreamId`, `POST /v1/dreams/:dreamId/cancel`. Field names exactly mirror Anthropic's. Use `zod.strict()` to reject unknown fields.
- **Auth**: accept either `Authorization: Bearer <MEMFORGE_TOKEN>` or `x-api-key: <MEMFORGE_TOKEN>`. New env `ANTHROPIC_COMPAT_ALLOW_ANY_TOKEN` (default `false`) gates whether any MemForge token can be used as `x-api-key`, or only ones explicitly flagged.
- **Mapping** — `memory_store_id` → `agent_id`/`namespace`; `session_ids[]` → MemForge `session_id` filter; `model` → MemForge LLM provider (pass through when Anthropic; warn-and-translate otherwise); `instructions` → new `SleepCycleConfig.instructions?` field plumbed into Phase 3 (Revision, `src/sleep-cycle.ts:~L579`) and Phase 5 (Reflection, `~L1335`) prompt suffixes.
- **SDK additions** — `client.dreams.{create, status, list, cancel, waitFor}` mirroring Anthropic's SDK shape so users can swap providers with one import change. Same in Python.

### Layer 3 — Service (MemForge calls Anthropic Dreams)

Optional delegation: when `ANTHROPIC_API_KEY` set and `DREAMS_PROVIDER=anthropic`, MemForge can offload curation to Anthropic Dreams as **Phase 3.5** in the sleep cycle.

- **New env vars**: `DREAMS_PROVIDER` (`none`|`anthropic`|`local`, default `local`), `DREAMS_MODEL` (default `claude-sonnet-4-6`), `DREAMS_INPUT_SCOPE` (`warm-namespace`|`recent-window`|`full`), `DREAMS_BUDGET_USD_MICROS` (per-agent rolling 24h cap), `DREAMS_KILL_SWITCH` (boolean), `DREAMS_RATE_LIMIT_PER_AGENT_HOUR` (default 6).
- **Phase placement**: 3.5 *after* local Phase 3 revision. Take its candidate set, send to Anthropic, replace `content` where Anthropic confidence > local, but **keep MemForge's `importance`/`confidence`/`valid_until`**. Avoids wiping domain-specific scoring (Phase 2.5 conflict heuristics).
- **HTTP client** in new `src/dreams-anthropic.ts`: thin `fetch` wrapper, no `@anthropic-ai/sdk` runtime import (keeps dep optional). Header `anthropic-beta: dreaming-2026-04-21`. Add `api.anthropic.com` to `ALLOWED_LLM_HOSTS` allowlist only when provider is anthropic.
- **Memory-store mapping**: `WarmRow → { id, content, metadata: { importance, confidence, valid_until, namespace, session_id, embedding_model } }`. Mapper code shared with Bridge layer.
- **Failure modes**: 401/403 → mark `failed`, no fallback (security). 429/5xx → exponential backoff (3 retries) → fall back to `runLocalCycle` and annotate `error='anthropic_unavailable_local_fallback'`.
- **Hard cap** `session_ids.length ≤ 100` enforced in zod (Anthropic limit).

### Layer 4 — Bridge (MemForge ↔ Anthropic Memory Store sync)

Two-way sync surface so MemForge namespaces can be exported as Anthropic Memory Stores (and pulled back).

- **New table `anthropic_memory_stores`**: `agent_id`, `namespace`, `external_store_id`, `direction` (push/pull), `warm_row_count`, `last_pushed_at`, `last_pulled_at`, `pushed_lsn`, metadata.
- **New endpoints** — `POST /memory/:id/anthropic/push`, `POST /memory/:id/anthropic/pull`, `GET /memory/:id/anthropic/sync-state`. All take `strategy: 'memforge-wins' | 'anthropic-wins' | 'merge'`.
- **Reuses** Service layer's mapper code — same `WarmRow ↔ MemoryStoreRecord` translation.

### Cross-cutting

- **Schema migration** at `schema/migration-v3.6-claude-dreams.sql` plus a sync into canonical `schema/schema.sql` (per CLAUDE.md §8 — never modify existing columns, but new tables go into both).
- **Multi-device alignment**: dream runs scoped by `(agent_id, namespace, session_ids[])`. Output namespace inherits parent's `feat/multi-device-identity` semantics. Empty `session_ids[]` = scope-all.
- **Security**: secret scanner on `instructions` field (reuse `src/llm-safety.ts`). SSRF allowlist enforced. Per-agent rate limit (`DREAMS_RATE_LIMIT_PER_AGENT_HOUR`). Audit-chain entry on every status transition.
- **Backwards compat**: `/sleep` and existing 22 MCP tools unchanged. Everything else is additive.

---

## Critical files

| File | Change |
| --- | --- |
| `src/sleep-cycle.ts` | Extract `runLocalCycle`, add Phase 3.5 hook, add per-phase cancel check, plumb `instructions` into prompt suffixes |
| `src/app.ts` | Add 11 new routes (Parity 4 + Drop-in 3 + Bridge 3 + extended `/sleep` async branch) |
| `src/types.ts` | `DreamRun`, `DreamStatus`, `DreamSource`, `AnthropicMemoryStoreLink`, `DreamRunOptions`; extend `SleepCycleConfig` (~L363) with `instructions?`, `outputMode?` |
| `src/schemas.ts` | `CreateDreamRunSchema`, `DreamRunSchema`, `DreamRunListSchema`, `ListDreamsQuerySchema`, `AnthropicDreamCreateSchema`, `AnthropicDreamSchema`, `AnthropicPushSchema`, `AnthropicPullSchema`, `AnthropicSyncStateSchema`; extend `SleepSchema` |
| `src/memory-manager.ts` | Methods: `createDreamRun`, `getDreamRun`, `listDreamRuns`, `cancelDreamRun`, `pushToAnthropic`, `pullFromAnthropic`, `getAnthropicSyncState` |
| `src/dream-runs.ts` (NEW) | Worker loop: `LISTEN dream_runs_inserted`, `FOR UPDATE SKIP LOCKED`, dispatcher to local vs anthropic |
| `src/dreams-anthropic.ts` (NEW) | Anthropic HTTP client, memory-store mapper, retries/backoff, budget enforcement |
| `src/client.ts` | `client.dreams.*` and `client.anthropic.*` namespaces |
| `src/mcp.ts` & `src/tool-definitions.ts` | 7 new tools: `memforge_dreams_{create,status,list,cancel}`, `memforge_anthropic_{push,pull,sync_state}` |
| `src/openapi.ts` | Document all new routes with `anthropic-compat` tag for Drop-in group |
| `python/python/memforge/client.py` | Mirror SDK additions |
| `schema/migration-v3.6-claude-dreams.sql` (NEW) | `dream_runs`, `anthropic_memory_stores`, indexes, listen/notify trigger |
| `schema/schema.sql` | Add same tables to canonical schema |
| `tests/dream-runs.test.ts` (NEW) | Parity unit + integration |
| `tests/dreams-e2e.test.ts` (NEW) | Mock Anthropic stub, full lifecycle |
| `tests/http.test.ts` | `/v1/dreams` shape compatibility |
| `tests/multi-device.test.ts` | Cross-namespace dream output isolation |
| `README.md`, `CLAUDE.md`, `INTEGRATION.md`, `ARCHITECTURE.md`, `CHANGELOG.md` | Document new feature, env vars, Drop-in guide, Phase 3.5 |

---

## Resolved design defaults (open questions surfaced by Plan agent)

These are locked into the plan as defaults; flag in PR description so reviewers can override during implementation.

1. **Input snapshot via `input_warm_ids[]`** column at run-start, not `pg_export_snapshot()`. Reason: long-running multi-phase work is incompatible with REPEATABLE READ across the worker txn.
2. **Output namespace** `<original>__dream__<runId>` when `output_mode='new_namespace'`. In-place stays the default for `/sleep`.
3. **Worker = in-process, single-flight per agent**. Multi-instance via `FOR UPDATE SKIP LOCKED`. No separate scheduler service for v1.
4. **HTTP codes**: native `POST /memory/:id/dreams` returns **202 + Location**. Drop-in `POST /v1/dreams` returns **200** with the dream object (matches Anthropic).
5. **Drop-in auth**: accept `x-api-key` *only* when `ANTHROPIC_COMPAT_ALLOW_ANY_TOKEN=true` (default `false`). Bearer always works.
6. **Service-layer reconciliation**: Anthropic wins `content` and dedup; MemForge wins `importance`, `confidence`, `valid_until`, graph metadata.
7. **Phase 3.5 placement (augment, not replace)**. If the user later wants Anthropic to do the *whole* cycle, that's a separate `cycleType: 'anthropic-full'` we can add without rework.
8. **No `@anthropic-ai/sdk` runtime dep** — fetch wrapper only. Keeps Anthropic optional and avoids dependency drift.
9. **Anthropic memory-store payload format is undocumented** as of writing. Assume `{ records: [{ content, metadata }] }` and isolate the assumption in `src/dreams-anthropic.ts` so a refit is a single-file change.

---

## Verification plan

Run end-to-end before merging:

1. **Type-check + lint**: `npm run type-check && npm run lint` — must pass with 0 errors.
2. **Parity unit + integration** (`tests/dream-runs.test.ts`): enqueue → poll → run transitions to `running` → `completed`; cancel during pending; cancel during running (mid-phase); budget exceeded → `failed`; `input_warm_ids` matches snapshot at run-start.
3. **HTTP suite** (`tests/http.test.ts`): native `POST /memory/:id/dreams` returns 202 + Location; `GET .../:runId` returns 200/404; list filters by status; cancel idempotent. Drop-in `POST /v1/dreams` accepts both auth modes; field names exactly mirror Anthropic; unknown fields rejected.
4. **Service mock-Anthropic** (`tests/dreams-e2e.test.ts`): success path → output namespace populated, cost recorded; 429 → 3 retries → local fallback with `error='anthropic_unavailable_local_fallback'`; 401 → `failed`, no fallback.
5. **Bridge** (extend `tests/integration.test.ts`): push records `external_store_id`; pull with `anthropic-wins` overwrites; pull with `memforge-wins` no-ops on conflicts; sync-state reports drift.
6. **Multi-device** (`tests/multi-device.test.ts`): dream run scoped to `session_ids=[A]` excludes session B's hot tier; output namespace honors deprecation rules.
7. **Security** (`tests/security.test.ts`): API-key-shaped string in `instructions` rejected by secret scanner; SSRF attempt to non-Anthropic host blocked by allowlist.
8. **Load**: 50 concurrent `/dreams` creates against 10 agents, single worker — no deadlocks; verify `dream_runs_pending_idx` used via `EXPLAIN`.
9. **Manual smoke** (per CLAUDE.md gate sequence):
   - `npm run dev`, then `curl POST /memory/test-agent/dreams` with `session_ids=[s1]`; poll `GET /memory/test-agent/dreams/:runId` until `completed`; verify output namespace populated.
   - With `ANTHROPIC_API_KEY` set + `DREAMS_PROVIDER=anthropic`, repeat against a stub server (or live, if user has key + budget); confirm `external_dream_id` recorded and Phase 3.5 reconciliation correct.
   - `client.dreams.create(...)` from TS SDK — confirm shape parity with `Anthropic.beta.dreams.create(...)` calling pattern (literally swap import, same call site).
10. **Branch hygiene**: rebase on `feat/multi-device-identity`; confirm session_id propagation through dream runs by inspecting hot rows referenced in `input_warm_ids`.
