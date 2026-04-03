# MemForge Roadmap

## The Long-Term Vision

AI agents today are stateless by default. Every conversation starts from zero. The few systems that add memory treat it as a passive store — save facts, retrieve facts, hope for the best.

This isn't how intelligence works.

Biological intelligence is built on memory that **evolves**. Memories strengthen through use, weaken through neglect, get rewritten as understanding deepens, and organize into increasingly abstract knowledge structures over time. A person who has worked in a field for 20 years doesn't just have more facts than a beginner — they have qualitatively different knowledge: intuitions, mental models, procedural fluency, and the ability to recognize what matters.

**MemForge exists to give AI agents that same trajectory.** Not agents that remember more, but agents that understand better — over months and years, across technology changes, through evolving requirements.

The goal is a constant set of evolving agents developed and refined over years, each accumulating genuine expertise in their domain, adapting as the world around them changes.

---

## Where We Are Today (v2.1.0)

MemForge has the foundation:

- **Tiered memory** with hot → warm → cold lifecycle
- **Sleep cycles** that score, triage, revise, and reflect on stored knowledge
- **Memory revision** where an LLM actively rewrites low-confidence memories
- **Knowledge graph** built from extracted entities and relationships
- **Procedural learning** that distills experience into condition→action rules
- **Outcome feedback** that closes the reinforcement loop
- **Meta-reflection** that synthesizes higher-order principles from patterns

This is enough to demonstrate the concept. It is not yet enough to run agents for years.

---

## Phase 1: Production Hardening (Q2-Q3 2026)

*Make MemForge reliable enough to trust with long-lived agents.*

### Testing & Quality

- **Mocked LLM test suite** — All LLM-dependent paths (consolidation, reflection, revision, procedural extraction) tested with deterministic mock providers ([#6](https://github.com/salishforge/memforge/issues/6))
- **HTTP API tests** — Full Express stack coverage including auth, rate limiting, error handling ([#7](https://github.com/salishforge/memforge/issues/7))
- **Load testing** — Validate performance at 100K+ warm-tier memories ([#8](https://github.com/salishforge/memforge/issues/8))

### Infrastructure

- **CI/CD pipeline** — Automated type-check, lint, and test on every PR ([#9](https://github.com/salishforge/memforge/issues/9))
- **npm publish** — Available as `@salishforge/memforge` for library consumers ([#10](https://github.com/salishforge/memforge/issues/10))
- **Structured logging** — JSON logs with request tracing for production debugging ([#19](https://github.com/salishforge/memforge/issues/19))

### Operational Reliability

- **Streaming consolidation** — Bounded memory usage regardless of backlog size ([#11](https://github.com/salishforge/memforge/issues/11))
- **Connection pool hardening** — Health checks, auto-scaling, graceful degradation ([#12](https://github.com/salishforge/memforge/issues/12))
- **Cold tier retention policies** — Configurable cleanup to prevent unbounded storage growth ([#20](https://github.com/salishforge/memforge/issues/20))

### Milestone

An agent running MemForge in production for 3+ months without manual intervention — memory growing, sleep cycles running, quality metrics stable or improving.

---

## Phase 2: Long-Term Memory at Scale (Q3-Q4 2026)

*Enable agents to accumulate months of experience without degradation.*

### Memory Lifecycle Management

- **Memory namespaces** — Partition memories by domain, project, or context so agents with broad responsibilities maintain focused retrieval ([#16](https://github.com/salishforge/memforge/issues/16))
- **Per-agent importance tuning** — Different agents need different memory profiles. A support agent should weight recency; a research agent should weight graph centrality ([#17](https://github.com/salishforge/memforge/issues/17))
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

## Phase 3: Cross-Agent Learning (2027)

*Agents don't exist in isolation. Enable knowledge sharing and collective intelligence.*

### Knowledge Transfer

- **Memory export/import** — Serialize an agent's knowledge (warm tier + graph + procedures) for backup, migration, or seeding new agents. A new agent can inherit the institutional knowledge of a veteran.
- **Shared knowledge graphs** — Multiple agents contribute to and query a shared entity/relationship graph while maintaining private episodic memories. The graph becomes organizational knowledge.
- **Procedure sharing** — Condition→action rules learned by one agent can be offered to other agents in the same organization, with confidence weighted by domain overlap.

### Agent Specialization

- **Role-aware memory** — Agents understand their own expertise boundaries. When queried outside their domain, they know they don't know (rather than hallucinating from thin knowledge).
- **Expertise discovery** — Given a question, route to the agent whose memory is most relevant. Memory becomes the basis for agent selection, not just agent behavior.

### Memory Provenance

- **Cross-agent citation** — When Agent B uses knowledge that originated from Agent A's experience, the provenance is tracked. This builds trust and enables debugging of bad knowledge propagation.
- **Confidence propagation** — Knowledge transferred between agents carries confidence metadata. Second-hand knowledge starts at lower confidence than direct experience.

### Milestone

A team of 3-5 specialized agents sharing knowledge, with demonstrably better collective performance than the same agents in isolation.

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

- **Phase 1** is mostly engineering — testing, CI/CD, operational hardening. Great for developers who want concrete, well-defined tasks.
- **Phase 2** requires both engineering and design thinking — how should memory lifecycle work at scale?
- **Phase 3+** is exploratory — research prototypes, design proposals, and experiments are as valuable as code.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines and [BACKLOG.md](BACKLOG.md) for current issues.
