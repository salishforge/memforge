# MemForge — Competitive Analysis & Next-Gen Recommendations

**Generated:** 2026-07-27
**Basis:** MemForge `main` @ v3.0.0-beta.3 (README, Known Limitations) + external research on the
2026 agent-memory landscape.
**Status:** Draft for maintainer review. Not yet reconciled against `ROADMAP.md` or open issues —
see "Reconciliation Required" below.

---

## How to use this document

Work blocks (`WB-xx`) are self-contained and designed for autonomous pickup. Each carries a
priority, rationale, acceptance criteria, likely files, and dependencies. Execute in priority
order; P0 blocks gate public advertising of the project and should land before any outreach,
PR to a third-party repo, or Show HN retry.

**Reconciliation required before execution:** this analysis was produced without access to
`ROADMAP.md` or the open issue list. First action for Claude Code:

```
1. Read ROADMAP.md, BACKLOG.md, and `gh issue list --state open`
2. Map each WB below to an existing issue where one exists; open new issues where none does
3. Flag any WB that duplicates or contradicts committed roadmap scope
```

---

## Executive summary

**Verdict: not superseded — but the headline benchmark claim is a live credibility risk that
must be fixed before anything else.**

Three findings drive everything below.

1. **The benchmark claim has been relabelled (2026-07-27).** MemForge now reports `93.2% retrieval R@5` on LongMemEval-S, explicitly distinguished from QA accuracy. LongMemEval's official metric is end-to-end QA accuracy (retrieve → generate → GPT-4o judge); retrieval R@5 is a sub-metric typically 20–30 points higher. This relabelling converts a credibility liability into an asset — the keyword-mode correction from 88% to 35% already demonstrated willingness to publish unfavourable numbers.

2. **The core differentiator has a well-funded competitor with better evidence.** Letta ships
   "sleep-time compute" — asynchronous sleep-time agents that reflect on raw context during idle
   periods to derive learned context. Same thesis as sleep cycles, from the MemGPT lineage at
   UC Berkeley, with a research paper and downstream task measurements (a SWE-repair case study
   reporting ~3,000 fewer tokens and better repair plans). MemForge's sleep cycle is
   architecturally richer — 10 phases against Letta's memory-block rewriting — but Letta has
   published evidence of *payoff* and MemForge has not.

3. **MemForge's own benchmark cannot see its own differentiator.** LongMemEval R@5 measures
   retrieval quality at a point in time. Revision, weight adaptation, meta-reflection, schema
   crystallization, and gap analysis are all invisible to it. A skeptic can currently say the
   93.2% comes from competent hybrid RRF and the sleep cycle is unproven machinery. That
   argument cannot be refuted with current evidence.

**Strategic conclusion:** continue the project, but stop competing on feature breadth. The
README lists ~25 features; that reads as a project that hasn't chosen. Narrow to one claim —
*memory that measurably improves over time* — and build the evidence that no competitor
currently has.

---

## Competitive landscape

### Tier 1 — Direct architectural competitors

| System | Backing | Approach | Evidence | Gap vs MemForge |
|---|---|---|---|---|
| **Letta** (MemGPT) | UC Berkeley Sky Lab, well funded, ~13K stars | Sleep-time agents rewrite shared memory blocks asynchronously; MemFS, git-tracked context, skill learning | Research paper; SWE-repair token/quality deltas | **Ahead on evidence, behind on depth.** Memory blocks are character-limited context sections, not a tiered store with a graph |
| **Zep / Graphiti** | Commercial; Graphiti ~20K stars, ~25K weekly PyPI | Bi-temporal knowledge graph; every fact carries `valid_at`/`invalid_at`; supersession is automatic | Peer-reviewed: DMR 94.8% vs MemGPT 93.4%; LongMemEval 63.8% (accuracy, GPT-4o) vs Mem0 49.0% | **Ahead on temporal modelling.** MemForge has temporal chains and decay but no bi-temporal fact validity |
| **Mem0** | YC + $24M (Basis Set, Peak XV, GitHub Fund); ~58K stars, AWS Agent SDK distribution | Two-phase pipeline: LLM extraction, then conflict detection + graph update. Vector + optional KG | Claims LoCoMo 92.5, LongMemEval 94.4 at ~6.9K tokens/query. **Independent reproduction on LoCoMo lands 58–66%** | **Ahead on distribution by two orders of magnitude.** Behind on active improvement — extraction happens at write, then stops |
| **Hindsight** (Vectorize) | Commercial; bundled in Hermes | Five-level hierarchy, entity resolution, `reflect` synthesis | Published paper; BEAM results at 10M-token scale | **Closest Hermes-bundled analogue.** Documented gaps: no forgetting, no bi-temporal, no supersession — MemForge has forgetting (cold-tier eviction) and supersession |

