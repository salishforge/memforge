# MemForge G3 plan: stability and operations ("Truth & Trust")

- **Status:** detailed specification for the stability and operations track. Item IDs and specifications here stand.
- **Calendar and release groupings are superseded by NEXT-ITERATION-PLAN.md §4 (RT-1…RT-7).** This plan's own labels were v3.14 "Operable", v3.15 "Small surface", weeks 1–18 at ~9 sessions a week and a fork branch point around week 14. In the integrated plan:
  - v3.13.0 "Truth & Trust" is unchanged as RT-1. `rc.1` is due by 2026-12-06 (end of week 3; week 1 = week of 2026-11-16) if at least 12 sessions are done by 2026-11-29, otherwise by 2026-12-13.
  - v3.14.0 is now **"Measured & Connected"** (RT-2) and v3.15.0 is now **"Seams"** (RT-3). The OP-, AP- and AR- items are redistributed: OP-1, OP-2, AR-1/2/3/4/5/8, AP-4 → RT-3; OP-7, AR-9, AR-11 slice 1 → RT-4; OP-3, OP-4, OP-8, AR-6, AR-7, AR-10, CI-3 → RT-5; OP-5, OP-6, AP-2 → RT-6 (AP-3 uncommitted); AP-1 → RT-2.
  - The core is **branch-ready at the RT-3 exit** (after AR-4 and AR-8): about 2027-07-25 at the 5-sessions-a-week plan of record, about 2027-04-18 at the 9-a-week upside. The `ee/` branch itself (E0-7) happens later, at E1 kickoff, behind a demand gate.
- **Date:** 2026-11-16
- **Goal:** G3 (stability and manageability), plus the seams the G2 enterprise fork needs
- **Code baseline:** `main` at `16e2f15` (2026-07-29). Nothing has been committed since the October 2026 audit, so audit line numbers still apply.
- **Not covered here:** retrieval accuracy (RA-*), sleep-cycle knowledge quality (SC-* that are not operational), query-path performance (PERF-3/4/6/12/13/16/22), the G1 skill's content, and the G2 tenancy, knowledge-space and remote-MCP/OAuth design. Those belong to the accuracy, G1 and G2 plans. This plan provides the operational base and the code seams they build on.

## How to read this

- **Evidence labels.** Every item cites audit IDs, and competitor evidence where it helps. Each audit ID carries its verification status:
  - **C**: confirmed by the second-model verifier.
  - **P**: partially confirmed (the verifier adjusted severity or scope).
  - **U**: unverified (plausible, not proven).
  - **U+R**: unverified in the audit, but this plan re-checked that specific claim against HEAD on 2026-11-16. The re-checked facts are listed in Appendix B.
- **Effort.** S is less than 1 day of focused work, M is 1–5 days, and L is more than 1 week. A "session" is one AI coding session of about 2–3 hours, including review.
- **Benchmarks.** Every benchmark is labelled with its metric type and reader model. This plan makes no recall-versus-QA comparisons.
- **Security.** Security problems are written as work to do, so this file can be committed to the public repository.

---

## Summary

The engine is well built, but the parts an operator touches do not work as documented:

- **Install.** None of the documented install channels works (MX-2). The shipped compose file can neither build nor boot (SEC-3, PERF-1).
- **Authentication.** Authentication is off in every deployment path (ARCH-1).
- **MCP.** The MCP server cannot complete a handshake with a spec-compliant client (MX-1/SR-2).
- **Crashes.** One database timeout on a background write can end the process (SR-1).
- **Upgrades.** There is no migration runner and no schema version (SR-7).
- **CI.** CI runs 6 of the 35 test files (SR-8).
- **Docs.** The docs advertise endpoints, environment variables and behaviours that do not exist (RA-9, SEC-12, MX-15).

The plan is three releases, a continuous test track, and a refactor track that lands upstream before the enterprise fork:

*Release names and calendar below are this plan's original proposal; NEXT-ITERATION-PLAN §4 supersedes them (see the Status banner).*

| Release | Theme | Items | Effort (sessions) | Calendar at ~9 sessions/week (original proposal; see NEXT-ITERATION-PLAN) |
|---|---|---|---:|---|
| **v3.13.0** | Truth & Trust | TT-1 … TT-15 | ~33–47 | weeks 1–5 (`rc.1` at end of week 2; now 2026-12-06 or 2026-12-13, see the Status banner) |
| **v3.14.0** | Operable | OP-1 … OP-8, plus AR-1/2/3/5/6 | ~38–52 | weeks 6–10 |
| **v3.15.0** | Small surface | AP-1 … AP-4, plus AR-4/7/8 and CI-3 | ~27–35 | weeks 11–14, then the **fork branch point** |
| v3.16+ | Hardening for the fork | AR-9, AR-10, AR-11 slices, CI-5 | ~25–35 | weeks 15–18 and ongoing |

The fork's critical path is TT-* followed by AR-1, AR-2, AR-3, AR-4 and AR-8: about 54 sessions, plus OP-1 (4–6), on which AR-2 depends.

### The bar competitors have set (dated, with fact-check corrections applied)

- **Hindsight (Vectorize; MIT; Postgres).**
  - v1.0.0 (2026-10-13) declared its API stable ("the API is a promise"). *Fact-check: confirmed.*
  - v1.1.0 (about 2026-10-21) added per-document change history. *Fact-check correction.*
  - It returns 503 with Retry-After when the store is unavailable. *Research card; not separately fact-checked.*
- **Mem0 self-hosted server (Apache-2.0).** By mid-2026 it had default-on auth, per-user hashed API keys, an admin bootstrap wizard, a request audit log, and Alembic-managed migrations. *Research card; not separately fact-checked.*
- **Letta.** The self-hosted Postgres V1 server moved to an `archive` branch, and its Docker image is officially unsupported. *Fact-check correction to the Letta card.*
- **Anthropic Connectors Directory.** A listing requires a tool `title` plus a `readOnlyHint` or `destructiveHint` annotation. *Fact-check: confirmed.*

**What this means:** the self-hosted, Postgres-only niche has room in it because Letta has stepped back. But "trustworthy self-hosted" now means four things: auth on by default, tracked migrations, a stable API, and an admin surface. MemForge has none of the four today.

### Trust posture today (planner judgment)

| Dimension | Today | Evidence | Exit test for v3.13.0 |
|---|---|---|---|
| Install | Every documented channel fails | MX-2 (C), SEC-3 (C), PERF-1 (P), MX-19 (U+R) | Every channel passes in CI from a clean clone |
| Run | A DB timeout can end the process; a provider outage turns every default query into a 500 | SR-1 (C), SR-10 (C), PERF-7 (P) | Fault suite: no unplanned exit; degraded but correct responses |
| Secure by default | Auth is off in every path | ARCH-1 (C), MX-4 (P), SEC-3 (C) | The default deployment rejects unauthenticated requests |
| Upgrade | No runner and no version table; the standalone image silently replays every migration on boot | SR-7 (C), MX-9 (P), SR-6 (P) | 3.0.0-beta.4 and v3.7.0 databases upgrade with zero schema diff |
| Operate | `/health` is static; no memory metrics; the dashboard cannot load | MX-8 (P), MX-17 (U+R), MX-20 (U) | Deferred to OP-* (RT-3 onward) |
| Verify | CI runs 6 of 35 test files; no MCP, SDK or upgrade tests | SR-8 (P) | All 35 files run in CI and pass |
| Docs truth | Phantom endpoints, environment variables, counts and versions | RA-9 (P), SEC-12 (C), MX-15 (U+R) | The docs-consistency job passes |

---

## 1. The "Truth & Trust" release (v3.13.0)

### Release number and cut (decision D1)

- **The facts.** npm `latest` is `3.0.0-beta.4`, and only beta.3 and beta.4 were ever published (MX-2, live registry check on 2026-10-30). The brief says v3.7.0 reached npm, but that registry check contradicts it, so the owner should confirm whether the 3.7.0 publish failed.
- **The repository's own labels.** `package.json` says 3.7.0. `main` carries features labelled v3.8 to v3.13 in the migration file names, in four separate `[Unreleased]` CHANGELOG sections, and in CLAUDE.md (for example, "occurred_at (v3.13)").
- **Recommendation:** ship one release from `main` as **v3.13.0**, so that the version agrees with the migration files and the docs.
  - 3.8.0 is also workable, but only once TT-14 has separated migration ordering from release numbers.
  - Fail-closed auth (TT-11) changes behaviour. Ship it in this minor release with an explicit opt-out and an UPGRADING.md entry, rather than as a major release. The owner decides.
- **Release-candidate cut.** By 2026-12-06 (end of week 3) if at least 12 sessions are done by 2026-11-29, otherwise by 2026-12-13, publish `3.13.0-rc.1` to npm under the `next` dist-tag and to GHCR. The same day, run `npm deprecate` on 3.0.0-beta.x pointing to the rc (MX-2). By then TT-1, TT-3, TT-6, TT-8, TT-10, TT-11 and TT-13 are done, so G1 skill work can start on a working MCP transport.

### Track A: failure paths (SR-1 … SR-5, SR-10)

#### TT-1: background writes can no longer end the process
- **Evidence:**
  - SR-1 (C), PERF-5 (C), SC-11 (C), SR-11 (U).
  - Re-checked at HEAD: there are bare `void this.pool.query(` calls with no `.catch` at `src/memory-manager.ts:991`, `:2305`, `:2459` and `:2754`, and at `src/sleep-cycle.ts:943`.
  - `src/` has no `unhandledRejection` or `uncaughtException` handler.
  - `eslint.config.js` has no rule against floating promises.
