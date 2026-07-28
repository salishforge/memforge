// LongMemEval QA Accuracy Runner
//
// Orchestrates the full QA accuracy evaluation pipeline
// Usage: npx tsx benchmarks/longmemeval-qa/run.ts [--limit=100]

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, type BenchmarkConfig } from '../lib/config.js';
import { main as evaluate } from './evaluate.js';
import type { QAQuestionResult, QAAggregateResult } from './types.js';
import { loadLlmConfig, isPaperProtocolJudge } from '../lib/llm.js';

const LLM = loadLlmConfig();

function calculateStats(results: QAQuestionResult[]): QAAggregateResult {
  const totalQuestions = results.length;
  const correctCount = results.filter(r => r.correct).length;
  const accuracy = correctCount / totalQuestions;
  const averageScore = results.reduce((sum, r) => sum + (r.score ?? 0), 0) / totalQuestions;

  // Per-category breakdown
  const perCategory: Record<string, { count: number; correct: number; accuracy: number; avgScore: number }> = {};
  for (const result of results) {
    const bucket = perCategory[result.questionType]
      ?? (perCategory[result.questionType] = { count: 0, correct: 0, accuracy: 0, avgScore: 0 });
    bucket.count++;
    if (result.correct) bucket.correct++;
    bucket.avgScore += result.score ?? 0;
  }

  for (const category of Object.values(perCategory)) {
    category.accuracy = category.correct / category.count;
    category.avgScore = category.avgScore / category.count;
  }

  // Latency averages
  const avgLatency = {
    queryMs: results.reduce((sum, r) => sum + r.latency.queryMs, 0) / totalQuestions,
    generateMs: results.reduce((sum, r) => sum + r.latency.generateMs, 0) / totalQuestions,
    judgeMs: results.reduce((sum, r) => sum + r.latency.judgeMs, 0) / totalQuestions,
    totalMs: results.reduce((sum, r) => sum + r.latency.totalMs, 0) / totalQuestions,
  };

  // Tokens per retrieval
  const tokensPerRetrieval = results.reduce((sum, r) => sum + (r.tokens?.totalTokens ?? 0), 0) / totalQuestions;

  return {
    totalQuestions,
    correctCount,
    accuracy,
    averageScore,
    perCategory,
    latency: avgLatency,
    tokensPerRetrieval,
    judgeModel: LLM.judgeModel,
    readerModel: LLM.readerModel,
    timestamp: new Date().toISOString(),
  };
}

