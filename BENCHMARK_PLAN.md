# MemForge Comprehensive Benchmark Plan

**Generated:** 2026-07-27  
**Status:** Phase 1 (P0) credibility fixes complete, QA harness implemented, ready for execution  
**Owner:** AI Agent (Claude Code or similar)  
**Next Action:** Execute smoke test, then full QA accuracy benchmark run

---

## Executive Summary

This document provides complete instructions for running MemForge's comprehensive benchmark suite. The benchmark strategy addresses credibility issues identified in competitive analysis and positions MemForge for fair comparison with competitors (Mem0, Zep, Letta, Hindsight).

**Key insight:** The field is moving toward **honest, multi-dimensional benchmarking** — not just retrieval quality, but longitudinal improvement, scale performance, and end-to-end QA accuracy.

---

## Strategic Objectives

### Primary Goal
Establish MemForge's unique differentiator: **memory that measurably improves over time**

### Secondary Goals
1. Fix credibility gap (retrieval R@5 vs QA accuracy confusion)
2. Publish end-to-end QA accuracy (entry ticket to leaderboard comparisons)
3. Demonstrate longitudinal improvement (category-defining benchmark)
4. Show scale performance at 1M/10M tokens (BEAM benchmark)

---

## Benchmark Suite Overview

| Benchmark | What it measures | Metric | Status | Priority |
|-----------|-----------------|--------|--------|----------|
| **LongMemEval QA Accuracy** | End-to-end QA (retrieve → generate → judge) | Accuracy % | ✅ Implemented | P0 |
| **LongMemEval Retrieval R@5** | Retrieval recall at k=5 | Recall % | ✅ Existing | P0 |
| **Longitudinal Quality** | Memory improvement over time | Delta (sleep on vs off) | ⏳ Planned | P1 |
| **BEAM 1M/10M** | Scale performance | Score @ token scale | ⏳ Planned | P1 |

---

## Phase 1: Credibility Fixes (P0 — COMPLETE ✅)

### WB-01: Benchmark Relabelling ✅

**Status:** Complete (2026-07-27)

All benchmark claims now explicitly distinguish **retrieval R@5** from **QA accuracy**.

**Files modified:**
- `README.md` — Badge: "LongMemEval-S retrieval R@5 93.2% hybrid"
- `benchmarks/RESULTS.md` — Disclaimer added, baseline table updated
- `benchmarks/README.md` — Metric type column added
- `CHANGELOG.md` — Relabelling documented
- `NEXTGEN-RECOMMENDATIONS.md` — WB-01 marked complete

**Key change:** 93.2% is now clearly labelled as retrieval Recall@5, not QA accuracy (which is typically 20–30 points lower).

---

## Phase 2: QA Accuracy Harness (P0 — IMPLEMENTED ⚠️)

### WB-02: LongMemEval QA Accuracy Benchmark

**Status:** Implementation complete, requires testing

**Files created:**
- `benchmarks/longmemeval-qa/evaluate.ts` — Core evaluator
- `benchmarks/longmemeval-qa/run.ts` — Orchestrator
- `benchmarks/longmemeval-qa/types.ts` — TypeScript types
- `benchmarks/longmemeval-qa/ingest.ts` — Ingest helper
- `benchmarks/longmemeval-qa/README.md` — Documentation

**What it does:**
1. Retrieves context from MemForge
2. Generates answer using LLM reader
3. Judges correctness using LLM judge (GPT-4o per paper protocol)
4. Reports accuracy, average score, tokens/retrieval, latency

**Usage:**
```bash
# Smoke test (10 questions, ~$1-2 with OpenAI)
OPENAI_API_KEY=sk-... BENCHMARK_LIMIT=10 npm run benchmark:longmemeval-qa

# Full run (500 questions, ~$50-100 with OpenAI)
OPENAI_API_KEY=sk-... npm run benchmark:longmemeval-qa
```

**Output:**
- `benchmarks/longmemeval-qa/results/qa-report-*.md` — Markdown report
- `benchmarks/longmemeval-qa/results/qa-results-*.json` — Raw JSON

---

## Setup Instructions (Different Machine)

### Step 1: Clone Repository

```bash
git clone https://github.com/salishforge/memforge.git
cd memforge
```

### Step 2: Install Prerequisites

#### Node.js 22+
```bash
# Download from https://nodejs.org
# Or use nvm (Linux/Mac): nvm install 22 && nvm use 22
node --version  # Should show v22.x.x
```

#### PostgreSQL 16+ with pgvector

**Option A: Docker (recommended)**
```bash
docker run -d --name memforge-postgres \
  -e POSTGRES_PASSWORD=memforge123 \
  -e POSTGRES_DB=memforge \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

**Option B: Native install**
1. Install PostgreSQL 16 from [postgresql.org](https://www.postgresql.org)
2. Install pgvector:
   ```sql
   -- In psql:
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Configure Environment