- **Build:**
  1. Add `.catch(log)` to the five call sites.
  2. Register `process.on('unhandledRejection')` to log and increment `memforge_unhandled_rejections_total`, without exiting.
  3. Register `uncaughtException` to log, shut down gracefully, and exit non-zero.
  4. Enable type-aware `@typescript-eslint/no-floating-promises` with `ignoreVoid: false`. This needs `parserOptions.project`.
  5. In `consolidate()`, await every statement issued on the transaction client (SR-11), or move best-effort writes after COMMIT.
  6. In the same post-query code, scope the access-count and retrieval-log writes to the querying agent's own warm rows, and keep shared-pool hits out of them. *Source: a verifier note in the security dimension, unverified.*
- **Acceptance:**
  1. Lint fails on a newly introduced unhandled floating promise.
  2. Fault test: make the post-query access-count UPDATE reject (set `statement_timeout` to 1 ms on a test pool). The query still returns 200, the process stays alive, and the counter reads 1.
  3. A failing `memory_sequences` insert inside consolidation does not leave a partial batch.
- **Effort:** S (1–2 sessions).

#### TT-2: provider outages degrade service instead of failing it
- **Evidence:** SR-10 (C), PERF-7 (P), PERF-8 (P, the ingest part).
- **Build:**
  1. **Timeouts.** Pass `AbortSignal.timeout` to every provider fetch in `src/llm.ts` and `src/embedding.ts`. Add `EMBEDDING_TIMEOUT_MS` (default 10 s) and `LLM_TIMEOUT_MS` (default 60 s).
  2. **Retries.** Retry once or twice with jitter on 429 and 5xx, honouring Retry-After.
  3. **Bounded queue.** Give `ConcurrencyLimitedEmbeddingProvider` a bounded queue that fails fast when full, and add a circuit breaker modelled on the existing Redis one.
  4. **Degraded hybrid queries.** Run `queryHybrid` with `Promise.allSettled`. When the semantic arm fails, return the keyword results with `degraded: ["semantic"]` in the response metadata and increment a metric.
  5. **Idle transactions.** Set `idle_in_transaction_session_timeout` (about 120 s) in the pool config.
  6. **Consolidation transactions.** Move `summarize()` and `embed()` out of the consolidation transaction: read the batch, compute, then open a short transaction that re-locks the rows by id and writes. The alternative is to store a NULL embedding and let Phase 5.9 backfill it, which is only safe once TT-3 lands.
- **Acceptance:**
  1. With the test embedder set to `hang` or `throw`, a hybrid query returns 200 with the degraded flag within the timeout plus 1 s.
  2. A consolidation with a hanging embedder finishes or fails within the timeout.
  3. Pool `waiting` returns to 0, and `pg_stat_activity` shows no app session `idle in transaction` after the test.
- **Effort:** M (3–5 sessions).

#### TT-3: sleep phases re-arm
- **Evidence:** SR-3 (C) and SC-1 (P). Re-checked: `shouldSkipPhase` at `src/sleep-cycle.ts:1631` has no time bound.
- **Build:**
  1. Record a row when a phase is skipped (`skipped=true`) and cap consecutive skips, or apply a 24-hour window.
  2. Remove `temporal-validation`, `embedding-migration` and `deprecated-decay` from the skippable set, because they are driven by time or config rather than by data changes.
  3. Expose skip counts.
- **Acceptance:**
  1. Regression test: after three idle cycles and then new input, the phase runs on the next cycle.
  2. Embedding migration runs after a model change regardless of skip history.
- **Effort:** S (1 session).

#### TT-4: dream runs recover from crashes, and only one cycle runs per agent
- **Evidence:**
  - SR-5 (C), MX-18 (U), ARCH-10 (C), SC-4 (P), PERF-18 (U).
  - Verifier note: a concurrent-sleep rejection returns 500 rather than 409.
- **Build:**
  1. Add a migration for `heartbeat_at` and `attempts` columns on `dream_runs`.
  2. The worker updates the heartbeat at each phase boundary.
  3. The claim query also reclaims `running` rows whose heartbeat is stale while attempts are below the maximum. Otherwise it marks the run failed with `worker_lost`.
  4. On SIGTERM, request cancellation and put the in-flight run back to `pending`.
  5. Wrap `sleep()` in a per-agent `pg_try_advisory_lock` held on a dedicated client and released in `finally`. Return HTTP 409 when the lock is taken.
  6. When an agent is busy, the worker requeues the run instead of failing it.
  7. Allow a stuck run to be cancelled.
- **Acceptance:**
  1. When a worker is killed mid-run, a second worker reclaims the run after the lease expires and finishes it.
  2. After SIGTERM, the run is back in `pending`.
  3. Two concurrent `/sleep` calls for one agent produce exactly one 200 and one 409.
  4. When a dream run overlaps a synchronous sleep, the run is requeued rather than failed.
- **Effort:** M (3–4 sessions).
- **Note:** session-level advisory locks need a direct database connection, not one through a transaction-mode pooler (see OP-7).

#### TT-5: the audit chain verifies on healthy data
- **Evidence:**
  - SR-4 (C), SEC-8 (C), ARCH-15 (U), SEC-7 (P).
  - Verifier note: `deprecated_namespaces` audit writes also violate the CHECK constraint.
- **Build:**
  1. **Serialise appends.** Run `record()` in one transaction under `pg_advisory_xact_lock(hash(agent, table, target))`, and add a UNIQUE constraint on `(agent_id, target_table, target_id, previous_hash)`.
  2. **Separate batch chains.** Give batch events their own chain key instead of `target_id=0`.
  3. **Checkpoint on archive.** When records are archived, store the last archived `chain_hash`. `verify()` then accepts a first remaining record whose `previous_hash` equals that anchor.
  4. **Widen the CHECK.** Add a migration that widens `target_table` to include `cold_tier`, `retrieval_log`, `dream_runs`, `deprecated_namespaces`, `hot_tier` and `shared_memories`.
  5. **Count failures.** Audit write failures increment a metric instead of producing only a log line.
- **Scope limit:** TT-5 fixes verification and serialises appends. It does not change what the chain hash covers. Actor attribution goes in one migration with ENTERPRISE-EDITION U-2 (actor inside the hash, key ring, `redact`), because columns outside the hash are not tamper-evident (ENTERPRISE-EDITION Appendix A, check 2) and each format change would need every chain re-verified.
- **Acceptance:**
  1. `verify()` reports valid after archiving with a retention of 0 days.
  2. It also reports valid after 20 concurrent `recordBatch` calls.
  3. `tests/cold-tier-retention.test.ts` passes in CI.
  4. The audit-failure counter stays at 0 across the full suite.
  5. A single altered byte in any covered field makes `verify()` fail.
- **Effort:** M (3–4 sessions).

#### TT-6: guards against data loss and bad input
- **Evidence:**
  - SR-12 (U).
  - SR-13 (U+R): the global error handler at `src/app.ts:2165` always returns 500.
  - ARCH-11 (C), SC-9 (P), SR-6 (P).
- **Build:**
  1. Clamp the sleep thresholds to [0,1], with a lower server-side ceiling for eviction.
  2. Give `hints` and `outcome_type` real Zod shapes, and move `occurred_at` into the Zod schema.
  3. Make the error handler honour `err.status`: return 413 with the limit in the message, and 400 on parse errors. Add a configurable `MAX_BODY_BYTES`.
  4. Turn off shared-pool deletes (dedup and prune) by default behind a flag until AR-10 rewrites them.
  5. The standalone image stops replaying `migration-v2.7.sql`, because TT-14 replaces the boot loop.
- **Acceptance:**
  1. A threshold above 1 returns 400.
  2. An oversized body returns 413 and states the limit.
  3. Malformed JSON returns 400.
  4. With the flag off, a pool sleep issues no DELETE on `shared_memories`.
- **Effort:** S (1–2 sessions).

#### TT-7: export and import stop over-promising
- **Evidence:** SR-9 (C), ARCH-8 (C), MX-14 (U).
- **Build (the v3.13 minimum; the full format is OP-6):**
  1. The docs state what export actually contains: one namespace of warm rows, the graph, procedures, and the 20 most recent reflections.
  2. The docs state that disaster recovery means `pg_dump`.
  3. NDJSON import gets a text parser with its own size limit, or a clear 415.
  4. Import honours the per-line namespace.
  5. Import returns a non-200 status when a database error aborts it partway through.
- **Acceptance:**
  1. The documented NDJSON `curl` example passes in the doc-snippet CI job.
  2. A namespaced import lands in that namespace.
- **Effort:** S (1–2 sessions).

### Track B: install and quick start (MX-2, PERF-1, SEC-3)

#### TT-8: images and compose build and boot from a clean clone
- **Evidence:**
  - SEC-3 (C), PERF-1 (P), MX-19 (U+R), SR-6 (P).
  - Verifier notes from the DX and security dimensions, all re-checked at HEAD:
    - `.dockerignore` excludes `tsconfig.json` and `dist`, but both Dockerfiles need them.
    - Compose uses `postgres:16-alpine`, which has no pgvector.
    - Container and compose hardening gaps in the default images (SEC-3, MX-19; verifier notes): non-root runtime, database and cache authentication, internal-only networking. Build steps 6–7 below are the work.
- **Build:**
  1. Fix `.dockerignore`.
  2. Make the standalone image multi-stage, so it builds `dist` inside the image.
  3. Switch compose to `pgvector/pgvector:pg16`.
  4. Fix the ordering at `schema/schema.sql:57`.
  5. Add `ON_ERROR_STOP=1` to `npm run migrate`, the CI schema step and the entrypoint.
  6. In the standalone image:
     - run Node as a non-root user;
     - trap SIGTERM and stop Postgres cleanly;
     - use scram authentication instead of trust;
     - use the same `CONSOLIDATION_INNER_BATCH_SIZE` as the other deployment paths, or document why it differs.
  7. Keep Postgres and Redis on the internal compose network by default (no host ports), and require a Redis password.
  8. Verify that onnxruntime works on Alpine/musl, or move the standalone image to a Debian Postgres base.
