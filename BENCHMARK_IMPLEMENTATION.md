# Benchmark Implementation Progress

**Last updated:** 2026-07-27
**Status:** Phase 1 (P0) credibility fixes complete, QA accuracy harness implemented

---

## Completed

### WB-01: Benchmark Relabelling ✅

All benchmark claims have been relabelled to distinguish retrieval R@5 from QA accuracy:

**Files updated:**
- `README.md` — Badge changed to "LongMemEval-S retrieval R@5 93.2% hybrid", disclaimer added
- `benchmarks/RESULTS.md` — Opening disclaimer added, baseline table updated with metric type column
- `benchmarks/README.md` — Baseline table updated, hybrid mode description clarified
- `CHANGELOG.md` — Entry documenting the relabelling and rationale
- `PHASE_5_PLAN.md` — Benchmark reference updated
- `NEXTGEN-RECOMMENDATIONS.md` — WB-01 marked complete, executive summary updated

**Key changes:**
- Badge: `LongMemEval R@5 93.2% hybrid` → `LongMemEval-S retrieval R@5 93.2% hybrid`
- All mentions now specify "retrieval R@5" not just "R@5"
- Explicit disclaimers added: retrieval R@5 and QA accuracy are not directly comparable
- Baseline tables now include "Metric" column distinguishing retrieval R@5 from accuracy

---

### WB-02: QA Accuracy Harness — Implementation Complete ⚠️ (needs testing)

**Files created:**
- `benchmarks/longmemeval-qa/evaluate.ts` — Core evaluation pipeline (retrieve → generate → judge)
- `benchmarks/longmemeval-qa/run.ts` — Orchestrator and report generator
- `benchmarks/longmemeval-qa/types.ts` — TypeScript types for QA results
- `benchmarks/longmemeval-qa/ingest.ts` — Session ingestion helper
- `benchmarks/longmemeval-qa/README.md` — Documentation

**Files modified:**
- `benchmarks/README.md` — Added QA accuracy section at top
- `package.json` — Added `benchmark:longmemeval-qa` script

