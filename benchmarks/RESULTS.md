# MemForge Benchmark Results

Generated: 2026-04-09

## LongMemEval — hybrid mode

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
