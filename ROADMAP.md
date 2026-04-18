# MemForge Roadmap

## The Long-Term Vision

AI agents today are stateless by default. Every conversation starts from zero. The few systems that add memory treat it as a passive store — save facts, retrieve facts, hope for the best.

This isn't how intelligence works.

Biological intelligence is built on memory that **evolves**. Memories strengthen through use, weaken through neglect, get rewritten as understanding deepens, and organize into increasingly abstract knowledge structures over time. A person who has worked in a field for 20 years doesn't just have more facts than a beginner — they have qualitatively different knowledge: intuitions, mental models, procedural fluency, and the ability to recognize what matters.

**MemForge exists to give AI agents that same trajectory.** Not agents that remember more, but agents that understand better — over months and years, across technology changes, through evolving requirements.

The goal is a constant set of evolving agents developed and refined over years, each accumulating genuine expertise in their domain, adapting as the world around them changes.

---

## Where We Are Today (v3.0.0-beta.3)

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
- CI/CD pipeline with 6 jobs (Node 20+22) — all green
- Mocked LLM test suite, HTTP API tests, load tests, security tests
- Structured JSON logging with request correlation IDs (pino)
- Connection pool hardening with health checks, timeouts, auto-scaling
- npm package configured as `@salishforge/memforge` ([#10](https://github.com/salishforge/memforge/issues/10) — publish pending)

### Remaining

- **Streaming consolidation** — cursor-based processing for 10K+ event backlogs ([#11](https://github.com/salishforge/memforge/issues/11))
- **Cold tier retention policies** — configurable cleanup ([#20](https://github.com/salishforge/memforge/issues/20))
- **npm publish** — publish to npm registry ([#10](https://github.com/salishforge/memforge/issues/10))

---

## Phase 2: Long-Term Memory at Scale (Q3-Q4 2026)

*Enable agents to accumulate months of experience without degradation.*

### Memory Lifecycle Management

- **Memory namespaces** — Partition memories by domain, project, or context so agents with broad responsibilities maintain focused retrieval ([#16](https://github.com/salishforge/memforge/issues/16)) — *in progress: backend (schema + MemoryManager + tests) in PR #TBD; HTTP/MCP/SDK/OpenAPI surface in follow-up (C.2)*
- **Per-agent importance tuning** — Different agents need different memory profiles. A support agent should weight recency; a research agent should weight graph centrality ([#17](https://github.com/salishforge/memforge/issues/17)) — ✅ DONE: shipped in v2.4 migration (#57) — `agents.scoring_weights` JSONB column wired into sleep cycle phase 1
- **Cold tier search and restoration** — Query archived memories and selectively restore them when context shifts back to old topics ([#14](https://github.com/salishforge/memforge/issues/14))

### Intelligent Resource Management

- **Multi-model revision strategy** — Cheap local models for routine sleep cycle maintenance, capable cloud models for high-stakes revisions. Reduce costs 60-80% while maintaining quality where it matters ([#13](https://github.com/salishforge/memforge/issues/13))
- **Adaptive sleep scheduling** — Automatically trigger sleep cycles based on memory health metrics rather than fixed schedules. If contradiction rate is rising, sleep more. If knowledge is stable, sleep less.
- **Memory budgeting** — Hard limits on warm-tier size per agent with intelligent eviction. When an agent reaches capacity, the lowest-value memories are archived, not the oldest.

### Quality Metrics Dashboard

- **Longitudinal quality tracking** — Plot importance, confidence, revision velocity, and retrieval effectiveness over weeks and months. Detect degradation before it affects the agent.
- **A/B testing for revision strategies** — Compare revision outcomes across different LLM models, prompt strategies, and sleep cycle configurations.

### Milestone

An agent with 6+ months of accumulated memory, warm tier at 50K+ entries, demonstrably better retrieval quality than month 1.

---

## Phase 3: Cross-Agent Learning — COMPLETE

*Agents don't exist in isolation. Enable knowledge sharing and collective intelligence.*

All Phase 3 core items are implemented:
- **Memory export/import** — JSONL export/import for backup, migration, seeding
- **Shared memory pools** — hierarchical team/global pools with publish/subscribe
- **Provenance chains** — source_chain tracking across agent hops
- **Hearsay discounting** — confidence × (0.8^hop_count) × agent_reputation
- **Per-domain reputation** — earned through corroboration/contradiction signals
- **Pool sleep cycles** — deduplication, conflict resolution, corroboration promotion
- **Cross-agent conflict detection** — private vs shared memory contradiction flagging

### Remaining

- **Procedure sharing** — condition→action rules offered across agents
- **Expertise discovery** — route questions to the most relevant agent's memory
- **Role-aware memory** — agents track their own expertise boundaries

---

## Phase 4: Continuous Adaptation (2027-2028)

*Agents that adapt to changing technology, evolving requirements, and shifting contexts — without forgetting what still matters.*

### Technology Adaptation

- **Model-agnostic revision** — As new LLMs emerge, MemForge should seamlessly adopt them for consolidation and revision. The memory layer outlives any specific model generation.
- **Embedding migration** — When switching embedding providers (e.g., upgrading from text-embedding-3-small to a future model), incrementally re-embed warm tier memories during sleep cycles rather than requiring a full rebuild.
- **Schema evolution** — Database migrations that run during sleep cycles, not as manual operations. The system adapts its own storage as capabilities grow.

### Contextual Adaptation

- **Drift detection** — Detect when the agent's environment has changed (new APIs, reorganized teams, deprecated systems) from patterns in memory contradictions and revision types. Surface drift to operators before it causes failures.
- **Selective forgetting** — Not all knowledge should persist forever. When an agent's domain shifts, actively deprecate knowledge from the old domain rather than letting it pollute retrieval. Controlled forgetting is as important as remembering.
- **Temporal knowledge management** — Understand that "the API endpoint is /v2/users" was true in 2026 but may not be true in 2028. Temporal annotations on knowledge enable the system to flag potentially stale facts.

### Self-Improvement Loops

- **Outcome-driven revision priorities** — Memories linked to negative outcomes should be revised first. The system learns from its mistakes, not just from its gaps.
- **Reflection-driven sleep scheduling** — When meta-reflections identify blind spots or recurring contradictions, automatically increase sleep cycle attention to those knowledge areas.
- **Procedural evolution** — Condition→action rules should have their own lifecycle: strengthened when they lead to good outcomes, revised when contexts change, deprecated when they become irrelevant.

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
