# MemForge Benchmarks

Retrieval quality and performance benchmarks for the MemForge memory system.

## Benchmark Suites

### LongMemEval QA Accuracy (end-to-end)

**Official LongMemEval metric:** retrieve → generate → judge

```bash
OPENAI_API_KEY=sk-... npm run benchmark:longmemeval-qa
```

See [`longmemeval-qa/README.md`](longmemeval-qa/README.md) for details. Costs ~$50–100 for full 500-question run.

### LongMemEval Retrieval R@5 (retrieval-only)

**Retrieval sub-metric:** session recall in top-k results

```bash
npm run benchmark:longmemeval
```

See below for details. Free (no external API calls).

---

## LongMemEval

[LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025) tests 5 memory abilities across 500 questions with conversation histories ranging from 115K to 1.5M tokens.

### Prerequisites

1. MemForge server running with PostgreSQL + pgvector:
   ```bash
   DATABASE_URL=postgresql://... npm run dev
   ```

2. Rate limiting disabled for benchmark throughput:
   ```bash
   RATE_LIMIT_MAX=0 npm run dev
   ```

3. Schema applied:
   ```bash
   psql "$DATABASE_URL" -f schema/schema.sql
   ```

### Quick Run (10 questions)

```bash
BENCHMARK_LIMIT=10 npm run benchmark:longmemeval
```

### Full Run (500 questions)

```bash
npm run benchmark:longmemeval
```

### Step-by-Step

```bash
# 1. Download the dataset
npm run benchmark:download

# 2. Ingest sessions into MemForge
npm run benchmark:ingest

# 3. Run evaluation queries
npm run benchmark:evaluate

# 4. Generate report
npm run benchmark:report
```

### Recommended Configuration

For best results, run with local in-process embeddings and hybrid mode:

```bash
EMBEDDING_PROVIDER=local BENCHMARK_MODES=keyword,hybrid npm run benchmark:longmemeval
```

This requires no external embedding service. `@huggingface/transformers` will download the bge-small-en-v1.5 model on first run (~120 MB, cached locally).

### Configuration

All via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMFORGE_URL` | `http://localhost:3333` | MemForge server URL |
| `MEMFORGE_TOKEN` | (none) | Bearer token for auth |
| `BENCHMARK_LIMIT` | `500` | Number of questions to evaluate |
| `BENCHMARK_OFFSET` | `0` | Skip first N questions |
| `BENCHMARK_MODES` | `keyword` | Comma-separated: keyword, semantic, hybrid |
| `BENCHMARK_CONCURRENCY` | `5` | Parallel question ingestion |
| `BENCHMARK_CONSOLIDATION` | `concat` | Consolidation mode: concat or summarize |
| `BENCHMARK_CLEANUP` | `true` | Clean up benchmark agents after run |

### Modes

- **keyword**: PostgreSQL full-text search + trigram fallback. No embedding provider needed.
- **semantic**: pgvector cosine similarity. Requires `EMBEDDING_PROVIDER=local`, `ollama`, or `openai`.
- **hybrid**: Asymmetric reciprocal rank fusion of keyword + semantic (semantic 1.5× weight). Requires embedding provider. **Recommended** — achieves 93.2% retrieval R@5 / 96.4% R@10 with `EMBEDDING_PROVIDER=local`.

### Output

- `benchmarks/RESULTS.md` — Markdown report with tables
- `benchmarks/results/` — Raw JSON results and manifests

### Scoring

**Session Recall@k**: Does the top-k retrieval results contain content from the gold answer sessions?

Each session is tagged with `[SESSION_ID:xxx]` during ingestion. After consolidation (which batches up to 50 sessions per warm-tier row), evaluation queries are run and the returned content is scanned for session ID markers. If any answer session ID appears in the top-k results, Recall@k = 1 for that question.

### Baselines

| System | Metric | R@5 | R@10 | Notes |
|--------|--------|-----|------|-------|
| MemPalace | retrieval R@5 | 96.6% | — | Dedicated graph-memory system, requires Neo4j |
| **MemForge (hybrid)** | **retrieval R@5** | **93.2%** | **96.4%** | Pure PostgreSQL, `EMBEDDING_PROVIDER=local` |
| **MemForge (keyword)** | **retrieval R@5** | **35.0%** | **35.0%** | Pure PostgreSQL, no embedding provider needed (per-session FTS) |
| Hippo (BM25) | retrieval R@5 | 74.0% | — | Zero dependencies, keyword only |
| Zep | retrieval R@5 | Hippo +18.5% | — | Temporal knowledge graph |
| Letta | LoCoMo accuracy | 74.0% | — | LoCoMo benchmark, GPT-4o-mini |

> **Note:** All figures above are retrieval R@5 unless noted otherwise. Do not compare against systems reporting QA accuracy (e.g., Mem0 claims ~93.4% LongMemEval accuracy, not retrieval R@5).