### Tier 2 — Hermes-bundled providers

| Provider | Position | Threat level |
|---|---|---|
| **Honcho** | Dialectic *user* modelling, peer/observation architecture | Low — orthogonal category. Models the person, not the knowledge |
| **Holographic** | Local SQLite, zero dependencies, HRR algebra, trust scoring | **High despite weakness.** Costs nothing to try. Friction beats features in provider selection |
| **Supermemory** | Context fencing, session graph ingest, multi-container | Medium |
| **OpenViking** | ByteDance/Volcengine; tiered L0/L1/L2 context loading | Medium — big-corp backing |
| **RetainDB / ByteRover / Memori** | Narrow commercial offerings | Low |

### Benchmark landscape (2026)

- **LoCoMo** — ~35 sessions. Saturating; scores in the 90s. Low signal.
- **LongMemEval** — ~500 sessions in the `_M` variant. Official metric is QA accuracy.
  Oracle GPT-4o reference is ~82.4%. Approaching saturation.
- **BEAM** — 1M and 10M token scales, explicitly designed so no current architecture saturates
  it. Reported scores sit in the ~48–64 range. **This is where credibility is now earned.**

**Community norm now forming:** treat every self-reported memory benchmark as an upper bound;
label retrieval metrics distinctly from accuracy metrics; publish reproduction scripts.

### Field vocabulary

*Memory in the Age of AI Agents* (arXiv:2512.13564) is now the reference taxonomy — memory
organised by **forms** (token / parametric / latent), **functions** (factual / experiential /
working), and **dynamics** (formation / evolution / retrieval). Named frontiers: memory
automation, RL integration, multimodal, multi-agent shared memory, trustworthiness.

MemForge sits in: token-form, factual + experiential function, with unusually strong coverage of
the *evolution* dynamic — which is precisely the axis most competitors under-serve.

---

## P0 — Credibility (blocks all outreach)

### WB-01 — Relabel all benchmark claims ✅ COMPLETED (2026-07-27)

**Priority:** P0. Nothing else ships until this does.

**Status:** Complete. All benchmark claims now explicitly labelled as retrieval R@5, not QA accuracy.

**Acceptance criteria:**
- [x] README status line and badge distinguish retrieval recall from QA accuracy — `LongMemEval-S retrieval R@5 93.2% hybrid`
- [x] `benchmarks/RESULTS.md` opens with explicit note distinguishing retrieval from QA accuracy
- [x] `benchmarks/README.md` baseline table restated with metric type column
- [x] `CHANGELOG.md` entry documents the relabelling and reason
- [x] `PHASE_5_PLAN.md` and `NEXTGEN-RECOMMENDATIONS.md` references updated

**Files:** `README.md`, `benchmarks/RESULTS.md`, `benchmarks/README.md`, `CHANGELOG.md`

**Dependencies:** none. Done first.

---

### WB-02 — Implement end-to-end QA accuracy harness

**Priority:** P0

**Rationale:** WB-01 removes a bad number. This supplies a good one. Without a QA-accuracy
figure MemForge cannot be compared to anything on the leaderboard, which means it is invisible
in every roundup post that matters.

**Acceptance criteria:**
- [ ] Harness runs the full LongMemEval pipeline: retrieve → generate answer → LLM judge
- [ ] Judge is `gpt-4o-2024-08-06` per the paper's protocol (>97% human agreement)
- [ ] Reports per-category accuracy alongside existing per-category recall
- [ ] Reports tokens-per-retrieval-call — the field now expects accuracy paired with token cost
- [ ] Reproduction script committed and documented so third parties can verify
- [ ] Results published in `benchmarks/RESULTS.md` with reader model and judge version stated

**Files:** `benchmarks/`, new harness module

**Dependencies:** WB-01 (relabel before adding new numbers alongside old ones)

**Notes:** Expect the accuracy number to land materially below 93.2%. Publish it anyway. An
honest 80-something next to a labelled 93.2% recall is far stronger than an unqualified 93.2%.

---

### WB-03 — Fix single-session-preference retrieval

**Priority:** P0

**Rationale:** Weakest category at 80.0% R@5 against 100% for single-session-assistant. Preference
recall is the single most user-visible memory function in an assistant context — it is what
Hermes users will judge the integration on within the first hour.