- **Acceptance:** a CI job named `install-smoke` checks the following.
  1. From a clean checkout, fill the required secrets in the template `.env` and run `docker compose up -d`. `/ready` returns 200 within 60 s, and an add → consolidate → query round trip passes.
  2. The same holds for `docker run` of the standalone image, including a semantic query with local embeddings.
  3. After two restarts the logs contain no errors, and an operator-created HNSW index survives.
- **Effort:** M (2–4 sessions).

#### TT-9: every documented install channel works
- **Evidence:** MX-2 (C).
- **Build:**
  1. **Container images.** `release.yml` builds and pushes both images to GHCR on each tag, for amd64 and arm64. Then either publish to Docker Hub as the docs promise, or change the docs to `ghcr.io/...`.
  2. **npm.** Publish a real npm release from `main` under `latest`.
  3. **MCP entry point.** Publish a small `memforge-mcp` shim package, or change every doc, `server.json` and `smithery.yaml` to `npx -p @salishforge/memforge memforge-mcp`. Correct the version and tool count in `server.json`.
  4. **Python.** Rename the Python distribution (for example `salishforge-memforge`) and publish it.
  5. **Fix the pip instruction first.** Change the docs that say `pip install memforge` today, before anything else in this item. That PyPI name belongs to an unrelated project, which creates the dependency-confusion exposure noted in MX-2.
- **Acceptance:**
  1. A `channel-check` workflow, run weekly and on every release, executes every install command in README, CLAUDE.md, INTEGRATION.md and the plugins' READMEs in clean containers. All of them pass.
  2. The npm `latest` tag, the GHCR tags and the PyPI version all match `package.json`.
- **Effort:** M (2–3 sessions), plus registry account setup by the owner.

### Track C: MCP framing (MX-1, SR-2)

#### TT-10: the MCP stdio server speaks MCP
- **Evidence:**
  - MX-1 (C). It was verified empirically: a newline-delimited `initialize` produced 0 bytes of output.
  - SR-2 (C).
  - Re-checked: `src/mcp.ts:1006` writes `Content-Length` framing, and the protocol version is hard-coded to `'2024-11-05'`.
- **Build:**
  1. Use newline-delimited JSON-RPC with byte-safe line splitting.
  2. Answer `ping` with an empty result, and send nothing in reply to notifications.
  3. Negotiate the protocol version: echo the client's version when it is supported, otherwise return the latest supported version.
  4. Guard against rejections outside `executeTool`.
  5. Add `memforge_resume`. The REST route already exists (MX-6).
  6. Keep the hand-rolled transport, as CLAUDE.md requires (decision D3).
- **Acceptance:**
  1. `tests/mcp.test.ts` spawns `dist/mcp.js` against `createApp` on an ephemeral port. It completes initialize → `notifications/initialized` → `tools/list` → `tools/call` (add, then query), including a non-ASCII payload.
  2. `ping` returns `{}`.
  3. A notification produces no output.
  4. An MCP Inspector CLI smoke test runs in CI.
- **Effort:** S (1–2 sessions). **This blocks G1.**

### Track D: authentication fails closed (ARCH-1, MX-4, SEC-3)

#### TT-11: authentication is on in every deployment path
- **Evidence:**
  - ARCH-1 (C), MX-4 (P), SEC-3 (C), MX-5 (C).
  - SEC-14 (C): OAuth2 introspection must be configured explicitly and use https (build step 5).
  - Verifier notes (DX and architecture): with no token configured, bearer requests get a 503 instead of a clear 4xx, and the server runs unauthenticated (ARCH-1).
  - Re-checked: compose forwards only `DATABASE_URL`, `REDIS_URL` and `PORT`; `.env.example` and `.env.docker` contain no `MEMFORGE_TOKEN` (ARCH-1).
- **Build:**
  1. **Explicit auth mode.** Add `MEMFORGE_AUTH=token|oauth2|none`, inferred when unset. If no mode can be inferred, refuse to start with a one-line fix message.
  2. **Loopback-only `none`.** `none` is allowed only when the server binds to loopback, unless `MEMFORGE_ALLOW_UNAUTHENTICATED_REMOTE=true` is set. In that case, log it at startup and report it in `/ready`.
  3. **Compose.** Use `env_file: .env` with `${VAR:?}` guards for `MEMFORGE_TOKEN`, `ADMIN_TOKEN` and `AUDIT_HMAC_KEY`. The templates list these keys and show how to generate them.
  4. **Standalone image.** On first boot, generate a token and an HMAC key, store them in the data volume with mode 0600, and print them once.
  5. **OAuth2 mode.** Require an explicit `OAUTH2_INTROSPECT_URL`, using https except on loopback. There is no localhost default.
  6. **Pool admin routes (MX-5).** Admin routes under `/pool` accept `ADMIN_TOKEN` without also requiring `MEMFORGE_TOKEN`.
  7. **Testability.** Put the startup check in a testable function (ARCH-1 recommendation).
- **Acceptance:**
  1. A bootstrap test matrix:
     - no auth variables with `NODE_ENV=production`: the process exits non-zero with a message;
     - `none` on a non-loopback bind: refused;
     - token configured: an unauthenticated request gets 401 and a valid one gets 200;
     - a Bearer header sent while auth is `none`: 401, not 503.
  2. Compose with the template `.env` refuses to start until the tokens are set.
  3. With `MEMFORGE_TOKEN` different from `ADMIN_TOKEN`, an HTTP test can create and delete a pool.
  4. UPGRADING.md has an entry for the change.
- **Effort:** S–M (2–3 sessions).
- **Scope note:** this does not add per-agent authorization (SEC-1, ARCH-2). One token still opens every agent. The v3.13 docs must say so plainly; AR-2 and AR-4 add the seam.

### Track E: the docs tell the truth (RA-9, SEC-12, MX-15)

#### TT-12: remove or implement every feature that is advertised but missing
- **Evidence:** RA-9 (P), SEC-12 (C), MX-15 (U+R), ARCH-18 (U), SEC-2 and ARCH-6 (C, the RLS claim), ARCH-9 (P), SC-23 (U), MX-10 (U+R), ARCH-21 (U), SR-14 (U), MX-17 (U+R), MX-13 (U), SC-3 (P), SEC-18 (U), RA-19 (U), PERF-21 (U).
- **Inventory.** Rows marked R were re-checked at HEAD.

| Claim in the docs | What the code does | Action for v3.13 |
|---|---|---|
| `POST /memory/:id/hints` and `GET /memory/:id/conflicts` (CLAUDE.md:109, 115) | No such routes (R) | Remove them. Hints live in the `/add` body. |
| Preference extraction; `ENABLE_LLM_INGEST` | The flag is never read (R) | Remove the claim. The accuracy plan decides whether to build it. |
| `OAUTH2_JWKS_URI`, `OAUTH2_AUDIENCE`, `ALLOWED_LLM_HOSTS`, "OAuth2 JWT" | Not in `src/` (R) | Remove them. Document `OAUTH2_INTROSPECT_URL` and `ALLOW_REMOTE_LLM`. |
| `ADMIN_TOKEN` defaults to "(open)" | Admin routes return 403 when it is unset | Correct the docs. |
| RLS gives "secure-by-default" isolation | The application path bypasses RLS (SEC-2) | Say the policies exist but are not enforced on the app path. Roadmap: AR-9. |
| Five webhook events | Only `consolidated` fires | Emit the other four (S, "one helper call per site"), or remove them from the docs. |
| Hot reload of 10 config keys | Only 1 key takes effect (R) | Shrink the allowlist, or route the keys through `getConfig()`. |
| `CONSOLIDATION_THRESHOLD` triggers auto-consolidation | The value is never read | State "no auto-consolidation". The G1 and accuracy plans decide the behaviour. |
| Live cache dashboard | Cannot load in any configuration (R) | Remove the route and the docs. OP-4 replaces it. |
| "Claude Dreaming" Layers 3–4 (Anthropic Dreams delegation; Memory Store bridge) | Written against an assumed API shape (SC-3); rewrites content without revision, audit or re-embedding (SC-10) | **Remove from core** (or move to an unsupported contrib package), per NEXT-ITERATION-PLAN decision 13. Rename the remaining layers "Anthropic Dreams-compatible". |
| M365 Copilot plugin manifest (`plugins/m365-copilot/`) | Makes `agent_id` a required, model-supplied parameter (MX-12) | Remove it; the replacement is the ENTERPRISE-EDITION E2-11 kit. |
| Shared pools and agent clearing | Pools have no owner or roles (SEC-5); `clear()` archives rather than deletes (SEC-9) | Document that shared pools are one trust domain, that `clear()` archives, and publish an operator erasure runbook. |
| Dream runs scoped by namespace or session | Runs execute agent-wide (SC-18, U) | Reject those parameters until they are honoured. |
| 17, 30 or 16 tools; 12 or 21 tables; Express 4; TS 5.7; v3.0.0-beta.3; the `python/python` path | 46 tools, 30 tables, 72 route registrations, Express 5, TypeScript ~6.0 (R) | Correct them, and enforce with the CI check below. |
| SDK methods `hints`, `export`, `import`, `conflicts`; the ResumeContext shape | Missing or different (MX-13) | Fix the snippets, and run them in CI (AP-3). |
| The audit-delete trigger makes the audit log immutable | It is accident protection only (SEC-18) | Describe it accurately. |
| "9 rounds of audits, all clean" | The reports are unpublished | Publish them or drop the claim (SEC-12). |
| THREAT_MODEL status table; SECURITY.md supported versions (2.1.x) | Stale | Regenerate them. |

- **Why CLAUDE.md matters most.** CLAUDE.md is the first file the maintainer's own AI coding sessions load, and it states that "reading this file alone should be sufficient". Its errors therefore reappear in every AI-written change, so treat it as code.
- **Build:** add `scripts/check-docs.ts`. It asserts:
  - the version string;
  - the tool count;
  - that the CLAUDE.md endpoint table matches the route table;
  - the table count;
  - that every documented environment variable is actually read by the code;
  - that the docs contain no name from a denylist of phantom names.
