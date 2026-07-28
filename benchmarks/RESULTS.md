# MemForge Benchmark Results

> # ⚠️ RETRACTED — do not cite the figures below
>
> **Every Recall@k number on this page is invalid.** The scorer that produced
> them called `recallAtK(ids, answers, ids.length)` — passing the candidate
> list's own length as `k`, so the internal `slice(0, k)` never truncated and
> R@1, R@3, R@5 and R@10 were all computed over the *entire* retrieved set.
>
> The inflation is not marginal. Consolidation packs many sessions into each
> warm-tier row, so "the top 5 rows" could hold hundreds of sessions. What was
> published as "93.2% R@5" actually means *"a gold session appeared anywhere
> among all sessions inside the top 5 rows."* That is not LongMemEval's R@5.
>
> Fixed in `benchmarks/lib/metrics.ts`, which now computes two clearly named
> metrics — `recallAtKSessions` (LongMemEval's definition, the comparable one)
> and `recallAtKRows` (MemForge's native row-level behaviour) — plus the
> sessions-per-row packing factor that explains the gap. Regression tests live
> in `tests/benchmark-metrics.test.ts`; the scorer previously had none, which
> is how this shipped.
>
> A corrected full re-run is in progress. Numbers below are retained only as a
> record of what was previously claimed.

Generated: 2026-04-09 (superseded)

> **Also note:** these were **retrieval-only** scores, not LongMemEval's
> official end-to-end QA accuracy (retrieve → generate → judge), which is
> typically 20–30 points lower. The QA harness now lives in
> `benchmarks/longmemeval-qa/`.

## [RETRACTED] LongMemEval-S — hybrid mode (retrieval R@5)

- Questions evaluated: 500
- Consolidation mode: concat
- Timestamp: 2026-04-09T08:05:52.269Z

### Retrieval Quality

| Metric | Score |
|--------|-------|
| Recall@1 | 81.0% |
| Recall@3 | 90.8% |
| Recall@5 | 93.2% |
| Recall@10 | 96.4% |

**Baselines:** Hippo 74.0% R@5 (BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 | R@3 | R@5 | R@10 |
|----------|-------|------|------|------|------|
| knowledge-update | 78 | 93.6% | 97.4% | 97.4% | 100.0% |
| multi-session | 133 | 86.5% | 94.0% | 96.2% | 98.5% |
| single-session-assistant | 56 | 92.9% | 98.2% | 100.0% | 100.0% |
| single-session-preference | 30 | 43.3% | 66.7% | 80.0% | 93.3% |
| single-session-user | 70 | 74.3% | 84.3% | 87.1% | 90.0% |
| temporal-reasoning | 133 | 75.2% | 89.5% | 91.0% | 94.7% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 45ms | 77ms | 48ms |
| Ingest (per question) | 23.1s | 35.8s | 23.1s |

## LongMemEval — keyword mode

- Questions evaluated: 500
- Consolidation mode: concat
- Timestamp: 2026-04-09T08:05:52.272Z

### Retrieval Quality

| Metric | Score |
|--------|-------|
| Recall@1 | 33.4% |
| Recall@3 | 34.6% |
| Recall@5 | 35.0% |
| Recall@10 | 35.0% |

**Baselines:** Hippo 74.0% R@5 (BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 | R@3 | R@5 | R@10 |
|----------|-------|------|------|------|------|
| knowledge-update | 78 | 56.4% | 56.4% | 56.4% | 56.4% |
| multi-session | 133 | 29.3% | 30.1% | 30.1% | 30.1% |
| single-session-assistant | 56 | 19.6% | 23.2% | 25.0% | 25.0% |
| single-session-preference | 30 | 6.7% | 10.0% | 10.0% | 10.0% |
| single-session-user | 70 | 57.1% | 58.6% | 58.6% | 58.6% |
| temporal-reasoning | 133 | 23.3% | 24.1% | 24.8% | 24.8% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 14ms | 26ms | 14ms |
| Ingest (per question) | 23.1s | 35.8s | 23.1s |

---

## Methodology

- **Dataset:** [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025)
- **Scoring:** Session Recall@k — does the top-k retrieval results contain content from the gold answer sessions?
- **Ingestion:** Each session tagged with `[SESSION_ID:xxx]` marker, consolidated via MemForge consolidation pipeline
- **Consolidation:** Sessions batched (up to 50 per warm-tier row) with concat or LLM summarize mode
- **Search:** MemForge query() with keyword (PostgreSQL FTS + trigram), semantic (pgvector HNSW), or hybrid (RRF) mode