function generateReport(stats: QAAggregateResult, results: QAQuestionResult[]): string {
  const lines: string[] = [];

  lines.push('# LongMemEval QA Accuracy Results');
  lines.push('');
  lines.push(`Generated: ${stats.timestamp}`);
  lines.push('');
  lines.push('> **Important:** These are **end-to-end QA accuracy** scores (retrieve → generate → judge),');
  lines.push('> not retrieval recall.');
  lines.push('');
  if (isPaperProtocolJudge(stats.judgeModel)) {
    lines.push('> Judge: `' + stats.judgeModel + '` — the paper protocol judge (>97% human agreement),');
    lines.push('> so these scores are directly comparable to published LongMemEval entries.');
  } else {
    // The comparability claim is conditional on the judge. Emitting it
    // unconditionally is how a local-model score gets quoted as a
    // leaderboard result.
    lines.push('> **Not comparable to published LongMemEval numbers.** Judge: `' + stats.judgeModel + '`,');
    lines.push('> whereas the paper protocol judges with `gpt-4o` (>97% human agreement). These');
    lines.push('> scores are valid for tracking relative progress between MemForge runs only.');
    lines.push('> Re-run with `QA_JUDGE_MODEL=gpt-4o-2024-08-06` before publishing or comparing.');
  }
  lines.push('');
  lines.push('## Overall Accuracy');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push('|--------|-------|');
  lines.push(`| Questions | ${stats.totalQuestions} |`);
  lines.push(`| Correct | ${stats.correctCount} |`);
  lines.push(`| Accuracy | ${(stats.accuracy * 100).toFixed(1)}% |`);
  lines.push(`| Average Score | ${(stats.averageScore * 100).toFixed(1)}% |`);
  lines.push(`| Tokens/Retrieval | ${Math.round(stats.tokensPerRetrieval)} |`);
  lines.push('');
  lines.push('## Per-Category Breakdown');
  lines.push('');
  lines.push('| Category | Count | Correct | Accuracy | Avg Score |');
  lines.push('|----------|-------|---------|----------|-----------|');
  for (const [category, data] of Object.entries(stats.perCategory).sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`| ${category} | ${data.count} | ${data.correct} | ${(data.accuracy * 100).toFixed(1)}% | ${(data.avgScore * 100).toFixed(1)}% |`);
  }
  lines.push('');
  lines.push('## Latency');
  lines.push('');
  lines.push('| Operation | Mean (ms) |');
  lines.push('|-----------|-----------|');
  lines.push(`| Retrieval | ${Math.round(stats.latency.queryMs)} |`);
  lines.push(`| Generation | ${Math.round(stats.latency.generateMs)} |`);
  lines.push(`| Judging | ${Math.round(stats.latency.judgeMs)} |`);
  lines.push(`| Total | ${Math.round(stats.latency.totalMs)} |`);
  lines.push('');
  lines.push('## Configuration');
  lines.push('');
  lines.push(`- **Judge Model:** ${stats.judgeModel}`);
  lines.push(`- **Reader Model:** ${stats.readerModel}`);
  lines.push(`- **Judge API:** OpenAI GPT-4o`);
  lines.push('');
  lines.push('## Comparison with Retrieval R@5');
  lines.push('');
  lines.push('For reference, MemForge retrieval R@5 scores (not directly comparable):');
  lines.push('');
  lines.push('| Mode | R@5 |');
  lines.push('|------|-----|');
  lines.push('| Hybrid | 93.2% |');
  lines.push('| Keyword | 35.0% |');
  lines.push('');
  lines.push('> **Note:** Retrieval R@5 measures whether correct sessions appear in top-k results.');
  lines.push('> QA accuracy measures whether the final generated answer is correct.');
  lines.push('> QA accuracy is typically 20–30 percentage points lower than retrieval R@5.');
  lines.push('');

  return lines.join('\n');
}

export async function main() {
  const config: BenchmarkConfig = loadConfig();

  // Parse CLI args
  for (const arg of process.argv.slice(2)) {
    const limitMatch = arg.match(/^--limit=(\d+)$/);
    if (limitMatch?.[1]) config.questionLimit = parseInt(limitMatch[1], 10);
  }

  console.log('=== LongMemEval QA Accuracy Benchmark ===');
  console.log('');

  const results = await evaluate(config);
  const stats = calculateStats(results);

  // Save results
  const resultsDir = join(process.cwd(), 'benchmarks', 'longmemeval-qa', 'results');
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const jsonPath = join(resultsDir, `qa-results-${timestamp}.json`);
  const reportPath = join(resultsDir, `qa-report-${timestamp}.md`);

  writeFileSync(jsonPath, JSON.stringify({ stats, results }, null, 2));
  writeFileSync(reportPath, generateReport(stats, results));

  // Update main RESULTS.md
  const mainResultsPath = join(process.cwd(), 'benchmarks', 'RESULTS.md');
  console.log('');
  console.log(`Results saved to ${reportPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.log('');
  console.log('=== Summary ===');
  console.log(`Questions: ${stats.totalQuestions}`);
  console.log(`Correct: ${stats.correctCount}`);
  console.log(`Accuracy: ${(stats.accuracy * 100).toFixed(1)}%`);
  console.log(`Average Score: ${(stats.averageScore * 100).toFixed(1)}%`);
  console.log(`Tokens/Retrieval: ${Math.round(stats.tokensPerRetrieval)}`);
}

// Run if called directly
if (process.argv[1]?.endsWith('run.ts')) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
