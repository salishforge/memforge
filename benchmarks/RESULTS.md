# MemForge Benchmark Results

Generated: 2026-07-28

## LongMemEval — hybrid mode

- Questions evaluated: 500
- Consolidation mode: concat
- Timestamp: 2026-07-28T08:21:37.478Z

### Retrieval Quality

> **Recall@k (sessions)** is the comparable metric: a hit means a gold
> session is among the first k distinct sessions by rank — LongMemEval's
> definition. **Recall@k (rows)** counts a hit anywhere inside the top-k
> retrieved rows; because consolidation packs multiple sessions per row it
> is strictly more generous and is NOT comparable to published figures.

| Metric | Sessions (comparable) | Rows (native) |
|--------|----------------------|---------------|
| Recall@1 | 83.2% | 83.2% |
| Recall@3 | 93.0% | 93.0% |
| Recall@5 | 95.2% | 95.2% |
| Recall@10 | 97.0% | 97.0% |

Sessions packed per retrieved row: **1.0**
(1.0 means rows and sessions are 1:1 and the two columns converge.)

**Baselines (compare against the Sessions column only):** Hippo 74.0% R@5
(BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 (sessions) | R@3 (sessions) | R@5 (sessions) | R@10 (sessions) |
|----------|-------|------|------|------|------|
| knowledge-update | 78 | 94.9% | 98.7% | 100.0% | 100.0% |
| multi-session | 133 | 88.7% | 96.2% | 97.7% | 100.0% |
| single-session-assistant | 56 | 89.3% | 94.6% | 98.2% | 100.0% |
| single-session-preference | 30 | 50.0% | 73.3% | 83.3% | 93.3% |
| single-session-user | 70 | 80.0% | 90.0% | 91.4% | 91.4% |
| temporal-reasoning | 133 | 77.4% | 91.7% | 93.2% | 94.7% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 36ms | 76ms | 56ms |
| Ingest (per question) | 6.4s | 9.2s | 6.3s |

## LongMemEval — keyword mode

- Questions evaluated: 500
- Consolidation mode: concat
- Timestamp: 2026-07-28T08:21:37.485Z

### Retrieval Quality

> **Recall@k (sessions)** is the comparable metric: a hit means a gold
> session is among the first k distinct sessions by rank — LongMemEval's
> definition. **Recall@k (rows)** counts a hit anywhere inside the top-k
> retrieved rows; because consolidation packs multiple sessions per row it
> is strictly more generous and is NOT comparable to published figures.

| Metric | Sessions (comparable) | Rows (native) |
|--------|----------------------|---------------|
| Recall@1 | 68.8% | 68.8% |
| Recall@3 | 86.4% | 86.4% |
| Recall@5 | 91.8% | 91.8% |
| Recall@10 | 96.4% | 96.4% |

Sessions packed per retrieved row: **1.0**
(1.0 means rows and sessions are 1:1 and the two columns converge.)

**Baselines (compare against the Sessions column only):** Hippo 74.0% R@5
(BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 (sessions) | R@3 (sessions) | R@5 (sessions) | R@10 (sessions) |
|----------|-------|------|------|------|------|
| knowledge-update | 78 | 79.5% | 96.2% | 100.0% | 100.0% |
| multi-session | 133 | 75.2% | 94.0% | 97.0% | 98.5% |
| single-session-assistant | 56 | 58.9% | 89.3% | 92.9% | 96.4% |
| single-session-preference | 30 | 40.0% | 50.0% | 73.3% | 83.3% |
| single-session-user | 70 | 70.0% | 84.3% | 92.9% | 97.1% |
| temporal-reasoning | 133 | 66.2% | 81.2% | 85.0% | 94.7% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 12ms | 74ms | 36ms |
| Ingest (per question) | 6.4s | 9.2s | 6.3s |

---

## Methodology

- **Dataset:** [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025)
- **Scoring:** Session Recall@k — does the top-k retrieval results contain content from the gold answer sessions?
- **Ingestion:** Each session tagged with `[SESSION_ID:xxx]` marker, consolidated via MemForge consolidation pipeline
- **Consolidation:** Sessions batched (up to 50 per warm-tier row) with concat or LLM summarize mode
- **Search:** MemForge query() with keyword (PostgreSQL FTS + trigram), semantic (pgvector HNSW), or hybrid (RRF) mode
