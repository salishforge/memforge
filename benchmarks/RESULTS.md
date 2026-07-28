# MemForge Benchmark Results

Generated: 2026-07-28

## LongMemEval — hybrid mode

> ## ⚠️ Partial run — not an official result
>
> 42 of 500 questions (stratified sample).
> Reported for development iteration only. Publishable figures require a
> full 500-question run; cite nothing from this page until then.

- Questions evaluated: 42 of 500 (stratified sample)
- Consolidation mode: concat
- Timestamp: 2026-07-28T01:21:09.050Z

### Retrieval Quality

> **Recall@k (sessions)** is the comparable metric: a hit means a gold
> session is among the first k distinct sessions by rank — LongMemEval's
> definition. **Recall@k (rows)** counts a hit anywhere inside the top-k
> retrieved rows; because consolidation packs multiple sessions per row it
> is strictly more generous and is NOT comparable to published figures.

| Metric | Sessions (comparable) | Rows (native) |
|--------|----------------------|---------------|
| Recall@1 | 69.0% | 69.0% |
| Recall@3 | 85.7% | 85.7% |
| Recall@5 | 92.9% | 92.9% |
| Recall@10 | 92.9% | 92.9% |

Sessions packed per retrieved row: **1.0**
(1.0 means rows and sessions are 1:1 and the two columns converge.)

**Baselines (compare against the Sessions column only):** Hippo 74.0% R@5
(BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 (sessions) | R@3 (sessions) | R@5 (sessions) | R@10 (sessions) |
|----------|-------|------|------|------|------|
| knowledge-update | 7 | 85.7% | 100.0% | 100.0% | 100.0% |
| multi-session | 7 | 85.7% | 85.7% | 100.0% | 100.0% |
| single-session-assistant | 7 | 85.7% | 100.0% | 100.0% | 100.0% |
| single-session-preference | 7 | 42.9% | 71.4% | 85.7% | 85.7% |
| single-session-user | 7 | 57.1% | 71.4% | 85.7% | 85.7% |
| temporal-reasoning | 7 | 57.1% | 85.7% | 85.7% | 85.7% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 27ms | 52ms | 31ms |
| Ingest (per question) | 5.2s | 10.7s | 5.4s |

## LongMemEval — keyword mode

> ## ⚠️ Partial run — not an official result
>
> 42 of 500 questions (stratified sample).
> Reported for development iteration only. Publishable figures require a
> full 500-question run; cite nothing from this page until then.

- Questions evaluated: 42 of 500 (stratified sample)
- Consolidation mode: concat
- Timestamp: 2026-07-28T01:21:09.051Z

### Retrieval Quality

> **Recall@k (sessions)** is the comparable metric: a hit means a gold
> session is among the first k distinct sessions by rank — LongMemEval's
> definition. **Recall@k (rows)** counts a hit anywhere inside the top-k
> retrieved rows; because consolidation packs multiple sessions per row it
> is strictly more generous and is NOT comparable to published figures.

| Metric | Sessions (comparable) | Rows (native) |
|--------|----------------------|---------------|
| Recall@1 | 69.0% | 69.0% |
| Recall@3 | 83.3% | 83.3% |
| Recall@5 | 92.9% | 92.9% |
| Recall@10 | 95.2% | 95.2% |

Sessions packed per retrieved row: **1.0**
(1.0 means rows and sessions are 1:1 and the two columns converge.)

**Baselines (compare against the Sessions column only):** Hippo 74.0% R@5
(BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 (sessions) | R@3 (sessions) | R@5 (sessions) | R@10 (sessions) |
|----------|-------|------|------|------|------|
| knowledge-update | 7 | 85.7% | 100.0% | 100.0% | 100.0% |
| multi-session | 7 | 85.7% | 85.7% | 100.0% | 100.0% |
| single-session-assistant | 7 | 57.1% | 100.0% | 100.0% | 100.0% |
| single-session-preference | 7 | 42.9% | 42.9% | 71.4% | 85.7% |
| single-session-user | 7 | 71.4% | 85.7% | 100.0% | 100.0% |
| temporal-reasoning | 7 | 71.4% | 85.7% | 85.7% | 85.7% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 9ms | 40ms | 12ms |
| Ingest (per question) | 5.2s | 10.7s | 5.4s |

---

## Methodology

- **Dataset:** [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025)
- **Scoring:** Session Recall@k — does the top-k retrieval results contain content from the gold answer sessions?
- **Ingestion:** Each session tagged with `[SESSION_ID:xxx]` marker, consolidated via MemForge consolidation pipeline
- **Consolidation:** Sessions batched (up to 50 per warm-tier row) with concat or LLM summarize mode
- **Search:** MemForge query() with keyword (PostgreSQL FTS + trigram), semantic (pgvector HNSW), or hybrid (RRF) mode
