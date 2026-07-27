# LongMemEval QA Accuracy Benchmark

This benchmark runs the **full LongMemEval pipeline**: retrieve → generate answer → LLM judge.

**Official metric:** End-to-end QA accuracy (not retrieval R@5)
**Judge:** `gpt-4o-2024-08-06` (per paper's protocol, >97% human agreement)
**Reader:** `gpt-4o-2024-08-06` (configurable via `QA_READER_MODEL`)

## Why This Matters

The official LongMemEval metric is **QA accuracy**, not retrieval Recall@5. Retrieval R@5 measures whether correct sessions appear in top-k results, while QA accuracy measures whether the final generated answer is correct.

**QA accuracy is typically 20–30 percentage points lower than retrieval R@5.** This is expected and reflects the full pipeline difficulty.

## Quick Run (10 questions)

```bash
OPENAI_API_KEY=sk-... BENCHMARK_LIMIT=10 npm run benchmark:longmemeval-qa
```

## Full Run (500 questions)

```bash
OPENAI_API_KEY=sk-... npm run benchmark:longmemeval-qa
```

> **Warning:** A full 500-question run costs ~$50–100 in OpenAI API charges (judge + reader calls).

## Configuration

All via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMFORGE_URL` | `http://localhost:3333` | MemForge server URL |
| `MEMFORGE_TOKEN` | (none) | Bearer token for auth |
| `OPENAI_API_KEY` | (required) | OpenAI API key for judge and reader |
| `QA_JUDGE_MODEL` | `gpt-4o-2024-08-06` | Judge model (must be >= GPT-4o quality) |
| `QA_READER_MODEL` | `gpt-4o-2024-08-06` | Reader/generator model |
| `BENCHMARK_LIMIT` | `500` | Number of questions to evaluate |
| `BENCHMARK_OFFSET` | `0` | Skip first N questions |
| `BENCHMARK_MODES` | `hybrid` | Retrieval mode: keyword, semantic, hybrid |
| `BENCHMARK_CLEANUP` | `true` | Clean up benchmark agents after run |

## Output

- `benchmarks/longmemeval-qa/results/qa-report-*.md` — Markdown report with accuracy tables
- `benchmarks/longmemeval-qa/results/qa-results-*.json` — Raw JSON results
- `benchmarks/longmemeval-qa/results/qa-manifest-*.json` — Incremental manifests (saved every 10 questions)

## Scoring

**Accuracy**: Percentage of questions where the generated answer is judged correct by GPT-4o.

**Average Score**: Mean judgment score (0.0–1.0) across all questions, allowing partial credit.

**Tokens/Retrieval**: Average tokens consumed per question (context + generation). This metric is now expected alongside accuracy in the field.

## Comparison with Retrieval R@5

| Metric | What it measures | Typical score |
|--------|-----------------|---------------|
| Retrieval R@5 | Correct sessions in top-5 results | 93.2% (MemForge hybrid) |
| QA Accuracy | Final generated answer is correct | ~70–80% (expected) |

**Do not compare directly.** Retrieval R@5 is an upper bound on achievable QA accuracy.

## Reproduction

To reproduce these results:

1. Download LongMemEval dataset: `npm run benchmark:download`
2. Start MemForge server: `DATABASE_URL=postgresql://... npm run dev`
3. Run QA benchmark: `OPENAI_API_KEY=sk-... npm run benchmark:longmemeval-qa`
4. Check results in `benchmarks/longmemeval-qa/results/`

## Cost Estimate

Per question (500 questions total):
- 1 retrieval call (MemForge, negligible cost)
- 1 generation call (~300–500 tokens input, ~100 tokens output)
- 1 judgment call (~200 tokens input, ~50 tokens output)

**Total:** ~$50–100 for full 500-question run at current OpenAI pricing.

## Known Limitations

- **No caching:** Each question is evaluated independently, even if context overlaps
- **Single retrieval mode:** Currently uses only the first mode from `BENCHMARK_MODES`
- **No error recovery:** If judge fails, question is marked incorrect (conservative)