- **Acceptance:**
  1. The docs-consistency job passes in CI.
  2. A grep for the denylist returns nothing.
  3. Every endpoint row in CLAUDE.md and README resolves to a real route.
- **Effort:** M (3–4 sessions).

### Track F: release hygiene (SR-7, MX-9)

#### TT-13: one version string, one CHANGELOG section, and a release gate
- **Evidence:** SR-17 (U+R: `src/version.ts` says 3.2.0, `package.json` 3.7.0, `server.json` 3.0.0) and MX-15.
- **Build:**
  1. Derive `VERSION` from `package.json` at build time.
  2. The release script syncs `server.json`, `python/pyproject.toml`, `smithery.yaml` and `glama.json`.
  3. Collapse the four `[Unreleased]` CHANGELOG sections into a single 3.13.0 section.
  4. `release.yml` fails when the tag differs from `package.json` or when the CHANGELOG has no section for it.
  5. `/health`, the MCP `serverInfo` and the OpenAPI `info.version` all report the same version plus the git SHA.
- **Acceptance:**
  1. CI asserts that all three runtime surfaces match `package.json`.
  2. A release dry run on a mismatched tag fails.
- **Effort:** S (1 session).

#### TT-14: a migration runner with a tracked schema version
- **Evidence:**
  - SR-7 (C), MX-9 (P), SR-6 (P), ARCH-20 (U+R), PERF-1 (P).
  - Re-checked at HEAD:
    - `npm run migrate` applies `schema.sql`, not the migrations.
    - There is no `schema_migrations` table.
    - The standalone entrypoint loops over `ls | sort` with `2>/dev/null || true`.
    - The `schema.sql` header says "through v3.1" but the file contains v3.13 objects.
    - No migration uses `CREATE INDEX CONCURRENTLY`.
- **Build:**
  1. **CLI.** Add `memforge migrate [status|up|--dry-run]`, written in TypeScript on the pg pool with no psql dependency. It uses a table `schema_migrations(id, name, checksum, applied_at, app_version)`.
  2. **Manifest.** An ordered manifest in `schema/migrations/manifest.json` lists the legacy files in true version order; new files are named `NNNN_name.sql`. A checksum mismatch on an already-applied file is a hard error.
  3. **Transactions.** The runner owns the transaction, so new files must not contain BEGIN or COMMIT. Legacy files that open their own transaction run as they are and are flagged in the manifest.
  4. **Manual migrations.** Entries marked `manual: true` (for example, HNSW index builds) are never applied automatically.
  5. **Locking.** A session advisory lock stops two replicas from racing.
  6. **Baselines.** `schema.sql` stamps itself at the latest version. An existing database is stamped by probing for marker objects, for example `hot_tier.occurred_at` means v3.13 and `dream_runs` means v3.6.
  7. **Startup check.** The server checks the schema version at startup.
     - When `MEMFORGE_AUTO_MIGRATE` is on, it migrates under the advisory lock. It defaults to true for the server binary and the images.
     - Multi-replica deploys should set it to false and migrate in a pre-deploy job.
     - Otherwise the server refuses to start with "run `memforge migrate`", and `/ready` returns 503.
  8. **Standalone entrypoint.** It calls the runner, never suppresses stderr, and fails the container on any error.
  9. **UPGRADING.md.** Generate it per release from the manifest.
- **Acceptance:** a CI `upgrade-test` matrix checks the following.
  1. Create a database from the schema at **3.0.0-beta.4** (the npm `latest`) and at **v3.7.0** (the git tag). Run `memforge migrate`. A normalised `pg_dump --schema-only` diff against a fresh `schema.sql` install is empty, and the HTTP smoke test passes.
  2. Running the migration again does nothing.
  3. A deliberately broken migration fails CI and leaves `schema_migrations` unchanged.
  4. Restarting the standalone container three times re-applies nothing.
- **Effort:** M (4–6 sessions).

### Track G: CI covers every test (SR-8)

#### TT-15: CI runs the whole suite
- **Split into two steps:**
  - **TT-15a (week 1, 1 session):** run all 35 test files once, record the red count per file, and add them to CI as a non-blocking job. TT-1, TT-2, TT-5, TT-11 and TT-14 change failure paths, auth, audit and schema, so they land after TT-15a and their regressions are visible.
  - **TT-15b (weeks 4–6):** make the red files pass, then make the job blocking.
- **Evidence:** SR-8 (P). Re-checked: `ci.yml` runs `test:security`, `integration`, `llm`, `http` and `cache`, plus `load` outside pull requests. There are 35 test files, and the Node matrix is `[20, 22]` although the docs require 22 or later.
- **Build:**
  1. Add one `npm run test:ci` script that globs `tests/**/*.test.ts`, with the load test tagged nightly.
  2. Use one integration job with pgvector and Redis service containers, and `ON_ERROR_STOP`.
  3. Set the Node matrix to 22 plus the newest LTS line, and drop 20.
  4. Publish `--experimental-test-coverage`. Set the floor at the first measured value, then ratchet it up.
- **Expect red builds.** The 29 dormant files will surface real failures, such as the cold-tier audit write in SEC-7. Budget a stabilisation pass for them.
- **Acceptance:**
  1. CI executes all 35 files, and the count is asserted.
  2. `release.yml` depends on this job, `install-smoke`, `upgrade-test`, MCP conformance, and docs-consistency.
- **Effort:** M (2–4 sessions in all: 1 for TT-15a, the rest for TT-15b), mostly fixing the tests that turn red.

### Exit criteria for v3.13.0
1. Every documented install channel passes in CI from a clean clone: npm, GHCR (both images), compose and PyPI.
2. A default deployment rejects unauthenticated requests. An unauthenticated mode exists only on loopback, or with an explicit, logged override.
3. An MCP Inspector handshake and a tool call pass in CI.
4. Databases at 3.0.0-beta.4 and v3.7.0 upgrade to 3.13.0 with zero schema diff.
5. All 35 test files run in CI and pass.
6. The fault suite (provider hang or throw, a DB statement timeout) produces no unplanned process exit.
7. `/verify` reports valid on an archived fixture older than 90 days and after 20 concurrent writers.
8. The docs-consistency job passes, and the denylist of phantom names is empty.

---

## 2. Operability (OP-1…OP-8; originally v3.14.0 "Operable", now spread over RT-3–RT-6)

#### OP-1: configuration is validated at startup
- **Evidence:**
  - MX-11 (U+R): `src/` reads 74 distinct environment variables, `server.ts` parses them inline, and nothing validates them.
  - MX-10 (U+R), SR-12 (U), SEC-12 (C).
- **Build:**
  1. **One schema.** `src/config.ts` holds one Zod schema covering every variable: type, default, doc string, and the flags `reloadable`, `secret` and `deprecated`.
  2. **Load once.** The schema is loaded once in `server.ts`, and values reach the code through dependencies. A lint rule (`no-restricted-properties`) blocks `process.env` outside `config.ts`; the client and MCP defaults are exempt.
  3. **Cross-field rules.** Each of these is a startup error rather than a failure on the first call:
     - an `anthropic` or `openai` `LLM_PROVIDER` requires its API key and `ALLOW_REMOTE_LLM=true`;
     - `DREAMS_PROVIDER=anthropic` requires a key;
     - `EMBEDDING_DIMENSIONS` must match the pinned column dimension, when one is pinned;
     - OAuth2 mode requires an introspection URL;
     - thresholds and the pool size must be within range.
  4. **Typo detection.** Unknown `MEMFORGE_*` variables produce a warning.
  5. **CLI.** Add `memforge config check` and `memforge config print --redacted`.
  6. **Generated docs.** The config tables in the docs are generated from the schema and feed TT-12's checker.
- **Acceptance:**
  1. An invalid config exits with code 78, naming the variable and the rule it broke.
  2. The generated table matches the docs in CI.
  3. `process.env` appears only in `config.ts` and the exempt client files.
  4. The reload endpoint accepts only `reloadable` keys, and a test shows each reload takes effect.
- **Effort:** M (4–6 sessions).

#### OP-2: health, readiness and `memforge doctor`
- **Evidence:**
  - MX-8 (P), SR-16 (U).
  - PERF-2 (P): there is no HNSW index by default.
  - Hindsight returns 503 with Retry-After when its store is unavailable. *Research card.*
- **Build:**
  1. **`/health`** becomes a liveness check that touches no dependencies.
  2. **`/ready`** checks:
     - DB `SELECT 1` with a 1 s timeout;
     - schema version against the expected version;
     - that the worker is alive;
     - Redis state (degraded is acceptable);
     - a cached embedding-provider probe.

     Its JSON body reports the version, SHA, schema version, auth mode and any degraded components.
  3. **API routes** return 503 with Retry-After while the database is unavailable.
  4. **Healthchecks.** The Dockerfile and compose healthchecks call `/ready`.
  5. **`memforge doctor`** checks:
     - the extensions, including pgvector 0.7 or later (needed for halfvec);
     - the embedding column dimension and whether an HNSW index exists;
     - pending migrations;
     - rows with NULL or stale-model embeddings;
     - stuck dream runs;
     - the auth mode;
     - provider reachability;
     - clock skew between the app and the database.
- **Acceptance:**
  1. With the database stopped, `/ready` returns 503 within 2 s, `/health` returns 200, and API routes return 503 with Retry-After.
  2. `doctor` exits non-zero for each seeded fault: a missing extension, a pending migration, NULL embeddings.
- **Effort:** S–M (2–3 sessions).

#### OP-3: memory-specific observability
- **Evidence:**
  - MX-8 (P), SC-22 (U), SC-26 (U), SC-23 (U), PERF-17 (U), PERF-19 (U).
  - SC-12 (C): no quality telemetry exists. The quality metrics themselves belong to the accuracy plan.
  - Research: propagate OTel trace context from MCP `_meta`. *Skills-distribution card idea; not fact-checked.*
