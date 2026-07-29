# MemForge Benchmark Results

Generated: 2026-07-29

## How to read these numbers

**Retrieval recall is not QA accuracy.** LongMemEval's headline metric is
end-to-end QA (retrieve → generate → judge); the recall tables below measure
only whether a gold session was retrieved. Recall runs 20–40 points above QA
on the same system, so these tables are not comparable to figures published by
systems reporting QA accuracy.

**Recall@k counts a hit if *any* gold session is retrieved.** That is
LongMemEval's definition, and it flatters multi-evidence questions:
`multi-session` questions need 2.59 gold sessions on average, and scoring them
100% when one of three is present overstates what actually reached the reader.
Complete-evidence recall — all gold sessions present — is **91.8%** against
97.6% any-hit. Prefer the former when reasoning about what a reader can answer.

**QA accuracy depends heavily on the reader model, and on how much context it
is given.** Measured across three reader families on this corpus, the same
retrieval produced 56.2%–69.8% QA depending on the model, and the optimal
context width differed *in direction*: weaker readers scored best on ~14,000
tokens of extracted passages and lost 4–6 points at 32,000 tokens of whole
memories, while the strongest reader peaked at 32,000. A single QA number
without its reader and context width attached is not meaningful.

**Prior figures from this harness were wrong.** Before 2026-07-29, QA runs
used keyword-only retrieval rather than hybrid, and never supplied session
dates to the reader — which made `temporal-reasoning` (133 of 500 questions)
unanswerable by construction. Any QA number published before that date
understates the system and should not be compared with these.

## LongMemEval — hybrid mode

- Questions evaluated: 500
- Consolidation mode: concat
- Timestamp: 2026-07-29T02:15:57.504Z

### Retrieval Quality

> **Recall@k (sessions)** is the comparable metric: a hit means a gold
> session is among the first k distinct sessions by rank — LongMemEval's
> definition. **Recall@k (rows)** counts a hit anywhere inside the top-k
> retrieved rows; because consolidation packs multiple sessions per row it
> is strictly more generous and is NOT comparable to published figures.

| Metric | Sessions (comparable) | Rows (native) |
|--------|----------------------|---------------|
| Recall@1 | 83.8% | 83.8% |
| Recall@3 | 92.6% | 92.6% |
| Recall@5 | 95.4% | 95.4% |
| Recall@10 | 97.6% | 97.6% |

Sessions packed per retrieved row: **1.0**
(1.0 means rows and sessions are 1:1 and the two columns converge.)

**Baselines (compare against the Sessions column only):** Hippo 74.0% R@5
(BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 (sessions) | R@3 (sessions) | R@5 (sessions) | R@10 (sessions) |
|----------|-------|------|------|------|------|
| knowledge-update | 78 | 96.2% | 100.0% | 100.0% | 100.0% |
| multi-session | 133 | 88.7% | 95.5% | 97.7% | 100.0% |
| single-session-assistant | 56 | 89.3% | 92.9% | 98.2% | 100.0% |
| single-session-preference | 30 | 46.7% | 70.0% | 83.3% | 93.3% |
| single-session-user | 70 | 81.4% | 91.4% | 92.9% | 95.7% |
| temporal-reasoning | 133 | 78.9% | 91.0% | 93.2% | 94.7% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 40ms | 97ms | 50ms |
| Ingest (per question) | 6.8s | 10.5s | 6.9s |

## LongMemEval — keyword mode

- Questions evaluated: 500
- Consolidation mode: concat
- Timestamp: 2026-07-29T02:15:57.512Z

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
| Query | 21ms | 65ms | 40ms |
| Ingest (per question) | 6.8s | 10.5s | 6.9s |

## LongMemEval — semantic mode

- Questions evaluated: 500
- Consolidation mode: concat
- Timestamp: 2026-07-29T02:15:57.519Z

### Retrieval Quality

> **Recall@k (sessions)** is the comparable metric: a hit means a gold
> session is among the first k distinct sessions by rank — LongMemEval's
> definition. **Recall@k (rows)** counts a hit anywhere inside the top-k
> retrieved rows; because consolidation packs multiple sessions per row it
> is strictly more generous and is NOT comparable to published figures.

| Metric | Sessions (comparable) | Rows (native) |
|--------|----------------------|---------------|
| Recall@1 | 76.0% | 76.0% |
| Recall@3 | 88.2% | 88.2% |
| Recall@5 | 89.6% | 89.6% |
| Recall@10 | 95.4% | 95.4% |

Sessions packed per retrieved row: **1.0**
(1.0 means rows and sessions are 1:1 and the two columns converge.)

**Baselines (compare against the Sessions column only):** Hippo 74.0% R@5
(BM25 keyword), Zep +18.5% over full-context

### Per-Category Breakdown

| Category | Count | R@1 (sessions) | R@3 (sessions) | R@5 (sessions) | R@10 (sessions) |
|----------|-------|------|------|------|------|
| knowledge-update | 78 | 79.5% | 96.2% | 97.4% | 98.7% |
| multi-session | 133 | 82.0% | 91.0% | 92.5% | 98.5% |
| single-session-assistant | 56 | 96.4% | 100.0% | 100.0% | 100.0% |
| single-session-preference | 30 | 60.0% | 80.0% | 80.0% | 90.0% |
| single-session-user | 70 | 60.0% | 72.9% | 74.3% | 85.7% |
| temporal-reasoning | 133 | 71.4% | 85.7% | 88.0% | 94.7% |

### Latency

| Operation | p50 | p95 | Mean |
|-----------|-----|-----|------|
| Query | 30ms | 74ms | 35ms |
| Ingest (per question) | 6.8s | 10.5s | 6.9s |

---

## Methodology

- **Dataset:** [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025)
- **Scoring:** Session Recall@k — does the top-k retrieval results contain content from the gold answer sessions?
- **Ingestion:** Each session tagged with `[SESSION_ID:xxx]` marker, consolidated via MemForge consolidation pipeline
- **Consolidation:** Sessions batched (up to 50 per warm-tier row) with concat or LLM summarize mode
- **Search:** MemForge query() with keyword (PostgreSQL FTS + trigram), semantic (pgvector HNSW), or hybrid (RRF) mode