Create `.env` file:
```bash
DATABASE_URL=postgresql://postgres:memforge123@localhost:5432/memforge
MEMFORGE_TOKEN=your-secure-token-here
OPENAI_API_KEY=sk-...  # Required for QA benchmark with OpenAI

# Optional: Use Ollama instead (free, local)
# QA_JUDGE_MODEL=qwen3.5:cloud
# QA_READER_MODEL=qwen3.5:cloud
# OLLAMA_BASE_URL=http://localhost:11434
```

### Step 5: Initialize Database

```bash
psql "$DATABASE_URL" -f schema/schema.sql
```

### Step 6: Start MemForge Server

```bash
npm run dev
```

Keep this running in background or separate terminal.

### Step 7: Download Dataset

```bash
npm run benchmark:download
```

### Step 8: Run Smoke Test

```bash
# 10 questions, verify everything works
$env:BENCHMARK_LIMIT=10  # PowerShell
# or: export BENCHMARK_LIMIT=10  # Bash

npm run benchmark:longmemeval-qa
```

**Expected output:**
```
=== LongMemEval QA Accuracy Benchmark ===

=== LongMemEval QA Accuracy Evaluation ===
MemForge URL: http://localhost:3333
Judge model: gpt-4o-2024-08-06
Reader model: gpt-4o-2024-08-06
Mode: hybrid
Limit: 10

Ingesting sessions...
Ingestion complete.

Consolidating...
Consolidation complete (XXXXms).

Evaluating questions...
Q1 [knowledge-update] ✓ (85%)
Q2 [multi-session] ✗ (45%)
...
Q10 [temporal-reasoning] ✓ (92%)

=== Evaluation Complete ===

Results: 7/10 correct (70.0%)
Average score: 68.5%
```

### Step 9: Run Full Benchmark (Optional)

```bash
# 500 questions, ~$50-100 with OpenAI
npm run benchmark:longmemeval-qa
```

**Note:** This takes several hours. Results are saved incrementally every 10 questions.

---

## Default: Ollama (Free, Local)

The QA harness judges and generates with Ollama by default — no API key, no
per-run cost. `qwen3.5:cloud` is the default for both roles.

To use OpenAI instead (required before publishing — see comparability note
below):

```bash
export QA_API_BASE=https://api.openai.com/v1
export OPENAI_API_KEY=sk-...
export QA_JUDGE_MODEL=gpt-4o-2024-08-06
export QA_READER_MODEL=gpt-4o-2024-08-06
npm run benchmark:longmemeval-qa
```

### Ollama setup

### Install Ollama
```bash
# Windows/Mac: Download from https://ollama.ai
# Linux: curl -fsSL https://ollama.ai/install.sh | sh
```

### Pull Model
```bash
ollama pull qwen3.5:cloud
# or: ollama pull qwen3.5:397b-cloud  # if available
```

### Run Benchmark with Ollama (default — no configuration needed)
```bash
npm run benchmark:longmemeval-qa            # 500 questions
BENCHMARK_LIMIT=10 npm run benchmark:longmemeval-qa   # smoke test
```

Override only if your setup differs from the defaults:

| Variable | Default | Purpose |
|----------|---------|---------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama host root (no `/v1`) |
| `QA_JUDGE_MODEL` | `qwen3.5:cloud` | Judge |
| `QA_READER_MODEL` | `qwen3.5:cloud` | Reader/generator |
| `QA_API_BASE` | `$OLLAMA_BASE_URL/v1` | Full OpenAI-compatible endpoint |
| `QA_API_KEY` | `$OPENAI_API_KEY` | Sent as Bearer when set; Ollama ignores it |
| `QA_TIMEOUT_MS` | `180000` | Per-request timeout |

**Trade-offs:**
- ✅ Free, no API costs
- ✅ Private, runs locally
- ❌ **Results not comparable to published LongMemEval numbers** — the paper's
  protocol judges with GPT-4o (>97% human agreement). A different judge scores
  differently, so these numbers are valid only for tracking MemForge against
  itself.
- ❌ May be slower depending on hardware

This is enforced, not just documented: the runner prints a warning when the
judge is not `gpt-4o*`, the generated report replaces the comparability claim
with an explicit "not comparable" notice, and every saved manifest records
`judgeModel` and `paperProtocolJudge` so a number cannot be quoted later
without the judge that produced it.

**Recommendation:** Use Ollama for development/testing, OpenAI for final publishable results.

---

## Cost Estimates