- **Build:**
  1. Read real token usage from provider responses instead of estimating characters ÷ 4.
  2. Write `agents.last_sleep_cycle` and `sleep_cycle_cost_tokens` (SC-22).
  3. Wire `cache_operations_total` or delete it.
  4. Add a `METRICS_TOKEN` separate from `ADMIN_TOKEN`.
  5. Add **no `agent_id` label by default**, to keep cardinality bounded; per-agent detail comes from the admin API.
  6. Ship `ops/grafana/memforge.json` and `ops/prometheus/alerts.yml`.
  7. Add `GET /memory/:id/sleep/history`, backed by `sleep_phase_analytics`.

| Area | Metric | Type | Labels |
|---|---|---|---|
| Sleep | `memforge_sleep_cycles_total` | counter | `outcome` |
| | `memforge_sleep_phase_duration_seconds` | histogram | `phase` |
| | `memforge_sleep_phase_changes_total` | counter | `phase` |
| | `memforge_sleep_phase_skipped_total` | counter | `phase`, `reason` |
| Token spend | `memforge_llm_tokens_total` | counter | `provider`, `model`, `purpose` (revision, reflect, summarize, rerank, dreams), `direction` |
| | `memforge_llm_requests_total`, `memforge_llm_request_duration_seconds` | counter, histogram | `provider`, `purpose`, `outcome` |
| Embeddings | `memforge_embedding_duration_seconds` | histogram | `provider` |
| | `memforge_embedding_failures_total` | counter | `provider`, `reason` (timeout, http, oversize) |
| | `memforge_warm_rows_embedding_missing` | gauge (periodic indexed count) | `reason` (null, stale_model) |
| Backlog | `memforge_hot_backlog_rows`, `memforge_hot_backlog_oldest_seconds` | gauge | none (total and max across agents) |
| Jobs | `memforge_dream_runs` | gauge | `status` |
| | `memforge_dream_run_reclaims_total` | counter | none |
| Retrieval | `memforge_query_duration_seconds` | histogram | `mode` |
| | `memforge_query_degraded_total` | counter | `reason` |
| | `memforge_retrieval_feedback_total` | counter | `outcome` |
| Integrity | `memforge_audit_write_failures_total`, `memforge_unhandled_rejections_total`, `memforge_webhook_deliveries_total` | counter | `outcome` (webhooks only) |

- **Alerts:**
  - any missing embeddings for more than 1 hour;
  - the oldest hot backlog row older than 24 hours;
  - a dream-run reclaim;
  - pool `waiting` above 0 for 5 minutes;
  - any unhandled rejection;
  - degraded queries above 5%;
  - any audit write failure;
  - 24-hour LLM spend above 80% of the budget.
- **Acceptance:**
  1. A registry snapshot test lists every metric name.
  2. A sleep-cycle test increments the phase metrics for every phase.
  3. The fault tests increment the matching failure counters.
  4. `promtool check rules` passes in CI.
  5. The Grafana JSON passes lint.
- **Effort:** M (4–5 sessions).

#### OP-4: an admin surface (API and CLI first, UI later)
- **Evidence:**
  - MX-17 (U+R), MX-20 (U), SEC-9 (C), PERF-15 (U).
  - Research: the Mem0 self-hosted server has an admin wizard and a request audit log (card). Anthropic Memory Stores' `redact` scrubs content while keeping the audit row (Anthropic card).
- **Build:**
  1. **Remove the broken dashboard** (done in v3.13 by TT-12).
  2. **Admin API** (protected by `ADMIN_TOKEN`; later by an admin role):
     - `GET /admin/agents`: paginated, with per-tier counts, `last_seen`, last sleep, backlog, and missing embeddings.
     - `GET /admin/agents/:id`.
     - `DELETE /admin/agents/:id?mode=hard`: `eraseAgent()` across every content table and the Redis keys, leaving an audit tombstone. This needs ON DELETE fixes on `shared_memories` and `shared_procedures` (SEC-9).
     - `GET /admin/dream-runs?status=&stale=`.
     - `POST /admin/dream-runs/:id/requeue` and `POST /admin/dream-runs/:id/fail`.
     - `GET /admin/schema`.
     - `GET /admin/config` (redacted).
     - `POST /admin/retention/run`.
     - `GET /admin/audit/verify?agent=`.
  3. **Design constraint.** Chain hashes must cover a *hash* of the content, not the content itself. A hard delete can then null the content snapshots without breaking `verify()`, matching SEC-9's recommendation that audit rows keep their hashes.
  4. **CLI.** `memforge admin …` wraps the API, alongside `doctor`, `migrate` and `backup`.
  5. **No UI in core.** Revisit later, either as an MCP Apps review UI (skills-distribution card idea) or inside G2.
- **Acceptance:**
  1. Each route has an HTTP test.
  2. The hard-delete test finds zero rows for the agent in every table that has an `agent_id` column, finds the tombstone, and `verify()` still reports valid.
  3. Every route is in the OpenAPI spec.
- **Effort:** M (4–6 sessions).

#### OP-5: upgrades become a supported operation
- **Evidence:**
  - SR-7 (C), MX-9 (P), PERF-2 (P), SR-17 (U).
  - Hindsight 1.0 declared a stable API. *Fact-check: confirmed.*
  - Verifier note (performance dimension, unverified): the `ORDER BY embedding <=> $2, id DESC` tie-break stops PG16 from using an HNSW index.
- **Build:**
  1. **Upgrade policy.** Write one down: any 3.x at or after 3.0.0-beta.4 upgrades to current through the runner.
  2. **Expand/contract migrations.** Code at version N-1 must keep working against schema N during a rolling deploy.
  3. **Deprecation policy.** An API is deprecated for one minor release, using `Deprecation` and `Sunset` headers, before removal.
  4. **`memforge vector setup`** (PERF-2): pin `halfvec(N)` from `EMBEDDING_DIMENSIONS` and build HNSW with explicit parameters, as a `manual` migration. Apply the tie-break in an outer query after the index-ordered LIMIT.
  5. **Visibility.** Add a progress metric for Phase 5.9 re-embedding.
- **Acceptance:**
  1. A rolling-upgrade smoke test passes: the previous image against the new schema.
  2. On a 10K-row fixture, vector setup creates the index and `EXPLAIN` shows the semantic query using it.
- **Effort:** M (3–4 sessions).

#### OP-6: backup, restore and disaster recovery
- **Evidence:**
  - SR-9 (C), ARCH-8 (C), MX-14 (U), SEC-10 (C), SEC-9 (C).
  - Research: Hindsight Cloud added zip import and export of a bank (October 2026 update, card). Cognee's card suggests a portable signed export bundle (idea).
- **Layer 1: instance disaster recovery is Postgres-native.**
  1. Document:
     - `pg_dump -Fc` with `pg_restore`;
     - PITR with WAL archiving (pgBackRest or WAL-G) or managed-Postgres snapshots;
     - an RPO/RTO table.
  2. Spell out what to back up besides the database: `AUDIT_HMAC_KEY` (without it the audit chain cannot be verified), the tokens, and `.env`.
  3. Spell out what does not need backing up: Redis holds only cache. Copies pushed to Anthropic Memory Stores are not backups.
  4. Add `memforge backup` and `memforge restore` for the standalone volume.
- **Layer 2: agent portability is export format v2.** It is for moving agents, including OSS-to-enterprise migration, and is not a disaster-recovery mechanism.
  1. **Header line:** `{format: "memforge-export", version: 2, app_version, schema_version, agent, namespaces, counts, created_at}`.
  2. **Records** cover every tier and namespace:
     - hot rows;
     - warm rows with every column, including `occurred_at`, epistemic fields and scores;
     - cold rows (optional);
     - entities, relationships, procedures and reflections;
     - revisions and audit (optional);
     - embeddings with their model id (optional).
  3. **Trailer** with a SHA-256 of the body.
  4. **Streaming.** NDJSON streams in both directions, with cursor reads and a streaming parser.
  5. **Import** writes into `warm_tier` directly, in one transaction, with id remapping:
     - classification runs on import (SEC-10, ARCH-14);
     - imported procedures arrive provisional and inactive, with clamped confidence.
- **Acceptance:**
  1. Round trip: export a fixture larger than 1 MB with 3 namespaces, import it into a new agent, and export again. The normalised diff is empty.
  2. A nightly restore drill: dump, restore to a fresh database, confirm migration status is clean, confirm the audit chain verifies, and confirm a fixed query set returns the same ids.
  3. A file with a bad checksum is rejected.
- **Effort:** M (6–8 sessions; upper end of M).

#### OP-7: safe to run more than one replica
- **Evidence:** ARCH-10 (C), SC-4 (P), PERF-18 (U), SR-5 (C), SR-16 (U), PERF-10 (C), MX-7 (P), SEC-13 (C), ARCH-17 (U), SR-15 (U), SC-18 (U), PERF-9 (P), ARCH-22 (U), PERF-24 (U+R: 250 ms poll), PERF-19 (U), PERF-23 (U), MX-10 (U+R).

