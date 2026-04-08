# MemForge Benchmark Results

Generated: 2026-04-08

## LongMemEval — keyword mode

- Questions evaluated: 500
- Consolidation mode: concat
- Timestamp: 2026-04-08T17:34:17.337Z

### Retrieval Quality

| Metric | Score |
|--------|-------|
| Recall@1 | 88.0% |
| Recall@3 | 88.0% |
| Recall@5 | 88.0% |
| Recall@10 | 88.0% |

**Baselines:** Hippo 74.0% R@5 (BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 | R@3 | R@5 | R@10 |
|----------|-------|------|------|------|------|
| knowledge-update | 78 | 96.2% | 96.2% | 96.2% | 96.2% |
| multi-session | 133 | 90.2% | 90.2% | 90.2% | 90.2% |
| single-session-assistant | 56 | 85.7% | 85.7% | 85.7% | 85.7% |
| single-session-preference | 30 | 66.7% | 66.7% | 66.7% | 66.7% |
| single-session-user | 70 | 88.6% | 88.6% | 88.6% | 88.6% |
| temporal-reasoning | 133 | 86.5% | 86.5% | 86.5% | 86.5% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 28ms | 38ms | 28ms |
| Ingest (per question) | 414ms | 586ms | 427ms |

---

## Methodology

- **Dataset:** [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025)
- **Scoring:** Session Recall@k — does the top-k retrieval results contain content from the gold answer sessions?
- **Ingestion:** Each session tagged with `[SESSION_ID:xxx]` marker, consolidated via MemForge consolidation pipeline
- **Consolidation:** Sessions batched (up to 50 per warm-tier row) with concat or LLM summarize mode
- **Search:** MemForge query() with keyword (PostgreSQL FTS + trigram), semantic (pgvector HNSW), or hybrid (RRF) mode
