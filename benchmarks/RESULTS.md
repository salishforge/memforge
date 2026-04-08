# MemForge Benchmark Results

Generated: 2026-04-08

## LongMemEval — hybrid mode

- Questions evaluated: 50
- Consolidation mode: concat
- Timestamp: 2026-04-08T23:02:59.219Z

### Retrieval Quality

| Metric | Score |
|--------|-------|
| Recall@1 | 74.0% |
| Recall@3 | 88.0% |
| Recall@5 | 92.0% |
| Recall@10 | 94.0% |

**Baselines:** Hippo 74.0% R@5 (BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 | R@3 | R@5 | R@10 |
|----------|-------|------|------|------|------|
| single-session-user | 50 | 74.0% | 88.0% | 92.0% | 94.0% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 32ms | 47ms | 32ms |
| Ingest (per question) | 13.3s | 22.5s | 14.4s |

## LongMemEval — keyword mode

- Questions evaluated: 50
- Consolidation mode: concat
- Timestamp: 2026-04-08T23:02:59.220Z

### Retrieval Quality

| Metric | Score |
|--------|-------|
| Recall@1 | 60.0% |
| Recall@3 | 60.0% |
| Recall@5 | 60.0% |
| Recall@10 | 60.0% |

**Baselines:** Hippo 74.0% R@5 (BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 | R@3 | R@5 | R@10 |
|----------|-------|------|------|------|------|
| single-session-user | 50 | 60.0% | 60.0% | 60.0% | 60.0% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 7ms | 19ms | 9ms |
| Ingest (per question) | 13.3s | 22.5s | 14.4s |

---

## Methodology

- **Dataset:** [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025)
- **Scoring:** Session Recall@k — does the top-k retrieval results contain content from the gold answer sessions?
- **Ingestion:** Each session tagged with `[SESSION_ID:xxx]` marker, consolidated via MemForge consolidation pipeline
- **Consolidation:** Sessions batched (up to 50 per warm-tier row) with concat or LLM summarize mode
- **Search:** MemForge query() with keyword (PostgreSQL FTS + trigram), semantic (pgvector HNSW), or hybrid (RRF) mode
