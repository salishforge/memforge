# Phase 5: Autonomous Knowledge Architecture — Plan & Funding Brief

**Audience:** grant evaluators, prospective sponsors, and contributors evaluating
where additional investment would accelerate MemForge.

**Status:** Phases 1–4 are complete and shipped under v3.x. Phase 5 is the
research-shaped horizon: the system stops needing operator intervention for
memory management. This document scopes the work, estimates effort, calls out
destabilization risk, and — for funders — itemizes where money or GPU credits
go.

If you only read one section: **[§5 Funding Plan](#5-funding-plan)**.

---

## 1. What Phase 5 Delivers

Phases 1–4 gave MemForge the *machinery* of long-term memory: tiered storage,
sleep cycles, hybrid retrieval, cross-agent learning, drift detection,
selective forgetting, outcome- and reflection-driven revision. An operator
still tells the system *what categories exist*, *what counts as a principle*,
and *when to escalate*.

Phase 5 removes the operator from that loop. The system:

1. **Discovers its own structure** — clusters emerge from data, abstraction
   layers form bottom-up, the knowledge-graph schema evolves as new domains
   appear.
2. **Knows what it knows** — the agent can introspect on its own confidence,
   its own change history, and the boundary between competence and ignorance.
3. **Picks its own strategy** — given current memory health, the system
   chooses aggressive revision, gentle consolidation, or deep reflection
   without being told.

Six concrete deliverables, grouped:

| # | Deliverable | Category |
|---|---|---|
| 5.1 | Self-assessment API (confidence over topics, change history) | Metacognition |
| 5.2 | Epistemic humility (known-well vs known-poorly retrieval surface) | Metacognition |
| 5.3 | Hierarchical abstraction (events → reflections → principles → strategies) | Self-organization |
| 5.4 | Knowledge-graph schema evolution (entity & relationship type discovery) | Self-organization |
| 5.5 | Learning-strategy selection (auto-tune sleep-cycle behavior) | Metacognition |
| 5.6 | Emergent namespaces (cluster-driven partitioning) | Self-organization |

The recommended **build order** (§3) starts with the lowest-risk, highest-
leverage metacognition work and ends with the most disruptive self-organization
piece.

---

## 2. Effort Estimates (in AI development sessions)

We estimate in **AI sessions** (one focused Claude Code session ≈ 1.5–3 hours
of session time, including planning, implementation, tests, review). Human
calendar time depends on operator availability; we do not estimate that.

| Item | Effort (sessions) | Session-time (hrs) | Stage |
|---|---|---|---|
| 5.1 Self-assessment | 2–3 | 4–7 | Engineering |
| 5.2 Epistemic humility | 2–3 | 4–7 | Engineering + UX |
| 5.3 Hierarchical abstraction | 4–6 | 8–14 | Eng + LLM + eval |
| 5.4 Knowledge-graph evolution | 4–6 | 8–14 | Eng + LLM + eval |
| 5.5 Learning-strategy selection | 2–3 | 4–7 | Eng + tuning |
| 5.6 Emergent namespaces | 3–5 | 6–11 | Eng + clustering + LLM |
| **Total core build** | **17–26** | **34–60** | |
| Longitudinal evaluation harness | 4–6 | 8–14 | Eval infra |
| Benchmark expansion (per §6) | 2–4 | 4–8 | Eval |
| **Total with eval** | **23–36** | **46–82** | |

These are *implementation* estimates assuming the design is sound. Phase 5 is
research-shaped, so a non-trivial fraction of effort is **iteration** —
running, observing, tuning thresholds, redesigning prompts. Budget at least
20–30% slack for that.

---

## 3. Recommended Sequence & Why

```
┌─────────────────┐   ┌──────────────────┐   ┌──────────────────────┐
│ 5.1 Self-       │ → │ 5.2 Epistemic    │ → │ 5.3 Hierarchical     │
│     assessment  │   │     humility     │   │     abstraction      │
└─────────────────┘   └──────────────────┘   └──────────────────────┘
                                                        ↓
                              ┌──────────────────────┐  │
                              │ 5.4 KG evolution     │ ←┘
                              └──────────────────────┘
                                        ↓
                              ┌──────────────────────┐
                              │ 5.5 Learning-strategy│
                              │     selection        │
                              └──────────────────────┘
                                        ↓
                              ┌──────────────────────┐
                              │ 5.6 Emergent         │
                              │     namespaces       │
                              └──────────────────────┘
```

**Reasoning:**

- **5.1 first.** Self-assessment is read-only over existing tables (revision
  history, retrieval log, drift signals). No new mutation paths, no
  destabilization risk. It produces telemetry that every later phase consumes.
- **5.2 second.** Builds directly on 5.1. Surfaces the known/unknown boundary
  in retrieval — visible value to operators, still no schema churn.
- **5.3 third.** Hierarchical abstraction is the first phase that *writes new
  rows*. Doing it after metacognition lets us measure whether the abstractions
  are useful (5.1/5.2 give us the yardstick).
- **5.4 fourth.** Graph schema evolution is the riskiest write path: it
  proposes new entity types and relationship types. Doing it after 5.3 means
  abstraction layers exist to absorb the new structure.
- **5.5 fifth.** Learning-strategy selection orchestrates the sleep cycle. It
  needs a population of stable signals to choose from — those are produced by
  5.1–5.4.
- **5.6 last.** Emergent namespaces *renames partitions* — the most
  operator-visible, most disruptive change. It comes last so the rest of the
  system is stable.

---

## 4. Destabilization Risk by Item

Each item is rated on three axes — **schema risk** (does it change the
database shape?), **behavioral risk** (does retrieval/scoring change visibly?),
**LLM dependency** (does it require an LLM call to function?). Scale: 🟢 low /
🟡 medium / 🔴 high.

| Item | Schema | Behavioral | LLM-dep | Notes |
|---|---|---|---|---|
| 5.1 Self-assessment | 🟢 | 🟢 | 🟢 | Read-only views over existing data. Safe. |
| 5.2 Epistemic humility | 🟢 | 🟡 | 🟢 | Adds a `confidence_tier` field to retrieval results; existing clients ignore it. |
| 5.3 Hierarchical abstraction | 🟡 | 🟡 | 🔴 | New row type ("principle"). Synthesis is LLM-driven; bad prompts → bad principles. Mitigate with confidence floors and revision feedback. |
| 5.4 KG schema evolution | 🔴 | 🟡 | 🔴 | Proposes new entity/relationship types. Without bounds this drifts unboundedly. Require a quarantine state + operator approval gate. |
| 5.5 Learning-strategy selection | 🟢 | 🔴 | 🟢 | Doesn't change schema, but changes *which sleep phases run*. Bad selector = silent quality regression. Must be A/B-tested against the static policy. |
| 5.6 Emergent namespaces | 🔴 | 🔴 | 🔴 | Reassigns rows to new namespaces. Visible to operators, breaks namespace-scoped queries. Highest risk. |

### Cross-cutting risks (all items)

1. **LLM dependency.** Phase 5 features that require an LLM degrade
   gracefully when `LLM_PROVIDER=none` — they become no-ops, never silent
   approximations.
2. **Behavioral non-determinism.** LLM-driven synthesis means the same input
   can produce different abstractions across runs. Tests must assert *shape*
   (a principle was created, has citations, confidence ≥ floor), not *exact
   text*.
3. **Schema churn for downstream tools.** 5.4 and 5.6 touch fields that
   third-party SDK users depend on. Every schema evolution must ship behind a
   feature flag and a migration that's reversible.
4. **Operator surprise.** Self-organizing systems are spooky. Every Phase 5
   action (a new namespace, a new entity type, a new principle) must be
   queryable, attributable, and reversible. No silent reorganization.
5. **Backward compat.** Existing agents have months of warm-tier data with
   no abstraction layer, no tier classification, no emergent namespace.
   Phase 5 must work on cold-start data and never assume backfill.
6. **Test infrastructure.** Existing tests assume deterministic outputs.
   Phase 5 needs a *property-based* test layer + a *behavioral fixture*
   layer (gold-standard agents whose memory we can inspect over time).
7. **Benchmark regression.** LongMemEval R@5 is currently 93.2%. Any Phase 5
   change must not regress that. CI must gate on it.
8. **Evaluation gap.** Phase 5 introduces capabilities we don't yet have a
   benchmark for ("does the agent know what it doesn't know?"). Closing that
   gap is a deliverable, not an afterthought (§6).

---

## 5. Funding Plan

Phase 5 has four cost categories that benefit from grant funding or in-kind
GPU credits. Each is itemized below with the *unit of work*, the *unit cost
range* (April 2026 spot pricing), and *what we'd spend it on*. Token
estimates assume current published rates for the listed providers.

### 5.A GPU rental — embedding & clustering experiments

**What it pays for:**

1. **Embedding model fine-tuning.** Today MemForge ships with
   `bge-small-en-v1.5` (384-dim, MIT). For agents in specialized domains
   (legal, biomedical, code), a domain-tuned encoder lifts retrieval R@5 by
   3–8 points in published work. Fine-tuning runs need an A100/H100 for ~6–24
   hours per domain.
2. **Cluster labeling experiments (5.6 Emergent namespaces).** Choosing the
   right clustering algorithm + threshold combination requires sweeping over
   real agent corpora. Each sweep ≈ 200 GPU-hours including embedding
   recomputation across multiple model sizes.
3. **Hierarchical-abstraction encoder ablations (5.3).** Testing whether
   abstraction layers benefit from a separate encoder (sentence vs paragraph
   vs document granularity) requires training small reranker heads.

**Estimated budget:** **$3,000 – $8,000** in GPU rental over a 6-month
research cycle, *or* equivalent in cloud credits (AWS / GCP / Lambda Labs /
RunPod / Together / Modal).

| Task | GPU class | Hours | Spot cost (Apr 2026) |
|---|---|---|---|
| Domain encoder fine-tune (×2 domains) | A100 80GB | 24 ea = 48 | ~$120 |
| Encoder fine-tune evaluation suite | A100 40GB | 80 | ~$120 |
| Clustering sweep (HDBSCAN, K-means, Leiden) | A10/A100 40GB | 200 | ~$300 |
| Reranker head training (5.3) | A100 80GB | 60 | ~$150 |
| Stretch: 7B principle-synthesis model fine-tune | 4× A100 80GB | 48 | ~$700 |
| **Subtotal** | | | **~$1,400 base / $3K stretch** |

The wider $3–8K range covers iteration, failed runs, dataset prep storage,
and longer training runs for the stretch goal. Without GPU rental, Phase 5
ships with the off-the-shelf `bge-small-en-v1.5` encoder. That's *acceptable
but not optimal* — fine-tuning is a multiplier on every retrieval-quality
gain in 5.3 and 5.6.

### 5.B LLM token budget — synthesis, labeling, type proposal

Phase 5 calls an LLM at sleep-cycle time, on a per-agent basis. Token
volume scales with **(warm-tier rows) × (cycles per month) × (synthesis
density)**. Three tasks dominate the bill:

1. **Principle synthesis (5.3).** When ≥ N reflections cluster around a
   theme, an LLM is asked to propose a "principle" — a durable, abstract
   claim citing the constituent reflections. A typical synthesis call is
   ~3K input + ~500 output tokens.
2. **Cluster labeling (5.6).** Each emergent cluster gets a short LLM-
   generated label (the candidate namespace name). ~2K input + ~50 output.
3. **Type proposal (5.4).** When N entities accrue without matching any
   existing type, an LLM proposes a new entity/relationship type with
   examples and a definition. ~5K input + ~400 output.

**Per-agent monthly token budget (representative, "10K warm rows" agent):**

| Task | Calls/month | Tokens/call (in / out) | Monthly tokens |
|---|---|---|---|
| Principle synthesis (5.3) | ~30 | 3K / 500 | 105K |
| Cluster labeling (5.6) | ~10 | 2K / 50 | 20K |
| Type proposal (5.4) | ~5 | 5K / 400 | 27K |
| Strategy-selection meta-call (5.5) | ~30 | 1K / 100 | 33K |
| **Total / agent / month** | | | **~185K tokens** |

For development & evaluation we run ~10 synthetic agents continuously,
~6 months → **~11M tokens** for the dev cycle alone. At
**Claude Sonnet pricing** (~$3 in / $15 out per MTok) that's ~$60. At
**Claude Opus pricing** ($15 / $75) it's ~$300. At **GPT-4o-mini /
Gemini Flash** scale it's under $10. We will route deliberately:

- Ollama-local for cluster labeling (cheap, low-stakes)
- Gemini Flash / Sonnet for principle synthesis
- Opus / Gemini 2.5 Pro reserved for **type proposal** (one-shot, high-stakes)

**Estimated budget:** **$500 – $2,000** for the full Phase 5 dev & eval
cycle, depending on model-routing choices and how aggressively we run the
longitudinal harness (§5.C).

A grant in this category buys *coverage*: more synthetic agents, more
months of simulated time, more LLM-routing experiments, and the ability
to test against premium frontier models for the type-proposal step.

### 5.C Longitudinal evaluation infrastructure

Phase 5 deliverables only become visible over **months** of agent runtime.
A 1-day test cannot tell you whether emergent namespaces are stable or
whether principles drift. We need:

1. **A continuous synthetic-agent harness.** N agents, each ingesting a
   scripted lifelike workload (tickets, conversations, code reviews) on
   accelerated time. State checkpointed daily.
2. **Storage.** ~50–200 GB of checkpoint snapshots per 6-month run × 10
   agents ≈ 0.5–2 TB.
3. **Compute for sleep-cycle execution.** Sleep cycles are CPU-bound on the
   DB tier; at scale this needs ~2–4 vCPU + 16 GB instances running
   continuously.
4. **Visualization & drift dashboards.** Grafana + Prometheus, already in
   the stack — needs operator time to wire Phase 5 metrics in.

**Estimated budget:** **$300 – $1,500** in cloud compute & storage over 6
months. This is the smallest-dollar / highest-impact line item — without
the harness, the rest of Phase 5 cannot be evaluated empirically.

### 5.D Benchmark expansion

Existing benchmarks (LongMemEval) measure **retrieval recall**, not
**metacognition** or **emergent organization**. Phase 5 needs:

1. A **calibration benchmark** for self-assessment (does claimed confidence
   match measured accuracy?). Borrow methodology from Hendrycks et al.
   "Measuring Calibration in Deep Learning."
2. An **abstraction-quality benchmark** for 5.3 (do synthesized principles
   actually predict held-out facts?).
3. A **stability benchmark** for 5.6 (do emergent namespaces persist across
   runs, or drift each cycle?).
4. A **graph-evolution benchmark** for 5.4 (do proposed types match a
   gold-standard ontology when one exists?).

**Investment:** primarily session time (4–8 sessions, see §2) plus the
LLM tokens to *grade* the benchmarks (10–50× the synthesis budget for the
graded subset). Roughly **$200–600** in LLM costs. Open-sourcing the
benchmarks is part of the deliverable — this is a public good.

### Total funding ask

| Category | Low | High | What it buys |
|---|---|---|---|
| 5.A GPU rental | $3,000 | $8,000 | Domain encoders, clustering sweeps, principle-model training |
| 5.B LLM tokens | $500 | $2,000 | Sleep-cycle synthesis, type proposal, eval grading |
| 5.C Eval infrastructure | $300 | $1,500 | Continuous harness, storage, sleep-cycle compute |
| 5.D Benchmark expansion | $200 | $600 | Public-good metacog benchmarks |
| **Total** | **$4,000** | **$12,100** | |

**Honest framing:** MemForge has shipped Phases 1–4 with no external funding,
running on local hardware and a modest LLM-API spend. Phase 5 is the first
phase where additional capital materially changes the *quality ceiling*.
Below the low end of the range, Phase 5 ships with off-the-shelf encoders,
modest eval coverage, and limited longitudinal data. At the high end, we
ship with domain-tuned encoders, a public-good benchmark suite, and 6
months of continuous synthetic-agent telemetry — the kind of evidence base
that makes a system credible for high-stakes deployment.

**In-kind credits are accepted:** AWS Activate, GCP Research Credits, Lambda
Labs Research Program, RunPod Education, Together.ai Research, Modal Labs
Sponsorship, OpenAI Researcher Access, and Anthropic Researcher Access
have all historically supported open-source memory research and are good-fit
sponsors. We will publish utilization reports for any credit grants ≥ $1,000.

---

## 6. Open-Source Deliverables

Funded or not, Phase 5 ships:

- All six features under MIT license
- A public benchmark suite (5.D) with reproducible scripts
- A reference longitudinal harness (5.C) with synthetic workloads
- A 6-month evaluation report — what worked, what didn't, what we'd build
  differently — published as part of v4.0.0

Sponsor recognition: every release notes block, the README, and the
PHASE_5_REPORT.md will name funders and credit grantors. We do not seek
exclusivity. We do not commercialize the open-source core.

---

## 7. What Sponsors Get to See

We commit to:

1. **Monthly progress report** for any sponsor at $1,000+ — what we built,
   what we measured, what we spent.
2. **Public utilization tracking.** GPU hours used, tokens consumed, dollars
   burned, attributed to each Phase 5 item, in a `FUNDING.md` ledger updated
   per release.
3. **Failure post-mortems.** When a Phase 5 design fails (and some will), we
   publish the post-mortem. Sponsors fund *the work*, not *the outcome we
   wish we'd gotten*.
4. **Direct contact** with the maintainer (john@salishforge.com) for
   sponsors who want depth.

---

## 8. Frequently Asked

**Q: Is Phase 5 critical-path for using MemForge?**
No. Phases 1–4 are the production-grade product. Phase 5 is the research
horizon — it makes long-running agents *better*, not *possible*.

**Q: What's the minimum viable Phase 5?**
5.1 + 5.2 alone (Self-assessment + Epistemic humility) deliver visible value,
need no GPU budget, and can be built on the existing LLM-routing stack. They
are the sponsorable "starter" tranche — roughly 4–6 sessions of work, $50–200
in LLM tokens, no GPU rental needed. A grant of any size accelerates these
first.

**Q: Why estimate in AI sessions instead of human-weeks?**
Because the implementer is an AI agent under a model-routing budget. Session
counts are the natural unit of work. Calendar-time depends entirely on the
sponsoring operator's availability and the routing choices we make per
session.

**Q: What stops Phase 5 from regressing the 93.2% LongMemEval R@5 number?**
CI gates on it. Any Phase 5 PR that drops R@5 by more than 1 point is
blocked at merge time. Phase 5 is *additive* — emergent namespaces don't
replace existing ones, abstraction layers don't replace warm-tier rows, the
graph schema evolves but the core entity table is stable.

**Q: Why isn't this on the main ROADMAP.md?**
It is — as the Phase 5 section. This document expands that section with
effort, risk, and funding detail at a level grant evaluators need.
ROADMAP.md remains the high-level vision; this is the implementation brief.

---

## 9. How to Help

- **Sponsor:** see §5. Reach out at john@salishforge.com.
- **Contribute code:** Phase 5 work happens on tracking issues labeled
  `phase-5`. The 5.1 / 5.2 metacognition tranche is approachable for any
  contributor familiar with the existing sleep-cycle architecture.
- **Contribute eval data:** if you operate a long-running agent and would
  share anonymized warm-tier exports, we'd use them in the longitudinal
  harness (§5.C).
- **Contribute compute:** GPU credits in any quantity offset §5.A directly.

---

*Last updated: 2026-04-23. Version: v3.2.0 (Phases 1–4 shipped). For the
current code, see [CHANGELOG.md](CHANGELOG.md). For the high-level vision,
see [ROADMAP.md](ROADMAP.md).*