| Scenario | Questions | Judge | Reader | Estimated Cost |
|----------|-----------|-------|--------|----------------|
| Smoke test | 10 | GPT-4o | GPT-4o | ~$1–2 |
| Full run | 500 | GPT-4o | GPT-4o | ~$50–100 |
| Ollama (local) | Any | qwen3.5:cloud | qwen3.5:cloud | $0 (electricity only) |
| Together AI | 500 | Qwen-72B | Qwen-72B | ~$2–5 |

---

## Remaining Work Blocks

### WB-03: Fix Single-Session-Preference Retrieval

**Priority:** P0  
**Status:** Not started  
**Effort:** 2–3 AI sessions

**Problem:** Weakest category at 80.0% R@5 (vs 100% for single-session-assistant)

**Hypotheses:**
1. Preference statements are short and lose to longer chunks under RRF
2. Preference language lacks distinctive keyword anchors
3. `KEYWORD_OVERLAP_BOOST=0.3` may be miscalibrated for short spans

**Acceptance criteria:**
- Category R@5 ≥ 90% without regressing other categories by >1 point
- Regression test added

**Files to modify:** `src/memory-manager.ts`, `src/config.ts`

---

### WB-04: Longitudinal Memory Quality Benchmark

**Priority:** P1 (flagship)  
**Status:** Not started  
**Effort:** 4–6 AI sessions

**Goal:** Build benchmark that measures whether memory *improves* over time

**What it does:**
1. Ingest corpus over time (sessions 1, 10, 25, 50)
2. Measure at checkpoints:
   - Retrieval accuracy on held-out query set
   - Contradiction rate
   - Revision stability
   - Cold-tier eviction precision
3. Run two arms: sleep cycles **enabled** vs **disabled**
4. Report the delta — this is the headline artifact

**Why it matters:** No competitor measures this. If sleep cycles show lift, MemForge has only evidence of its kind in the field.

**Files to create:** `benchmarks/longitudinal/`, harness modules

---

### WB-05: Instrument Sleep Cycle with Before/After Deltas

**Priority:** P1  
**Status:** Not started  
**Effort:** 2–3 AI sessions

**Goal:** Each sleep cycle records whether it helped, not just what it did

**Acceptance criteria:**
- Before/after snapshot against fixed probe query set
- Per-phase attribution (which phases moved which metrics)
- Exposed via `/memory/:agentId/health` and Prometheus `/metrics`

**Files to modify:** `src/sleep-cycle.ts`, metrics export path

**Dependencies:** None (prerequisite for WB-04)

---

### WB-06: Run BEAM at 1M and 10M Scales

**Priority:** P1  
**Status:** Not started  
**Effort:** 2–4 AI sessions

**Goal:** Demonstrate scale performance where no architecture has saturated

**What is BEAM:** Benchmark explicitly designed so no current system saturates it. Stresses tiered architecture.

**Acceptance criteria:**
- BEAM-1M results published with token cost
- BEAM-10M results published with token cost
- Failure modes at 10M documented honestly

**Files to create:** `benchmarks/beam/`

