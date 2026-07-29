# MemForge Benchmark Results

Generated: 2026-07-29

## How to read these numbers

**Retrieval recall is not QA accuracy.** LongMemEval's headline metric is
end-to-end QA (retrieve → generate → judge); the tables below measure only
whether a gold session was retrieved. Recall runs 20–40 points above QA on
the same system, so these are not comparable to figures published by systems
reporting QA accuracy. For the paper-comparable QA number see
`benchmarks/OFFICIAL-RESULTS.md`.

**Recall@k counts a hit if *any* gold session is retrieved.** That is
LongMemEval's definition, and it flatters multi-evidence questions:
`multi-session` questions need ~2.6 gold sessions on average, and scoring
them 100% when one of three is present overstates what reached the reader.
Prefer complete-evidence recall when reasoning about what a reader can
actually answer.

**QA accuracy depends on the reader model and on how much context it gets.**
Measured across three reader families on this corpus, identical retrieval
produced 56%–70% QA depending on the model, and the optimal context width
differed *in direction* between them. A QA figure without its reader and
context width attached is not meaningful.

## LongMemEval — hybrid mode

- Questions evaluated: 500
- Consolidation mode: concat
- Timestamp: 2026-07-29T08:58:04.212Z

### Retrieval Quality

> **Recall@k (sessions)** is the comparable metric: a hit means a gold
> session is among the first k distinct sessions by rank — LongMemEval's
> definition. **Recall@k (rows)** counts a hit anywhere inside the top-k
> retrieved rows; because consolidation packs multiple sessions per row it
> is strictly more generous and is NOT comparable to published figures.

| Metric | Sessions (comparable) | Rows (native) |
|--------|----------------------|---------------|
| Recall@1 | 81.6% | 81.6% |
| Recall@3 | 90.4% | 90.4% |
| Recall@5 | 93.0% | 93.0% |
| Recall@10 | 95.2% | 95.2% |

Sessions packed per retrieved row: **1.0**
(1.0 means rows and sessions are 1:1 and the two columns converge.)

**Baselines (compare against the Sessions column only):** Hippo 74.0% R@5
(BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 (sessions) | R@3 (sessions) | R@5 (sessions) | R@10 (sessions) |
|----------|-------|------|------|------|------|
| knowledge-update | 78 | 93.6% | 97.4% | 97.4% | 97.4% |
| multi-session | 133 | 85.7% | 92.5% | 94.7% | 97.0% |
| single-session-assistant | 56 | 89.3% | 92.9% | 98.2% | 100.0% |
| single-session-preference | 30 | 46.7% | 70.0% | 83.3% | 93.3% |
| single-session-user | 70 | 78.6% | 88.6% | 90.0% | 92.9% |
| temporal-reasoning | 133 | 76.7% | 88.7% | 90.2% | 91.7% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 43ms | 99ms | 53ms |
| Ingest (per question) | 6.4s | 11.2s | 6.6s |

## LongMemEval — keyword mode

- Questions evaluated: 500
- Consolidation mode: concat
- Timestamp: 2026-07-29T08:58:04.220Z

### Retrieval Quality

> **Recall@k (sessions)** is the comparable metric: a hit means a gold
> session is among the first k distinct sessions by rank — LongMemEval's
> definition. **Recall@k (rows)** counts a hit anywhere inside the top-k
> retrieved rows; because consolidation packs multiple sessions per row it
> is strictly more generous and is NOT comparable to published figures.

| Metric | Sessions (comparable) | Rows (native) |
|--------|----------------------|---------------|
| Recall@1 | 67.0% | 67.0% |
| Recall@3 | 84.6% | 84.6% |
| Recall@5 | 90.0% | 90.0% |
| Recall@10 | 94.0% | 94.0% |

Sessions packed per retrieved row: **1.0**
(1.0 means rows and sessions are 1:1 and the two columns converge.)

**Baselines (compare against the Sessions column only):** Hippo 74.0% R@5
(BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 (sessions) | R@3 (sessions) | R@5 (sessions) | R@10 (sessions) |
|----------|-------|------|------|------|------|
| knowledge-update | 78 | 76.9% | 93.6% | 97.4% | 97.4% |
| multi-session | 133 | 72.9% | 91.7% | 94.7% | 95.5% |
| single-session-assistant | 56 | 58.9% | 89.3% | 92.9% | 96.4% |
| single-session-preference | 30 | 40.0% | 50.0% | 73.3% | 83.3% |
| single-session-user | 70 | 67.1% | 81.4% | 90.0% | 94.3% |
| temporal-reasoning | 133 | 64.7% | 79.7% | 83.5% | 91.7% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 21ms | 66ms | 41ms |
| Ingest (per question) | 6.4s | 11.2s | 6.6s |

## LongMemEval — semantic mode

- Questions evaluated: 500
- Consolidation mode: concat
- Timestamp: 2026-07-29T08:58:04.227Z

### Retrieval Quality

> **Recall@k (sessions)** is the comparable metric: a hit means a gold
> session is among the first k distinct sessions by rank — LongMemEval's
> definition. **Recall@k (rows)** counts a hit anywhere inside the top-k
> retrieved rows; because consolidation packs multiple sessions per row it
> is strictly more generous and is NOT comparable to published figures.

| Metric | Sessions (comparable) | Rows (native) |
|--------|----------------------|---------------|
| Recall@1 | 74.2% | 74.2% |
| Recall@3 | 86.0% | 86.0% |
| Recall@5 | 87.4% | 87.4% |
| Recall@10 | 93.0% | 93.0% |

Sessions packed per retrieved row: **1.0**
(1.0 means rows and sessions are 1:1 and the two columns converge.)

**Baselines (compare against the Sessions column only):** Hippo 74.0% R@5
(BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 (sessions) | R@3 (sessions) | R@5 (sessions) | R@10 (sessions) |
|----------|-------|------|------|------|------|
| knowledge-update | 78 | 76.9% | 93.6% | 94.9% | 96.2% |
| multi-session | 133 | 78.9% | 88.0% | 89.5% | 95.5% |
| single-session-assistant | 56 | 96.4% | 100.0% | 100.0% | 100.0% |
| single-session-preference | 30 | 60.0% | 80.0% | 80.0% | 90.0% |
| single-session-user | 70 | 58.6% | 70.0% | 71.4% | 82.9% |
| temporal-reasoning | 133 | 69.9% | 83.5% | 85.7% | 91.7% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 28ms | 58ms | 31ms |
| Ingest (per question) | 6.4s | 11.2s | 6.6s |

---

## Methodology

- **Dataset:** [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025)
- **Scoring:** Session Recall@k — does the top-k retrieval results contain content from the gold answer sessions?
- **Ingestion:** Each session tagged with `[SESSION_ID:xxx]` marker, consolidated via MemForge consolidation pipeline
- **Consolidation:** Sessions batched (up to 50 per warm-tier row) with concat or LLM summarize mode
- **Search:** MemForge query() with keyword (PostgreSQL FTS + trigram), semantic (pgvector HNSW), or hybrid (RRF) mode