| Shared state | Today | Change |
|---|---|---|
| Sleep mutex | In-process Map | Advisory lock (TT-4) |
| Dream worker | One serial worker per process; LISTEN never reconnects; polls every 250 ms even when LISTEN is healthy | Bounded concurrency across distinct agents; reconnect with backoff; poll every 5–30 s while LISTEN is healthy; record the instance id on each run |
| Consolidation lock | Blocking `pg_advisory_lock` on a pooled connection, so N waiters hold N+1 connections | Try-lock that returns 409 or 202; lock and batch on one connection; acquire `lockClient` inside try/finally |
| Long work in HTTP handlers | `consolidate` and `/sleep` run for minutes inside the request | Consolidate becomes async (202 with a run id, like dreams); document `/sleep` as legacy synchronous |
| Rate limiting | Per IP, in memory, no `trust proxy` | `TRUST_PROXY`; key on token hash or principal; Redis store when `REDIS_URL` is set |
| Query cache | Invalidated in route handlers via SCAN; stale after async sleep and pool publish | Invalidate in the manager; per-agent generation counter; a plain add invalidates only stats |
| Config reload | Per process | Document it as restart-only, or broadcast via NOTIFY |
| Retention and archive jobs | Run on every replica | Leader-only under an advisory lock |
| Webhooks | Fire-and-forget per process | Outbox table with retries (AR-6) |
| Connection pool | Default 10; a hybrid query uses 4–6 connections | Default 20. Document PgBouncer: workers, session locks and LISTEN need a direct connection (`DIRECT_DATABASE_URL`). |

- **Acceptance:** `tests/multi-instance.test.ts` runs two `createApp` instances and two workers against one database, and shows:
  1. A same-agent sleep from both produces one 409.
  2. Each dream run is claimed exactly once.
  3. When worker A is killed, worker B reclaims its run.
  4. Cache invalidation is visible on both instances after an async sleep.
  5. The Redis-backed rate limit is shared.
- **Effort:** M (5–6 sessions).

#### OP-8: database growth is bounded
- **Evidence:**
  - PERF-17 (U).
  - SEC-9 (C): cold-tier retention is off by default.
- **Build:**
  1. Add a leader-only maintenance job with configurable retention:
     - `retrieval_log` rows without feedback older than 30 days;
     - keep only the last N rows per agent in `sleep_phase_analytics` and `drift_signals`;
     - `consolidation_log` and `memory_sequences`.
  2. Add `(agent_id, created_at DESC)` indexes.
  3. Export table-size gauges.
  4. Document the default for cold-tier retention.
- **Acceptance:**
  1. A retention test with seeded old rows removes exactly the expected rows.
  2. The table-size gauges are exported.
- **Effort:** S (1–2 sessions).

---

## 3. A smaller API and MCP surface (AP-1…AP-4; originally v3.15.0 "Small surface", now RT-2, RT-3 and RT-6)

#### AP-1: MCP exposes 10 core tools by default and the rest behind a flag
- **Evidence:**
  - MX-6 (P), MX-16 (U), SC-24 (U).
  - MX-3 (P) and RA-11 (C) govern `memforge_feedback`.
  - Research:
    - Anthropic's Connectors Directory requires `title` plus `readOnlyHint` or `destructiveHint`. *Confirmed.*
    - The OpenAI card proposes a curated 6–10 tool profile. *Idea.*
    - The skills-distribution card says Mem0 narrowed its Claude plugin to one read-only search tool. *Card; no fact-check.*

| Core tool | Read or write | Notes |
|---|---|---|
| `memforge_resume` | read | New; the REST route already exists |
| `memforge_query` | read | Add `after`, `before`, `max_tokens`, `snippet_tokens` and mode `code`; absorbs `certainty` as an `epistemic` parameter |
| `memforge_active_recall` | read | |
| `memforge_timeline` | read | |
| `memforge_add` | write | Add `outcome_type`, `hints`, `occurred_at` and `session_id` |
| `memforge_consolidate` | write, idempotent | |
| `memforge_feedback` | write | Ship only once query results carry a `retrieval_id` (MX-3/RA-11, accuracy plan) |
| `memforge_sleep_advisory` | read | |
| `memforge_dreams_create` | write | Async maintenance; replaces `memforge_sleep` in the core set |
| `memforge_dreams_status` | read | |

- **Opt-in toolsets**, selected with `MEMFORGE_MCP_TOOLSETS`:
  - **`inspect`:** health, stats, drift, epistemic_profile, explain, entities, graph, reflections, procedures, cold_search.
  - **`maintain`:** sleep, reflect, meta_reflect, dedup_entities, set_validity, the three namespace-deprecation tools, cold_restore, dreams_list, dreams_cancel.
  - **`share`:** publish_procedures, shared_procedures, expertise, declare_role, roles, detect_roles, bootstrap, record_procedure_outcome.
  - **`experimental`:** causal_chain, predict, principles. (The `anthropic_*` bridge tools are removed in v3.13.0 with the bridge; TT-12.)
  - **`all`.**
- **Removals.** `memforge_mental_models` (its own description says it is always empty) and `memforge_certainty` (a duplicate of query) remain as aliases for one release, then go.
- **One source of truth.** `src/tools/spec.ts` generates the definitions in `mcp.ts`, `tool-definitions.ts` (Anthropic and OpenAI formats) and `python/memforge/tools.py`.
  - Fix the mismatched `limit` caps.
  - Tool descriptions state their LLM prerequisites, or `sleep` runs its SQL phases without an LLM and reports `llm_phases_skipped` (MX-16).
- **Acceptance:**
  1. The default `tools/list` returns exactly 10 tools, each with a `title` and annotations.
  2. The serialised default `tools/list` is at most 30% of today's byte size (measure the baseline first).
  3. CI fails when a generated file differs from the spec.
  4. The MCP test calls every core tool.
- **Effort:** M (4–5 sessions).

#### AP-2: the OpenAPI spec is complete
- **Evidence:** MX-12 (U+R). The spec documents 50 paths, the app has 69 distinct route paths, and there are 0 `operationId`s.
- **Build:**
  1. Add the 19 missing paths.
  2. Add stable `operationId`s.
  3. Add a route-coverage test that walks the Express router stack and compares it with the spec in both directions.
  4. Lint the spec in CI.
  5. Validate `plugins/m365-copilot` `run_for_functions` against the `operationId`s.
  6. Delete the retired ChatGPT-plugin assets, or serve them.
- **Acceptance:**
  1. The coverage test finds nothing missing in either direction.
  2. The spec lints clean.
  3. The manifest check passes.
- **Effort:** M (2–3 sessions).

#### AP-3: the TypeScript and Python SDKs reach parity
- **Evidence:**
  - MX-13 (U), MX-3 (P), SR-19 (U).
  - The frameworks research card notes that framework adapters build on these SDKs.
- **Build:**
  1. Generate a parity matrix (route → TS method → Python method → MCP tool, or a listed exemption) and test it.
  2. Align names across the two SDKs.
  3. Add the missing Python methods, and add export and import to the TS SDK.
  4. Give both SDKs a default timeout (long operations go through async endpoints) and retry idempotent GETs.
  5. Version the Python SDK in lockstep with the server.
  6. Run the INTEGRATION.md snippets in CI. Today `ctx.recent.map` throws because ResumeContext has a different shape.
- **Acceptance:**
  1. The parity test fails on any gap that is not exempted.
  2. The doc-snippet job passes.
  3. A test proves the timeouts fire.
- **Effort:** M (4–5 sessions).

#### AP-4: an error and stability contract
- **Evidence:**
  - SR-13 (U+R), SR-12 (U).
  - Verifier note: contention currently returns 500 where 409 belongs.
  - Hindsight 1.0 committed to a stable API. *Confirmed.*
- **Build:**
  1. Add a stable machine-readable `code` to `{ ok:false, error }`.
  2. Use 400, 401, 403, 404, 409, 413, 429 and 503 consistently, with Retry-After on 429 and 503.
  3. Mark every OpenAPI operation with `x-stability`. `/v1/dreams` and the Anthropic bridge are `experimental` (SC-3).
  4. Adopt a policy for `Deprecation` and `Sunset` headers.
- **Acceptance:**
  1. An error-contract test runs a table of cases across all routes.
  2. Every operation carries `x-stability`.
- **Effort:** S (1–2 sessions).

---

## 4. Test and CI gaps, and a failure-injection plan

### Gaps

| Gap | Evidence | Fixed by |
|---|---|---|
| 29 of 35 test files never run in CI | SR-8 (P) | TT-15 |
| No MCP test | MX-1, SR-2 (C) | TT-10 |
| No TypeScript SDK test | SR-8 | CI-2 |
| OAuth path untested (every HTTP test sets `OAUTH2_REQUIRED=false`) | SR-8 | CI-2 (stub introspection server) |
| No upgrade, install or channel tests | SR-7, MX-2 | TT-14, TT-8, TT-9 |
| The security suite greps source strings, and has no cross-tenant HTTP test | ARCH-19 (U) | CI-2 |
| `tests/mocks` has no failure mode | SR-8 | CI-3 |
| No performance data above ~500 rows | PERF-20 (U) | CI-5 |
| Node 20 is in the matrix, but Node 22+ is required | verifier note, re-checked | TT-15 |

#### CI-2: new conformance suites
- **Build:**
  - a TS SDK test against `createApp` on an ephemeral port;
  - an OAuth introspection stub test covering active, inactive, non-2xx and malformed responses;
  - an HTTP tenant-isolation matrix (ARCH-19). It first asserts today's documented single-trust-domain behaviour, and its expectations flip once AR-4 lands;
  - behavioural replacements for the source-grep security tests. For example, two concurrent `consolidate()` calls must serialise.
- **Acceptance:** each suite runs on every pull request.
- **Effort:** M (3–4 sessions).

#### CI-3: a failure-injection harness
- **Build:**
  - Add `FaultyEmbeddingProvider` and `FaultyLLMProvider` wrappers with these modes: `throw`, `hang`, `slow(ms)`, `429+Retry-After`, `malformed`, `wrong_dimension`.
  - Add DB and Redis helpers for: per-session `statement_timeout`, a small pool, `pg_terminate_backend` targeted by `application_name`, a side transaction that holds locks, and stopping or killing containers.
  - Use Toxiproxy for network faults in the nightly tier.

