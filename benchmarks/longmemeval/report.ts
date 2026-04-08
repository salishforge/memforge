// LongMemEval report generator
//
// Reads evaluation results and generates a markdown report.
// Usage: npx tsx benchmarks/longmemeval/report.ts

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, type BenchmarkConfig } from '../lib/config.js';
import { aggregateScores, latencyStats } from '../lib/metrics.js';
import type { QuestionResult, BenchmarkReport, LatencyStats } from './types.js';

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function latencyRow(label: string, stats: LatencyStats): string {
  return `| ${label} | ${formatMs(stats.p50)} | ${formatMs(stats.p95)} | ${formatMs(stats.mean)} |`;
}

function generateMarkdown(reports: BenchmarkReport[]): string {
  const lines: string[] = [];
  const now = new Date().toISOString().split('T')[0];

  lines.push('# MemForge Benchmark Results');
  lines.push('');
  lines.push(`Generated: ${now}`);
  lines.push('');

  for (const report of reports) {
    lines.push(`## LongMemEval — ${report.queryMode} mode`);
    lines.push('');
    lines.push(`- Questions evaluated: ${report.questionsEvaluated}`);
    lines.push(`- Consolidation mode: ${report.consolidationMode}`);
    lines.push(`- Timestamp: ${report.timestamp}`);
    lines.push('');

    // Overall Recall table
    lines.push('### Retrieval Quality');
    lines.push('');
    lines.push('| Metric | Score |');
    lines.push('|--------|-------|');
    const ks = Object.keys(report.overall.recallAt).map(Number).sort((a, b) => a - b);
    for (const k of ks) {
      lines.push(`| Recall@${k} | ${formatPct(report.overall.recallAt[k] ?? 0)} |`);
    }
    lines.push('');

    // Baseline comparison
    lines.push('**Baselines:** Hippo 74.0% R@5 (BM25 keyword), Zep +18.5% over full-context');
    lines.push('');

    // Per-category table
    lines.push('### Per-Category Breakdown');
    lines.push('');
    const categories = Object.entries(report.perCategory).sort(([a], [b]) => a.localeCompare(b));
    if (categories.length > 0) {
      const headerKs = ks.map((k) => `R@${k}`).join(' | ');
      lines.push(`| Category | Count | ${headerKs} |`);
      lines.push(`|----------|-------|${ks.map(() => '------').join('|')}|`);
      for (const [cat, data] of categories) {
        const recalls = ks.map((k) => formatPct(data.recallAt[k] ?? 0)).join(' | ');
        lines.push(`| ${cat} | ${data.count} | ${recalls} |`);
      }
    }
    lines.push('');

    // Latency table
    lines.push('### Latency');
    lines.push('');
    lines.push('| Operation | p50 | p95 | Mean |');
    lines.push('|-----------|-----|-----|------|');
    lines.push(latencyRow('Query', report.overall.queryLatency));
    lines.push(latencyRow('Ingest (per question)', report.overall.ingestLatency));
    lines.push('');
  }

  // Methodology
  lines.push('---');
  lines.push('');
  lines.push('## Methodology');
  lines.push('');
  lines.push('- **Dataset:** [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025)');
  lines.push('- **Scoring:** Session Recall@k — does the top-k retrieval results contain content from the gold answer sessions?');
  lines.push('- **Ingestion:** Each session tagged with `[SESSION_ID:xxx]` marker, consolidated via MemForge consolidation pipeline');
  lines.push('- **Consolidation:** Sessions batched (up to 50 per warm-tier row) with concat or LLM summarize mode');
  lines.push('- **Search:** MemForge query() with keyword (PostgreSQL FTS + trigram), semantic (pgvector HNSW), or hybrid (RRF) mode');
  lines.push('');

  return lines.join('\n');
}

export async function main(configOverride?: BenchmarkConfig): Promise<void> {
  const config = configOverride ?? loadConfig();

  console.log('=== LongMemEval Report Generation ===');

  // Find all eval result files
  const files = readdirSync(config.resultsDir).filter((f) => f.startsWith('eval-') && f.endsWith('.json'));
  if (files.length === 0) {
    throw new Error(`No evaluation results found in ${config.resultsDir}. Run evaluate first.`);
  }

  // Group by mode (take latest per mode)
  const byMode = new Map<string, string>();
  for (const file of files.sort()) {
    const modeMatch = file.match(/^eval-(\w+)-/);
    if (modeMatch?.[1]) {
      byMode.set(modeMatch[1], file);
    }
  }

  const reports: BenchmarkReport[] = [];
  for (const [mode, file] of byMode) {
    const results = JSON.parse(readFileSync(join(config.resultsDir, file), 'utf-8')) as QuestionResult[];
    console.log(`  ${mode}: ${results.length} results from ${file}`);

    const agg = aggregateScores(results, config.queryTopK);

    reports.push({
      timestamp: new Date().toISOString(),
      memforgeVersion: '2.1.0',
      questionsEvaluated: results.length,
      queryMode: mode,
      consolidationMode: config.consolidationMode,
      overall: agg.overall,
      perCategory: agg.perCategory,
      results,
    });
  }

  // Generate markdown
  const markdown = generateMarkdown(reports);

  mkdirSync(config.resultsDir, { recursive: true });
  const reportPath = join('benchmarks', 'RESULTS.md');
  writeFileSync(reportPath, markdown, 'utf-8');
  console.log(`Report written to ${reportPath}`);

  // Also save structured JSON
  const jsonPath = join(config.resultsDir, 'report.json');
  writeFileSync(jsonPath, JSON.stringify(reports, null, 2), 'utf-8');
  console.log(`Structured data saved to ${jsonPath}`);
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('report.ts')) {
  main().catch((err) => {
    console.error('Report generation failed:', (err as Error).message);
    process.exit(1);
  });
}