**Dependencies:** WB-02; may be blocked by streaming consolidation limitation (#11)

---

## Verification Checklist

### Before Running
- [ ] Node.js 22+ installed (`node --version`)
- [ ] PostgreSQL 16+ running with pgvector extension
- [ ] MemForge server running (`npm run dev`)
- [ ] Dataset downloaded (`npm run benchmark:download`)
- [ ] API key set (OpenAI or Ollama configured)

### After Smoke Test
- [ ] Type check passes (`npm run type-check`)
- [ ] 10 questions evaluated without errors
- [ ] Results saved to `benchmarks/longmemeval-qa/results/`
- [ ] Markdown report generated and readable

### After Full Run
- [ ] 500 questions evaluated
- [ ] Accuracy reported (expect ~70–80%, 20–30 points below retrieval R@5)
- [ ] Per-category breakdown included
- [ ] Tokens/retrieval reported
- [ ] Results added to `benchmarks/RESULTS.md`
- [ ] `CHANGELOG.md` updated with findings

---

## Troubleshooting

### "Cannot find module 'tsx/esm'"
```bash
npm install --save-dev tsx
```

### "DATABASE_URL is required"
```bash
$env:DATABASE_URL="postgresql://postgres:password@localhost:5432/memforge"
# or export DATABASE_URL=...
```

### "pgvector extension not found"
```sql
-- In psql:
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### "OPENAI_API_KEY not set"
Either:
1. Set OpenAI key: `$env:OPENAI_API_KEY="sk-..."`
2. Or use Ollama: Set `QA_JUDGE_MODEL` and `QA_READER_MODEL` to Ollama models

### "Dataset not found"
```bash
npm run benchmark:download
```

### Benchmark hangs or crashes
- Check server logs: `npm run dev` terminal
- Check PostgreSQL: `docker logs memforge-postgres`
- Reduce batch size: `$env:BENCHMARK_CONCURRENCY=2`

---

## Success Metrics

### Phase 1 (P0) — Complete ✅
- [x] All benchmark claims relabelled (retrieval R@5 vs QA accuracy)
- [x] Disclaimers added to README and RESULTS.md
- [x] CHANGELOG.md documents the change

### Phase 2 (P0) — In Progress
- [ ] Smoke test passes (10 questions)
- [ ] Full QA accuracy run completes (500 questions)
- [ ] Results published in RESULTS.md
- [ ] Accuracy figure is credible (even if lower than 93.2% retrieval R@5)

### Phase 3 (P1) — Planned
- [ ] Longitudinal benchmark implemented
- [ ] Sleep cycle enabled vs disabled arms show delta
- [ ] Results published (positive or null)
- [ ] BEAM 1M/10M results published

---

## Files Reference

### Created for this plan
- `BENCHMARK_PLAN.md` — This document (comprehensive instructions)
- `/memories/session/plan.md` — Strategic overview
- `BENCHMARK_IMPLEMENTATION.md` — Implementation progress tracker

### Benchmark harness files
- `benchmarks/longmemeval-qa/evaluate.ts` — Core QA evaluator
- `benchmarks/longmemeval-qa/run.ts` — Orchestrator
- `benchmarks/longmemeval-qa/types.ts` — TypeScript types
- `benchmarks/longmemeval-qa/ingest.ts` — Ingest helper
- `benchmarks/longmemeval-qa/README.md` — User documentation

### Modified files
- `README.md` — Badge and disclaimer
- `benchmarks/RESULTS.md` — Disclaimer added
- `benchmarks/README.md` — QA accuracy section added
- `CHANGELOG.md` — Relabelling documented
- `package.json` — npm script added
- `NEXTGEN-RECOMMENDATIONS.md` — WB-01 marked complete
- `PHASE_5_PLAN.md` — Benchmark reference updated

---

## Decision Log

### 2026-07-27: Relabelling First
**Decision:** Complete WB-01 (relabelling) before any other benchmark work.  
**Rationale:** Credibility is the foundation. Running new benchmarks with misleading labels would compound the problem.

### 2026-07-27: QA Harness Implementation
**Decision:** Implement full QA accuracy harness (WB-02) as next priority.  
**Rationale:** Without a QA accuracy figure, MemForge is invisible in leaderboard comparisons. This is the entry ticket to the field.

### 2026-07-27: OpenAI API for Judge
**Decision:** Use OpenAI GPT-4o for both reader and judge (default), support Ollama alternative.  
**Rationale:** Credibility requires following the paper's protocol exactly. Local models would introduce confounds and invite skepticism. Ollama support added for cost-effective development.

### 2026-07-27: Incremental Saving
**Decision:** Save results every 10 questions, not just at the end.  
**Rationale:** Long runs (500 questions, several hours) are vulnerable to crashes, API outages, and budget exhaustion. Incremental saving preserves progress.

---

## Contact & Support

**Repository:** https://github.com/salishforge/memforge  
**Documentation:** See `README.md`, `CLAUDE.md`, `INTEGRATION.md`  
**Issues:** https://github.com/salishforge/memforge/issues

**For AI agents:** Read `CLAUDE.md` for project conventions and architecture rules.

---

## Appendix: Environment Variables Reference

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | — | ✅ Yes | PostgreSQL connection string |
| `MEMFORGE_TOKEN` | — | ✅ Yes | Bearer token for API auth |
| `OPENAI_API_KEY` | — | ⚠️ For OpenAI | OpenAI API key (not needed for Ollama) |
| `QA_JUDGE_MODEL` | `gpt-4o-2024-08-06` | No | Judge model name |
| `QA_READER_MODEL` | `gpt-4o-2024-08-06` | No | Reader/generator model name |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | ⚠️ For Ollama | Ollama API endpoint |
| `BENCHMARK_LIMIT` | `500` | No | Number of questions to evaluate |
| `BENCHMARK_OFFSET` | `0` | No | Skip first N questions |
| `BENCHMARK_MODES` | `hybrid` | No | Retrieval mode (keyword/semantic/hybrid) |
| `BENCHMARK_CLEANUP` | `true` | No | Clean up after run |
| `MEMFORGE_URL` | `http://localhost:3333` | No | MemForge server URL |

---

**End of Benchmark Plan**

This document is designed to be self-contained. A new AI agent (Claude Code or similar) can pick this up on a different system and execute the full benchmark suite by following the setup instructions and verification checklist.
