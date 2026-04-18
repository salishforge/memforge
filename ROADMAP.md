# MemForge Roadmap

## The Long-Term Vision

AI agents today are stateless by default. Every conversation starts from zero. The few systems that add memory treat it as a passive store — save facts, retrieve facts, hope for the best.

This isn't how intelligence works.

Biological intelligence is built on memory that **evolves**. Memories strengthen through use, weaken through neglect, get rewritten as understanding deepens, and organize into increasingly abstract knowledge structures over time. A person who has worked in a field for 20 years doesn't just have more facts than a beginner — they have qualitatively different knowledge: intuitions, mental models, procedural fluency, and the ability to recognize what matters.

**MemForge exists to give AI agents that same trajectory.** Not agents that remember more, but agents that understand better — over months and years, across technology changes, through evolving requirements.

The goal is a constant set of evolving agents developed and refined over years, each accumulating genuine expertise in their domain, adapting as the world around them changes.

---

## Where We Are Today (v3.0.0-beta.4)

MemForge has a production-grade foundation with CI fully green:

- **Tiered memory** with hot → warm → cold lifecycle
- **Sleep cycles** — 10-phase background processor (scoring, triage, conflict resolution, revision, graph maintenance, reflection, schema detection)
- **Hybrid retrieval** — dual-tokenizer FTS + pgvector HNSW semantic search + asymmetric RRF fusion (93.2% R@5 on LongMemEval)
- **Active Knowledge Management** — staleness detection, prioritized experience replay, conflict resolution, temporal chains, knowledge gap detection, schema crystallization
- **Cross-agent shared memory** — hierarchical pools, hearsay discounting, per-domain reputation
- **Cryptographic audit chain** — HMAC integrity verification across all 14 mutation points
- **Content classification** — pre-LLM sanitization, secret pattern detection
- **In-process embeddings** — bge-small-en-v1.5 at 137 embeds/sec, no external service needed
- **SDKs** — TypeScript, Python, MCP (Claude Desktop / Cursor)
- **Full test coverage** — integration, LLM paths, HTTP API, cache, load, security

---

## Phase 1: Production Hardening — COMPLETE

*Make MemForge reliable enough to trust with long-lived agents.*