**Acceptance criteria:**
- [ ] Root cause identified and documented (hypotheses: preference statements are short and lose
      to longer chunks under RRF; preference language lacks distinctive keyword anchors;
      `KEYWORD_OVERLAP_BOOST=0.3` may be miscalibrated for short spans)
- [ ] Category R@5 ≥ 90% without regressing other categories by more than 1 point
- [ ] Regression test added covering preference-type queries

**Files:** `src/` retrieval path, `src/memory-manager.ts`

**Dependencies:** none

---

## P1 — Prove the differentiator

### WB-04 — Longitudinal memory quality benchmark ★ flagship

**Priority:** P1. This is the highest-leverage work in the document.

**Rationale:** No system in this field measures whether stored memory *improves*. Every published
benchmark is a point-in-time retrieval or QA measurement. MemForge already has the instruments —
revision stability, retrieval correlation, contradiction rate — exposed via `/health`. Building
the benchmark that measures longitudinal improvement is a category-defining move that costs
engineering time rather than funding, and it is the one axis where MemForge is structurally
positioned to win.

**Acceptance criteria:**
- [ ] Benchmark harness ingests a corpus, then measures at checkpoints (session 1, 10, 25, 50):
      - retrieval accuracy on a held-out query set
      - contradiction rate
      - revision stability
      - cold-tier eviction precision (were evicted memories genuinely low-value?)
- [ ] Runs in two arms: sleep cycles **enabled** vs **disabled**, identical corpus and queries
- [ ] Reports the delta — this is the headline artifact
- [ ] Methodology documented to a standard that permits third-party reproduction
- [ ] Harness is provider-agnostic where feasible, so Mem0 / Zep / Letta / Hindsight can be run
      through it

**Files:** `benchmarks/longitudinal/`, `src/` health metrics export

**Dependencies:** WB-02 (reuse harness scaffolding), WB-05

**Notes:** Two outcomes, both valuable. If sleep cycles show a measurable lift, MemForge has the
only evidence of its kind in the field and a defensible thesis. If they don't, that is a more
important finding than any feature — and it should be published too. **Design the eval so a null
result is publishable.** Guard against the known caveat from the sleep-time compute literature:
offline compute helps most when future queries are somewhat predictable from existing context.
Include an arm with unpredictable/off-distribution queries to characterise where the benefit
does and does not hold.

---

### WB-05 — Instrument sleep cycle with before/after deltas

**Priority:** P1

**Rationale:** Prerequisite for WB-04 and independently valuable operationally. Currently a sleep
cycle reports what it did, not whether it helped.

**Acceptance criteria:**
- [ ] Each sleep cycle records a before/after snapshot against a fixed probe query set
- [ ] Per-phase attribution: which phases moved which metrics
- [ ] Exposed via `/memory/:agentId/health` and Prometheus `/metrics`
- [ ] Phases that consistently fail to improve metrics are flagged in logs — this is the input to
      any future auto-tuning of phase scheduling

**Files:** `src/` sleep cycle module, metrics export

**Dependencies:** none

---

### WB-06 — Run BEAM at 1M and 10M scales

**Priority:** P1

**Rationale:** LoCoMo and LongMemEval are saturating. BEAM is explicitly constructed so nothing
saturates it, which makes it the benchmark where a new entrant can still demonstrate something.
It also stresses exactly the dimension MemForge's tiered architecture is designed for — volume
far beyond what fits in context.

**Acceptance criteria:**
- [ ] BEAM-1M results published with token cost
- [ ] BEAM-10M results published with token cost
- [ ] Failure modes at 10M documented honestly (expect hot-tier backlog issues — see issue #11,
      streaming consolidation)

**Files:** `benchmarks/beam/`