| # | Fault | Injection | Expected behaviour |
|---|---|---|---|
| F1 | Embedding provider hangs | `hang` mode | Hybrid query returns keyword results with `degraded` set within timeout + 1 s; consolidation fails or finishes within the timeout |
| F2 | LLM returns 429 | `429+Retry-After` | Bounded retries; the sleep cycle records a partial result; spend metrics stay correct |
| F3 | Statement timeout on a background write | `SET statement_timeout=1ms` on the test pool | The request succeeds; the process stays alive; the counter increments |
| F4 | Pool exhaustion | `DB_POOL_MAX=2` plus 20 concurrent queries | 503 with Retry-After or queueing, but no crash; the pool recovers |
| F5 | Connection killed mid-consolidation | `pg_terminate_backend` | The batch rolls back; hot rows are not lost; no duplicate warm rows |
| F6 | Lock contention during sleep Phase 1 | A side transaction holds row locks | Queries survive; the sleep phase times out cleanly and records a partial result |
| F7 | Database down | Stop the container | `/ready` returns 503 within 2 s; `/health` returns 200; full recovery after restart |
| F8 | Redis down or slow | Toxiproxy latency, or stop the container | Cache misses; no request blocks longer than the command timeout |
| F9 | SIGTERM during a dream run | Signal the process | The run returns to `pending` |
| F10 | SIGKILL during a dream run | Kill worker A | Worker B reclaims after the lease and finishes |
| F11 | Concurrent writers to one audit chain | 20 parallel `recordBatch` calls | `verify()` reports valid |
| F12 | Bad client input | Oversized body, malformed JSON, MCP notification, non-ASCII | 413 / 400 / no output / correct round trip |

- **Invariants checked after every scenario:**
  - **I1:** the process is alive, unless the scenario killed it on purpose.
  - **I2:** no dream run is `running` with a stale heartbeat once the lease has passed.
  - **I3:** idle pool connections are back to baseline, and no app session is `idle in transaction`.
  - **I4:** hot-to-warm conservation holds: every hot row is still in hot, or is a source of exactly one warm row. Cold archives are unique per source.
  - **I5:** `verify()` reports valid for every touched agent.
  - **I6:** the expected failure metric incremented, and no unrelated failure metric did.
- **Cadence.** F1–F4, F9 and F11–F12 run on every pull request with in-process mocks. F5–F8 and F10 run nightly with containers.
- **Effort:** M (4–6 sessions) for the harness and the pull-request tier; S–M for the nightly tier.

#### CI-4: multi-instance tests
- This is the acceptance suite for OP-7.

#### CI-5: a nightly scale harness
- **Evidence:** PERF-20 (U). The published query p50 of 46 ms is self-reported retrieval latency measured at about 50 warm rows per agent on the LongMemEval-S corpus, so it is not a scale result.
- **Build:**
  - Fixtures: 100K rows for one agent, and 100K rows across 1,000 agents.
  - Track hybrid p50 and p95, consolidated rows per second, sleep duration per 10K rows, and pool `waiting`.
  - Fail the run on a regression of more than 25%.
  - Hindsight says Postgres suits banks under about 50K memories (research card), so publish MemForge's measured envelope next to that figure.
- **Effort:** M, shared with the accuracy and performance plan.

#### CI-6: the release gate
- **Build:** `release.yml` requires CI-1 through CI-4, `install-smoke`, `upgrade-test`, `channel-check` and docs-consistency. It then publishes npm (provenance is already enabled), GHCR and PyPI together.
- **Effort:** S (1 session).

---

## 5. Architecture refactors that reduce risk and prepare the fork

**Principles**
1. Every refactor preserves behaviour and lands **upstream in the MIT core first**. The enterprise edition then consumes the core as a dependency or an `ee/` package instead of diverging from it, which follows the fork-structure idea in the enterprise research card.
2. Build the seams before the surgery: injectable dependencies come first, and decomposition comes last.
3. Do not start AR-7 or later until TT-15 has the whole suite running in CI. The tests are the safety net. Within v3.13.0, TT-1, TT-2, TT-5, TT-11 and TT-14 land after TT-15a, so their regressions show up in the non-blocking job.

| Order | Item | Audit IDs | Reduces risk by | Prepares the fork by | Depends on | Effort | Target (original numbering; see the Status banner) |
|---:|---|---|---|---|---|---|---|
| 1 | **AR-1** Injectable `pool` in `MemForgeConfig` and `AppDependencies`, plus a `withTx`/`withTenantTx` helper | ARCH-5 (P) | Tests stop mutating globals; one place to set statement and idle timeouts | Per-transaction `SET LOCAL` for RLS and tenancy; read replicas; a database per org | none | S (1–2) | 3.14 |
| 2 | **AR-2** `createAuth(config)` factory plus a `Principal` type populated by the auth layer | ARCH-3 (P), ARCH-2 (C, step 1), SEC-14 (C) | Removes the import-time environment singleton; makes TT-11's modes testable | The enterprise edition plugs in OIDC, JWKS or SSO without editing core | OP-1 | S (1–2) | 3.14 |
| 3 | **AR-3** Request context (AsyncLocalStorage with `requestId`, `principal`, `agentId`). No new audit columns: actor attribution is ENTERPRISE-EDITION U-2, the single audit-format migration | SEC-7 (P), ARCH-15 (U) | Correlated logs; the principal is available to U-2 | Compliance audit and per-user attribution (via U-2) | AR-2 | S–M (2–3) | 3.14 |
| 4 | **AR-5** Hook registry `{onIngest, onEgress, onRetrieve, onMutate}`. Classification runs on every ingest path, and one egress policy covers Dreams, Memory Store push and external embeddings. | ARCH-14 (U), SEC-10 (C), SEC-17 (U), SEC-6 (P) | Import, bootstrap, bridge pull and library callers can no longer skip classification | Enterprise DLP and sensitivity labels | AR-1 | S (1–2) | 3.14 |
| 5 | **AR-6** Injectable `EventSink` with an outbox table and HMAC-signed webhooks; all five events emitted | ARCH-9 (P), MX-21 (U), SR-19 (U), SC-23 (U) | Webhooks are delivered and safe across replicas | Per-space fan-out and SIEM export | AR-1 | S–M (2–3) | 3.14/3.15 |
| 6 | **AR-4** `MemoryContext {agentId, namespace, sessionId, principal}` plus an `authorize(principal, action, resource)` hook. The OSS default allows everything; an optional token-to-agent-prefix map is the short-term fix SEC-1 recommends. Dream-run lookups and pool reads are scoped by caller. | ARCH-2 (C), SEC-1 (C), SEC-4 (P), ARCH-7 (U), SEC-16 (U), SEC-11 (P) | One enforcement point; the CI-2 isolation matrix gets a target | The enterprise edition supplies a space and role policy (G2 plan) | AR-2, AR-3 | M (4–6) | 3.15 |
| 7 | **AR-7** Sleep-phase registry: a `SleepPhase` interface whose runner owns skip policy, per-phase guards, partial results, analytics, metrics, budget and cancellation | ARCH-13 (U), SR-18 (U), SR-3 (C) | Fixes skip and failure handling in one place, not 17 | The enterprise edition adds phases (such as approval gates) without editing `run()` | TT-3, OP-3 | M (3–5) | 3.15 |
| 8 | **AR-8** Split `createApp` into memory, pool, dreams and admin routers; export `DreamRunsWorker`, the auth factory and the cache API; lint so `ee/` may import only from `index.ts` | ARCH-16 (U+R) | Smaller files; per-router tests | `ee/` mounts routers and middleware | AR-2 | M (3–4) | 3.15 |
| **Fork branch point** | The enterprise repo or `ee/` package can start here, consuming the MIT core | | | | AR-4, AR-8 | | RT-3 exit (NEXT-ITERATION-PLAN §4): ~2027-07-25 at the 5/week plan of record, ~2027-04-18 at the 9/week upside. `ee/` itself waits for the demand gate |
| 9 | **AR-9** RLS enforced on the app path: a non-owner role, `SET LOCAL` per transaction, `FORCE ROW LEVEL SECURITY`, policies on the 12 uncovered tables, a per-table `verify-rls.sh`, the HTTP suite run under the app role, and a separate archiver role for audit deletes | ARCH-6 (C), SEC-2 (C), SEC-18 (U). Verifier note: the documented non-owner role setup currently breaks the app (unverified). | Defence in depth for agent isolation | The fork's principal and space policies sit on a mechanism that works | AR-1, AR-4, TT-14 | M–L (5–8) | 3.16 |
| 10 | **AR-10** Shared-pool safety: dedup by similarity with archive and audit; soft delete with provenance; pool retrieval in a single query (embed once, UNION, reputation join) | ARCH-11 (C), SC-9 (P), ARCH-12 (U), PERF-14 (U), PERF-11 (P) | Ends unaudited hard deletes of shared knowledge | Gives knowledge-space retrieval its query shape (the SEC-5 ACL model itself is G2 scope) | AR-3, AR-6 | M (3–4) | 3.16 |
| 11 | **AR-11** Decompose `MemoryManager` in slices: RetrievalService → IngestService → SleepService → SharingService → DreamsService/BridgeService. Add a `WarmTierRepository` for the ~15 queries the enterprise edition must rewrite, and keep the façade. | ARCH-4 (P). The file has 5,175 lines and was touched in 20 of the last 62 commits. | Shrinks the highest-churn hotspot | The enterprise edition overrides repository methods instead of patching SQL | AR-1, AR-4, TT-15 | L (10–15 sessions over 3+ releases) | 3.15 → 3.17 |

**What not to do:**
- Do not adopt an ORM.
- Do not build a full repository layer in one pass (ARCH-4 says to slice it).
- Do not fork before AR-4 and AR-8. Forking earlier turns every G3 fix in this plan into a merge conflict.

---

## 6. Decisions, risks and dependencies