All Phase 1 items are implemented:
- CI/CD pipeline with 8 jobs (Node 20+22) — typecheck / lint / build / security / integration / cache / load / RLS enforcement. Release workflow via npm Trusted Publishing (OIDC).
- Mocked LLM test suite, HTTP API tests, load tests, security tests
- Structured JSON logging with request correlation IDs (pino)
- Connection pool hardening with health checks, timeouts, auto-scaling
- **Streaming consolidation** — cursor-based per-transaction batches, idempotent re-run ([#11](https://github.com/salishforge/memforge/issues/11)) — ✅ DONE
- **Cold tier retention** — opt-in `COLD_TIER_RETENTION_DAYS` with audit trail ([#20](https://github.com/salishforge/memforge/issues/20)) — ✅ DONE
- **npm publish** — live at `@salishforge/memforge` ([#10](https://github.com/salishforge/memforge/issues/10)) — ✅ DONE

---

## Phase 2: Long-Term Memory at Scale — COMPLETE

*Enable agents to accumulate months of experience without degradation.*

### Memory Lifecycle Management

- **Memory namespaces** — Partition memories by domain, project, or context so agents with broad responsibilities maintain focused retrieval ([#16](https://github.com/salishforge/memforge/issues/16)) — ✅ DONE (PRs #100, #101)
- **Per-agent importance tuning** — Different agents need different memory profiles. A support agent should weight recency; a research agent should weight graph centrality ([#17](https://github.com/salishforge/memforge/issues/17)) — ✅ DONE: shipped in v2.4 migration (#57) — `agents.scoring_weights` JSONB column wired into sleep cycle phase 1
- **Cold tier search and restoration** — Query archived memories and selectively restore them when context shifts back to old topics ([#14](https://github.com/salishforge/memforge/issues/14)) — ✅ DONE (PR #102)

### Intelligent Resource Management

- **Multi-model revision strategy** — Cheap local models for routine sleep cycle maintenance, capable cloud models for high-stakes revisions ([#13](https://github.com/salishforge/memforge/issues/13)) — ⚠️ PARTIAL: `REVISION_LLM_PROVIDER` env var already routes revision calls to a separate provider instance (cheap/capable split works today). The "two-pass triage" variant (cheap classifier → capable executor) remains future work on this issue.
- **Adaptive sleep scheduling** — `sleepAdvisory(agentId)` returns a structured recommendation based on hot backlog, contradiction rate, revision debt, time since last sleep, and stability ceiling. External orchestrators (cron, control plane) consume it; MemForge stays scheduler-free by design. — ✅ DONE (PR #104)
- **Memory budgeting** — `WARM_TIER_MAX_PER_AGENT` hard cap with lowest-importance eviction. Runs as Phase 2b of the sleep cycle after threshold eviction. — ✅ DONE (PR #103)

### Quality Metrics Dashboard

- **Longitudinal quality tracking** — Plot importance, confidence, revision velocity, and retrieval effectiveness over weeks and months. Detect degradation before it affects the agent.
- **A/B testing for revision strategies** — Compare revision outcomes across different LLM models, prompt strategies, and sleep cycle configurations.

### Milestone

An agent with 6+ months of accumulated memory, warm tier at 50K+ entries, demonstrably better retrieval quality than month 1. The sleep advisory (PR #104) gives operators the scheduling signal needed to sustain this at scale; the warm-tier cap + intelligent eviction keeps retrieval focused even as raw ingest volume grows.

---

## Phase 3: Cross-Agent Learning — COMPLETE

*Agents don't exist in isolation. Enable knowledge sharing and collective intelligence.*

All Phase 3 items are implemented:
- **Memory export/import** — JSONL export/import for backup, migration, seeding
- **Shared memory pools** — hierarchical team/global pools with publish/subscribe
- **Provenance chains** — source_chain tracking across agent hops
- **Hearsay discounting** — confidence × (0.8^hop_count) × agent_reputation
- **Per-domain reputation** — earned through corroboration/contradiction signals
- **Pool sleep cycles** — deduplication, conflict resolution, corroboration promotion
- **Cross-agent conflict detection** — private vs shared memory contradiction flagging
- **Procedure sharing** — condition→action rules published to pools with confidence discount; queryable by any pool member (`POST /pool/:id/procedures/publish/:agentId`, `GET /pool/:id/procedures`) — ✅ DONE (v3.1.0)
- **Expertise discovery** — rank pool members by topic relevance via FTS across all member warm tiers (`GET /pool/:id/expertise?q=`) — ✅ DONE (v3.1.0)
- **Role-aware memory** — agents declare or auto-detect expertise domains from knowledge graph entity distribution and procedure volume (`GET/POST /memory/:id/roles`, `POST /memory/:id/roles/detect`) — ✅ DONE (v3.1.0)

---

## Phase 4: Continuous Adaptation (2027-2028)

*Agents that adapt to changing technology, evolving requirements, and shifting contexts — without forgetting what still matters.*

### Technology Adaptation

- **Model-agnostic revision** — As new LLMs emerge, MemForge should seamlessly adopt them for consolidation and revision. The memory layer outlives any specific model generation. — ✅ DONE: `REVISION_LLM_PROVIDER` already routes revision calls to a separate provider instance independent of the consolidation model.
- **Embedding migration** — When switching embedding providers (e.g., upgrading from text-embedding-3-small to a future model), incrementally re-embed warm tier memories during sleep cycles rather than requiring a full rebuild. — ⚠️ PARTIAL (v3.2.0): `warm_tier.embedding_model` now tracks the provenance of each embedding. Incremental re-embed phase is future work.
- **Schema evolution** — Database migrations that run during sleep cycles, not as manual operations. The system adapts its own storage as capabilities grow.

### Contextual Adaptation

- **Drift detection** — Detect when the agent's environment has changed (new APIs, reorganized teams, deprecated systems) from patterns in memory contradictions and revision types. Surface drift to operators before it causes failures. — ✅ DONE (v3.2.0): `drift_signals` snapshots recorded each sleep cycle; `GET /memory/:id/drift` returns trend classification; `sleepAdvisory()` gains a `knowledge_drift` signal.
- **Selective forgetting** — Not all knowledge should persist forever. When an agent's domain shifts, actively deprecate knowledge from the old domain rather than letting it pollute retrieval. Controlled forgetting is as important as remembering.
- **Temporal knowledge management** — Understand that "the API endpoint is /v2/users" was true in 2026 but may not be true in 2028. Temporal annotations on knowledge enable the system to flag potentially stale facts. — ✅ DONE (v3.2.0): `warm_tier.valid_until` sets an expiry; Phase 5.6 of the sleep cycle penalizes expired rows and flags them for revision.

### Self-Improvement Loops

- **Outcome-driven revision priorities** — Memories linked to negative outcomes should be revised first. The system learns from its mistakes, not just from its gaps.
- **Reflection-driven sleep scheduling** — When meta-reflections identify blind spots or recurring contradictions, automatically increase sleep cycle attention to those knowledge areas.
- **Procedural evolution** — Condition→action rules should have their own lifecycle: strengthened when they lead to good outcomes, revised when contexts change, deprecated when they become irrelevant. — ✅ DONE (v3.2.0): `recordProcedureOutcome()` accumulates success/failure counts; Phase 5.7 of the sleep cycle boosts high-success procedures (+0.05) and deactivates chronically-failing ones.

### Milestone

An agent that has been running for 1+ year, has adapted through at least one major technology change (new LLM, new API version, team reorganization), and performs measurably better than a freshly instantiated agent with the same base model.

---

## Phase 5: Autonomous Knowledge Architecture (2028+)

*The system manages its own knowledge architecture — deciding what to remember, how to organize it, and when to restructure.*

### Self-Organizing Memory

- **Emergent namespaces** — Rather than pre-defined categories, the system discovers natural knowledge clusters during sleep cycles and organizes memory accordingly.
- **Hierarchical abstraction** — Automatically build abstraction layers: raw events → consolidated memories → reflections → meta-reflections → principles → strategies. Each layer is progressively more abstract and durable.
- **Knowledge graph evolution** — The entity types and relationship types aren't fixed. As the agent learns about new domains, the graph schema evolves to represent them naturally.

### Metacognitive Capabilities

- **Self-assessment** — The agent can answer "how confident am I about X?" and "when did my understanding of X last change?" from its memory health metrics and revision history.
- **Learning strategy selection** — Based on memory health patterns, the system selects different processing strategies: aggressive revision when contradictions are high, gentle consolidation when knowledge is stable, deep reflection when complexity is increasing.
- **Epistemic humility** — Track the boundary between what the agent knows well (high confidence, stable, frequently retrieved) and what it knows poorly (low confidence, frequently revised, rarely corroborated). Surface this distinction in retrieval results.

### Milestone

An agent that requires no operator intervention for memory management — it monitors its own knowledge quality, adapts its processing strategies, and flags when it encounters topics beyond its expertise.

---

## Principles That Guide the Roadmap

1. **Memory outlives models.** LLMs will be replaced every 6-12 months. The knowledge an agent accumulates should survive those transitions. MemForge is the persistent layer that gives agents continuity.

2. **Quality over quantity.** A small, high-confidence knowledge base outperforms a large, noisy one. Every roadmap feature is evaluated by whether it improves the signal-to-noise ratio of stored knowledge.

3. **Measure everything.** If we can't measure whether memory is getting better, we're guessing. Revision velocity, confidence trajectories, retrieval effectiveness, and contradiction rates are the vital signs.

4. **Operational simplicity scales.** Pure PostgreSQL, pluggable providers, external scheduling. Every architectural choice should make deployment easier, not harder. Complexity in the algorithm, simplicity in the infrastructure.

5. **Agents are individuals.** No two agents should have identical memory profiles. The system must support diverse specializations, learning rates, and knowledge domains without requiring per-agent engineering.

---

## How to Contribute

The roadmap is ambitious. We welcome contributions at every phase:

- **Phase 2** (current focus) requires both engineering and design thinking — memory lifecycle at scale, search quality, operational tooling
- **Phase 4+** is exploratory — research prototypes, design proposals, and experiments are as valuable as code

Start with issues labeled [`good first issue`](https://github.com/salishforge/memforge/issues?q=is%3Aopen+label%3A%22good+first+issue%22). See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