**Features:**
- Full LongMemEval pipeline: retrieve → generate answer → LLM judge
- Judge: `gpt-4o-2024-08-06` (per paper's protocol, >97% human agreement)
- Reports per-category accuracy, average score, tokens/retrieval, latency breakdown
- Incremental result saving every 10 questions (crash-resilient)
- Configurable via environment variables

**Usage:**
```bash
OPENAI_API_KEY=sk-... BENCHMARK_LIMIT=10 npm run benchmark:longmemeval-qa
```

**Cost estimate:** ~$50–100 for full 500-question run at current OpenAI pricing.

---

## Pending Verification

### Type Check
```bash
npm run type-check
```
**Status:** Cannot run — Node.js not installed in current environment

**Action needed:** Install Node.js 22+ and run type check to verify no TypeScript errors

---

### Smoke Test
```bash
OPENAI_API_KEY=sk-... BENCHMARK_LIMIT=2 npm run benchmark:longmemeval-qa
```
**Status:** Requires:
1. Node.js 22+ installed
2. PostgreSQL running with pgvector
3. MemForge server running
4. LongMemEval dataset downloaded (`npm run benchmark:download`)
5. OpenAI API key with sufficient budget

**Expected output:** 
- 2 questions evaluated
- Markdown report in `benchmarks/longmemeval-qa/results/qa-report-*.md`
- JSON results in `benchmarks/longmemeval-qa/results/qa-results-*.json`

---

## Next Steps (in order)

### 1. Verify Type Check
```bash
npm run type-check
```
Must pass with 0 errors before proceeding.

### 2. Run Smoke Test
```bash
# Download dataset first
npm run benchmark:download

# Start MemForge server
DATABASE_URL=postgresql://... npm run dev

# Run 2-question smoke test
OPENAI_API_KEY=sk-... BENCHMARK_LIMIT=2 npm run benchmark:longmemeval-qa
```

### 3. Fix Any Issues
Common issues to watch for:
- TypeScript type errors (likely in evaluate.ts imports)
- Missing ingest helper integration
- OpenAI API authentication errors
- Dataset path issues

### 4. Run Full Benchmark (Optional)
```bash
OPENAI_API_KEY=sk-... npm run benchmark:longmemeval-qa
```
This will cost ~$50–100 and take several hours.

### 5. Publish Results
Update `benchmarks/RESULTS.md` with the QA accuracy results alongside the existing retrieval R@5 results.

---

## Remaining Work Blocks

### WB-03: Fix Single-Session-Preference Retrieval
**Status:** Not started
**Priority:** P0
**Estimated effort:** 2–3 AI sessions

Root cause analysis needed. Hypotheses:
- Preference statements are short and lose to longer chunks under RRF
- Preference language lacks distinctive keyword anchors
- `KEYWORD_OVERLAP_BOOST=0.3` may be miscalibrated for short spans

### WB-04: Longitudinal Memory Quality Benchmark
**Status:** Not started
**Priority:** P1 (flagship)
**Estimated effort:** 4–6 AI sessions

This is the category-defining benchmark that measures whether memory *improves* over time with sleep cycles enabled vs disabled.

### WB-05: Instrument Sleep Cycle with Before/After Deltas
**Status:** Not started
**Priority:** P1
**Estimated effort:** 2–3 AI sessions

Prerequisite for WB-04. Each sleep cycle records whether it helped, not just what it did.

### WB-06: Run BEAM at 1M and 10M Scales
**Status:** Not started
**Priority:** P1
**Estimated effort:** 2–4 AI sessions

BEAM is the benchmark where no architecture has saturated it. Stresses MemForge's tiered design.

---

## Files Created/Modified Summary

### Created (11 files)
1. `/memories/session/plan.md` — Comprehensive benchmarking plan
2. `benchmarks/longmemeval-qa/evaluate.ts` — Core QA evaluator
3. `benchmarks/longmemeval-qa/run.ts` — Orchestrator
4. `benchmarks/longmemeval-qa/types.ts` — TypeScript types
5. `benchmarks/longmemeval-qa/ingest.ts` — Ingest helper
6. `benchmarks/longmemeval-qa/README.md` — Documentation

### Modified (7 files)
1. `README.md` — Badge and disclaimer updated
2. `benchmarks/RESULTS.md` — Disclaimer and baseline table updated
3. `benchmarks/README.md` — QA accuracy section added
4. `CHANGELOG.md` — Relabelling entry added
5. `PHASE_5_PLAN.md` — Benchmark reference updated
6. `NEXTGEN-RECOMMENDATIONS.md` — WB-01 marked complete
7. `package.json` — npm script added

---

## Cost Tracking

### Completed
- **Relabelling (WB-01):** $0 (engineering time only)
- **QA harness (WB-02):** $0 (engineering time only)

### Pending
- **QA accuracy run (500 questions):** ~$50–100 (OpenAI API)
- **WB-03 (preference retrieval):** $0 (engineering time)
- **WB-04 (longitudinal):** $0–50 (engineering + optional LLM costs)
- **WB-06 (BEAM):** $0 (engineering time, dataset access TBD)

**Total spent:** $0
**Total budgeted:** $100–200

---

## Notes

### Judge Model Choice
Using `gpt-4o-2024-08-06` per the LongMemEval paper's protocol (>97% human agreement). This is non-negotiable for credibility — cheaper models would undermine the benchmark's authority.

### Partial Credit
The judge returns both a binary `correct` flag and a continuous `score` (0.0–1.0), allowing partial credit. This is more informative than binary accuracy alone.

### Token Cost Tracking
The field now expects accuracy paired with token cost. The harness reports `tokensPerRetrieval` to enable fair comparison with more efficient systems.

### Crash Resilience
Results are saved incrementally every 10 questions. If the run crashes or is interrupted, progress is not lost.

---

## Decision Log

### 2026-07-27: Relabelling First
**Decision:** Complete WB-01 (relabelling) before any other benchmark work.
**Rationale:** Credibility is the foundation. Running new benchmarks with misleading labels would compound the problem.

### 2026-07-27: QA Harness Implementation
**Decision:** Implement full QA accuracy harness (WB-02) as the next priority.
**Rationale:** Without a QA accuracy figure, MemForge is invisible in leaderboard comparisons. This is the entry ticket to the field.

### 2026-07-27: OpenAI API for Judge
**Decision:** Use OpenAI GPT-4o for both reader and judge, not local models.
**Rationale:** Credibility requires following the paper's protocol exactly. Local models would introduce confounds and invite skepticism.

### 2026-07-27: Incremental Saving
**Decision:** Save results every 10 questions, not just at the end.
**Rationale:** Long runs (500 questions, several hours) are vulnerable to crashes, API outages, and budget exhaustion. Incremental saving preserves progress.