### Decisions proposed
- **D1. Release number.** Release v3.13.0 from `main`. Alternatives: 3.8.0, once TT-14 separates migration order from version; or 4.0.0, if the owner treats fail-closed auth as breaking.
- **D2. Auth fails closed everywhere.** Unauthenticated mode is opt-in and restricted to loopback. The standalone image generates its own secrets.
- **D3. Keep the hand-rolled stdio MCP transport.** This follows CLAUDE.md's rule "No external MCP SDK", and the fix is S. G2 needs remote Streamable HTTP with OAuth 2.1, which is the point to revisit that rule. That is an owner decision for the G2 plan.
- **D4. The migration runner is in-process TypeScript.** It has a manifest, checksums and an advisory lock, and stamps baselines by probing. Auto-migrate defaults on for single-instance installs; multi-replica deploys run it as a pre-deploy job.
- **D5. Postgres-native backup is the disaster-recovery mechanism.** Export v2 is for portability. `AUDIT_HMAC_KEY` is backed up together with the database.
- **D6. Metrics carry no `agent_id` labels by default.** Per-agent detail comes from the admin API.
- **D7. MCP ships 10 core tools by default,** with named toolsets opt-in. `certainty` and `mental_models` are deprecated.
- **D8. No admin UI in core this iteration; the curator UI is EE E3-5.** The admin surface is an API plus a CLI. The broken dashboard is removed in v3.13.
- **D9. Shared-pool deletes are off by default until AR-10.**
- **D10. Seams come before decomposition, and the fork branches after AR-4 and AR-8.**

### Risks
- **Full CI turns red.** Turning on 29 dormant test files will expose failures. Mitigation: TT-15a counts red files in week 1 behind a non-blocking job; the stabilisation pass (TT-15b) runs in weeks 4–6.
- **Fail-closed auth breaks open deployments.** Mitigation: an explicit opt-out, a one-line startup error that names the fix, and UPGRADING.md.
- **Auto-migrate meets heavy migrations.** Mitigation: `manual: true` migrations are never applied automatically, and the advisory lock prevents races.
- **PgBouncer in transaction mode** breaks session advisory locks and LISTEN. Mitigation: document `DIRECT_DATABASE_URL` for the worker and lock paths.
- **Solo-maintainer bandwidth.** If time runs short, defer OP-6 layer 2, AP-3 and AR-11. Do not defer TT-*, OP-1, OP-2, OP-3 or OP-7.

### Dependencies on other plans
- **G1 skill.** It needs TT-10 (working MCP), AP-1 (core toolset) and `retrieval_id` on query results (MX-3/RA-11, accuracy plan). It must teach that nothing auto-consolidates until the accuracy plan resolves SR-14/RA-18.
- **G2 fork.** It needs AR-2, AR-3, AR-4, AR-8 and AR-9. The G2 plan covers remote MCP with OAuth, knowledge spaces (SEC-5) and subject-level erasure (SEC-9).
- **Accuracy and performance plan.** It owns RA-*, the quality metrics in SC-12, PERF-3/4/6, and the scale envelope (CI-5 is shared).

---

## Appendix A: where each audit finding goes

| Finding | Item(s) |
|---|---|
| **SR-** | SR-1 → TT-1 · SR-2 → TT-10 · SR-3 → TT-3 · SR-4 → TT-5 · SR-5 → TT-4, OP-7 · SR-6 → TT-14, TT-8 · SR-7 → TT-14, OP-5 · SR-8 → TT-15, CI-2…6 · SR-9 → TT-7, OP-6 · SR-10 → TT-2 · SR-11 → TT-1 · SR-12 → TT-6, OP-1 · SR-13 → TT-6, AP-4 · SR-14 → TT-12 (docs; behaviour is in the accuracy and G1 plans) · SR-15 → OP-7 · SR-16 → OP-7, OP-2 · SR-17 → TT-13 · SR-18 → AR-7 · SR-19 → AR-6, AP-3 |
| **MX-** | MX-1 → TT-10 · MX-2 → TT-9 · MX-3 → AP-1, AP-3 (implementation in the accuracy plan) · MX-4 → TT-11 · MX-5 → TT-11 · MX-6 → AP-1 · MX-7 → OP-7 · MX-8 → OP-2, OP-3 · MX-9 → TT-14 · MX-10 → TT-12, OP-1 · MX-11 → OP-1 · MX-12 → AP-2 · MX-13 → AP-3, TT-12 · MX-14 → TT-7, OP-6 · MX-15 → TT-12, TT-13 · MX-16 → AP-1 · MX-17 → TT-12, OP-4 · MX-18 → TT-4 · MX-19 → TT-8 · MX-20 → OP-4 · MX-21 → AR-6 |
| **ARCH-** | ARCH-1 → TT-11 · ARCH-2 → AR-2, AR-4 · ARCH-3 → AR-2 · ARCH-4 → AR-11 · ARCH-5 → AR-1 · ARCH-6 → TT-12 (claim), AR-9 · ARCH-7 → AR-4 · ARCH-8 → TT-7, OP-6 · ARCH-9 → TT-12, AR-6 · ARCH-10 → TT-4, OP-7 · ARCH-11 → TT-6, AR-10 · ARCH-12 → AR-10 · ARCH-13 → AR-7 · ARCH-14 → AR-5 · ARCH-15 → TT-5 · ARCH-16 → AR-8 · ARCH-17 → OP-7 · ARCH-18 → TT-12 · ARCH-19 → CI-2 · ARCH-20 → TT-14 · ARCH-21 → TT-12 · ARCH-22 → OP-7 |
| **SEC-** | SEC-1 → AR-4 (the G2 plan owns the full model) · SEC-2 → TT-12, AR-9 · SEC-3 → TT-11, TT-8 · SEC-4 → AR-4 · SEC-5 → G2 plan (seam AR-4) · SEC-6 → AR-5 · SEC-7 → TT-5, AR-3 · SEC-8 → TT-5 · SEC-9 → OP-4 (agent-level), OP-8, G2 plan (subject-level) · SEC-10 → AR-5, OP-6 · SEC-11 → AR-4 · SEC-12 → TT-12 · SEC-13 → OP-7 · SEC-14 → TT-11, AR-2 · SEC-16 → AR-4 · SEC-17 → AR-5 · SEC-18 → TT-12, AR-9 |
| **PERF- (operational)** | PERF-1 → TT-8 · PERF-2 → OP-5, OP-2 · PERF-5 → TT-1 · PERF-7 → TT-2 · PERF-8 → TT-2 (in part) · PERF-9 → OP-7 · PERF-10 → OP-7 · PERF-11 → AR-10 · PERF-14 → AR-10 · PERF-15 → OP-4 · PERF-17 → OP-8, OP-3 · PERF-18 → TT-4 · PERF-19 → OP-7 · PERF-20 → CI-5 · PERF-21 → TT-12 · PERF-23 → OP-7 · PERF-24 → OP-7 |
| **SC- (operational)** | SC-1 → TT-3 · SC-3 → TT-12, AP-4 · SC-4 → TT-4 · SC-9 → TT-6, AR-10 · SC-11 → TT-1 · SC-18 → TT-12, OP-7 · SC-21 → AR-4 · SC-22, SC-26 → OP-3 · SC-23 → AR-6 · SC-24 → AP-1 |

## Appendix B: facts re-checked at HEAD for this plan (2026-11-16, `16e2f15`)

- **MCP framing.** `src/mcp.ts:1006` writes `Content-Length: …\r\n\r\n` framing. The protocol version is `'2024-11-05'`. There are 46 `memforge_*` tools, and none carries annotations.
- **Version strings.** `src/version.ts` says `'3.2.0'`; `package.json` says `3.7.0`; `server.json` says `3.0.0` and points at the npm identifier `memforge-mcp`.
- **Floating promises.** There are bare `void this.pool.query(` calls with no `.catch` at `memory-manager.ts:991, 2305, 2459, 2754` and `sleep-cycle.ts:943`. `src/` has no `unhandledRejection` handler, and ESLint has no floating-promise rule.
- **Phase skipping.** `shouldSkipPhase` reads the last 3 rows with no time bound.
- **Compose.** The memforge service gets only `DATABASE_URL`, `REDIS_URL` and `PORT`. Postgres uses `postgres:16-alpine`. Neither `.env.example` nor `.env.docker` contains `MEMFORGE_TOKEN`.
- **Docker builds.** `.dockerignore` excludes `dist` and `tsconfig.json`. The Dockerfile copies `tsconfig.json`, and `Dockerfile.standalone` copies `dist/`, sets `CONSOLIDATION_INNER_BATCH_SIZE=1`, and has no `USER`.
- **Standalone entrypoint.** It initialises the embedded database with a development-grade authentication setting, then applies `schema.sql` and `ls migration-*.sql | sort` with `2>/dev/null || true`.
- **Schema.** `schema.sql:57` creates `warm_tier_occurred_idx` before the table is created at line 73. The file has 30 `CREATE TABLE` statements. No migration uses `CONCURRENTLY`.
- **CI.** The test matrix is Node `[20, 22]`. CI runs `test:security`, `integration`, `llm`, `http`, `cache` and `load`, applies the schema with plain `psql -f`, and runs 6 of the 35 test files. `release.yml` publishes to npm only.
- **Error handling.** The global error handler always returns 500.
- **Config.** `src/` reads 74 distinct `process.env` keys. Only `WARM_CONSOLIDATION_TARGET` goes through `getConfig()`.
- **OpenAPI.** It documents 50 paths; `app.ts` has 69 distinct route paths and 72 route registrations. There are 0 `operationId`s.
- **Exports.** `src/index.ts` exports neither `DreamRunsWorker` nor the auth or cache APIs.
- **Dashboard.** Its fetches carry no Authorization header.
- **Phantom endpoints.** CLAUDE.md lists `/memory/:id/hints` and `/memory/:id/conflicts`, and neither route exists. `enableLlmIngest` is set but never read.
- **Dream-runs worker.** `POLL_INTERVAL_MS = 250`.
- **Not re-checkable here.** The local clone is shallow and has no tags, so MX-2's live registry checks from 2026-10-30 stand as the evidence for the npm state.