**Dependencies:** WB-02; likely blocked in practice by streaming consolidation (#11), since
`10M` tokens will exercise the documented "no streaming consolidation" limitation

---

## P2 — Close gaps found in competitors

### WB-07 — Bi-temporal fact validity

**Priority:** P2. Highest-value architectural borrow.

**Source:** Zep / Graphiti

**Rationale:** Zep attaches `valid_at` / `invalid_at` windows to every fact, so superseded
information is automatically excluded from retrieval rather than left to confuse it. MemForge has
temporal chains, decay scoring, and supersession in active ingest, but not first-class fact
validity windows. This is the main architectural reason Zep outperforms vector-first systems on
knowledge-update queries — a category where MemForge currently scores 97.4%, so the risk is
regression at scale rather than current weakness.

**Acceptance criteria:**
- [ ] `valid_from` / `valid_until` columns on warm-tier facts, with migration
- [ ] Retrieval excludes invalidated facts by default; opt-in flag to include for audit
- [ ] Sleep cycle Phase 2.5 (conflict resolution) sets invalidity rather than only scoring
- [ ] Knowledge-update category on LongMemEval holds or improves

**Files:** `schema/`, new migration, `src/memory-manager.ts`, retrieval path

---

### WB-08 — Context fencing (probable live bug)

**Priority:** P2, but investigate immediately — this may be a defect, not a feature.

**Source:** Supermemory

**Rationale:** Supermemory explicitly strips recalled memories from captured turns to prevent
recursive memory pollution. MemForge surfaces memories into agent context via `/active-recall`
and `/resume`, and ingests agent turns via `/add`. If a turn containing injected memories is
re-ingested, MemForge amplifies its own output — inflating retrieval counts, which feeds
confidence graduation, which strengthens memories on the basis of self-citation. This would
corrupt the outcome-feedback loop silently.

**Acceptance criteria:**
- [ ] Determine whether this occurs today — write a test that recalls, re-ingests, and checks for
      duplicate/derived storage
- [ ] If present: tag injected content and strip it at ingest
- [ ] If present: audit whether historical retrieval counts and confidence scores were affected
- [ ] Regression test committed

**Files:** ingest path, `/active-recall`, `/resume`, dedup module

---

### WB-09 — Pre-compression extraction hook

**Priority:** P2

**Source:** ByteRover; also Hermes' `on_pre_compress` provider hook

**Rationale:** Long agent sessions compress context and discard material. The highest-value
insights in a session are frequently in the part about to be thrown away. A hook that captures
before compression is cheap and catches material nothing else will.

**Acceptance criteria:**
- [ ] `POST /memory/:agentId/pre-compress` accepting messages about to be discarded
- [ ] Extraction prioritises decisions, corrections, and conventions over narrative
- [ ] Exposed in TS SDK, Python SDK, and MCP tools
- [ ] Maps cleanly to the Hermes `on_pre_compress` hook (see WB-13)

---

### WB-10 — Tiered context loading

**Priority:** P2

**Source:** OpenViking (L0 ~100 tokens → L1 ~2K → L2 full)

**Rationale:** MemForge returns results; competitors return results *sized to a token budget*.
Agents pay for every token of injected context on every turn, so this is an ergonomics gap the
consumer feels continuously.

**Acceptance criteria:**
- [ ] `/query` and `/resume` accept a `tokenBudget` parameter
- [ ] Three detail tiers: abstract, summary, full
- [ ] Retrieval fills the budget by descending relevance, degrading detail rather than truncating
      results
- [ ] Documented in INTEGRATION.md

---

### WB-11 — Granular cost cadence controls

**Priority:** P2

**Source:** Honcho (`contextCadence`, `dialecticCadence`, `dialecticDepth` as orthogonal knobs)

**Rationale:** MemForge has a single `SLEEP_CYCLE_TOKEN_BUDGET`. Operators turn LLM features off
when they can't predict cost. Orthogonal knobs — how often, how deep, how many passes — let
people run the expensive phases at a cadence they trust instead of disabling them.

**Acceptance criteria:**
- [ ] Per-phase cadence configuration (e.g. revise every cycle, meta-reflect every 5th)
- [ ] Per-phase token budgets in addition to the global cap
- [ ] Cost estimate returned in the sleep-cycle response
- [ ] Documented defaults matching the existing recommended-cadence table

---

### WB-12 — Opt-in scheduler

**Priority:** P2

**Source:** Mem0's hands-off posture

**Rationale:** "No built-in scheduler" is currently framed as a design decision in Known
Limitations. The engineering reasoning is sound; the adoption cost is real. Every competitor
handles memory maintenance without the operator wiring cron. Ship the scheduler off by default
so the purist position remains available.

**Acceptance criteria:**
- [ ] `SLEEP_SCHEDULE` env var (cron expression), default unset
- [ ] Runs in-process, respecting the single-process constraint; documents the contention risk
- [ ] Skips if a cycle is already running (advisory lock already exists)
- [ ] Known Limitations updated to reflect opt-in availability

**Notes:** Interacts badly with the documented single-process limitation — a scheduled cycle will
block the event loop and stall retrieval for other clients. Document loudly, and recommend the
separate-instance pattern for anyone serving multiple platforms.

---

## P3 — Distribution

### WB-13 — Hermes memory provider plugin

**Priority:** P3

**Rationale:** Hermes ships nine bundled memory providers and only one can be active at a time.
Placement in that list is meaningful distribution. The Python SDK already exists, so the plugin
is a thin wrapper rather than a port.

**Acceptance criteria:**
- [ ] `plugins/hermes/` implementing the `MemoryProvider` ABC
- [ ] `is_available()` performs **no network calls** — check config presence only
- [ ] `sync_turn()` is non-blocking (daemon thread) — hard requirement in the Hermes contract
- [ ] All storage paths use the `hermes_home` kwarg for profile isolation
- [ ] Hooks mapped: `prefetch`→query, `sync_turn`→add, `on_session_end`→sleep,
      `on_pre_compress`→WB-09, `on_memory_write`→mirror MEMORY.md/USER.md
- [ ] `plugin.yaml`, `README.md`, config schema minimal (API URL + token only; everything else in
      a config file)
- [ ] Upstream PR opened

**Dependencies:** WB-01 (do not PR into a high-visibility repo carrying a mislabelled benchmark),
WB-09

---

### WB-14 — Emit procedures as portable skill files

**Priority:** P3

**Rationale:** MemForge extracts condition→action procedural rules. Hermes generates skills
natively and treats that as its headline feature; Letta ships skill learning. Competing with the
host on its own primitive is a losing position. Emitting procedures in the agentskills.io format
converts overlap into complementarity — MemForge becomes the thing that *feeds* the host's skill
system.

**Acceptance criteria:**
- [ ] `GET /memory/:agentId/procedures?format=skill` returns agentskills.io-compatible markdown
      with YAML frontmatter
- [ ] Provenance retained: which memories and reflections produced the rule
- [ ] Documented in INTEGRATION.md

---

### WB-15 — Reposition documentation against the field taxonomy

**Priority:** P3

**Rationale:** *Memory in the Age of AI Agents* (arXiv:2512.13564) is becoming the shared
vocabulary. Systems that describe themselves in the field's terms get categorised correctly in
surveys and roundups; systems that use bespoke language get omitted or mis-slotted.

**Acceptance criteria:**
- [ ] SPECIFICATION.md positions MemForge on forms / functions / dynamics
- [ ] README leads with the *evolution* dynamic as the differentiator, not the feature list
- [ ] Feature list reduced or moved below the fold — 25 bullets reads as unfocused

---

## Explicitly not recommended

- **Do not chase LoCoMo.** Saturating; scores in the 90s carry no signal.
- **Do not build a hosted SaaS.** Cannot out-distribute Mem0 or Zep; would consume the entire
  maintenance budget.
- **Do not add user modelling to compete with Honcho.** Different category. Integrate rather
  than duplicate.
- **Do not compare MemForge numbers against competitor numbers** until WB-02 produces a
  like-for-like metric. This is how projects lose credibility in this space.
- **Do not expand the feature surface.** The gap is evidence, not features.

---

## Suggested sequencing

```
Sprint 1 (credibility)     WB-01, WB-03, WB-08 investigation
Sprint 2 (measurement)     WB-02, WB-05
Sprint 3 (flagship)        WB-04
Sprint 4 (architecture)    WB-07, WB-09, WB-10
Sprint 5 (ergonomics)      WB-11, WB-12, WB-06
Sprint 6 (distribution)    WB-13, WB-14, WB-15
```

---

## Sources

Primary:
- Hermes Agent memory provider documentation, `hermes-agent.nousresearch.com/docs`
- MemForge README @ v3.0.0-beta.3
- LongMemEval, arXiv:2410.10813 (ICLR 2025)
- Zep: A Temporal Knowledge Graph Architecture for Agent Memory, arXiv:2501.13956
- Memory in the Age of AI Agents, arXiv:2512.13564
- Letta sleep-time compute — `letta.com/blog/sleep-time-compute`, `docs.letta.com`

Secondary — treat vendor-published benchmark numbers as upper bounds:
- Mem0 benchmark posts (self-reported; independent LoCoMo reproduction lands 58–66%)
- Community discussion on recall-vs-accuracy mislabelling (MemPalace discussion #747;
  agentmemory `benchmark/LONGMEMEVAL.md`)

**Confidence note:** competitor figures are drawn from vendor blogs and secondary roundups.
Star counts, funding, and scores move quickly and several sources disagree at the margins
(Mem0 star count ranges 41K–58K across sources published within three months). Verify anything
load-bearing before citing it publicly.
