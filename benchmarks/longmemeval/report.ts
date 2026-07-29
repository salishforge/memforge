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
  // Emitted here rather than hand-written into RESULTS.md: that file is
  // regenerated on every run, so narrative added to it is silently lost.
  lines.push('## How to read these numbers');
  lines.push('');
  lines.push('**Retrieval recall is not QA accuracy.** LongMemEval\'s headline metric is');
  lines.push('end-to-end QA (retrieve → generate → judge); the tables below measure only');
  lines.push('whether a gold session was retrieved. Recall runs 20–40 points above QA on');
  lines.push('the same system, so these are not comparable to figures published by systems');
  lines.push('reporting QA accuracy. For the paper-comparable QA number see');
  lines.push('`benchmarks/OFFICIAL-RESULTS.md`.');
  lines.push('');
  lines.push('**Recall@k counts a hit if *any* gold session is retrieved.** That is');
  lines.push('LongMemEval\'s definition, and it flatters multi-evidence questions:');
  lines.push('`multi-session` questions need ~2.6 gold sessions on average, and scoring');
  lines.push('them 100% when one of three is present overstates what reached the reader.');
  lines.push('Prefer complete-evidence recall when reasoning about what a reader can');
  lines.push('actually answer.');
  lines.push('');
  lines.push('**QA accuracy depends on the reader model and on how much context it gets.**');
  lines.push('Measured across three reader families on this corpus, identical retrieval');
  lines.push('produced 56%–70% QA depending on the model, and the optimal context width');
  lines.push('differed *in direction* between them. A QA figure without its reader and');
  lines.push('context width attached is not meaningful.');
  lines.push('');

  for (const report of reports) {
    lines.push(`## LongMemEval — ${report.queryMode} mode`);
    lines.push('');
    // A partial run must never read like the official measurement. The
    // generator overwrites RESULTS.md in place, so without this a 20-question
    // smoke test silently replaces the published page.
    const FULL_DATASET = 500;
    const isFullRun = report.questionsEvaluated >= FULL_DATASET;
    const sampling = process.env['BENCHMARK_SAMPLE'] === 'sequential' ? 'sequential' : 'stratified';
    if (!isFullRun) {
      lines.push(`> ## ⚠️ Partial run — not an official result`);
      lines.push('>');
      lines.push(`> ${report.questionsEvaluated} of ${FULL_DATASET} questions (${sampling} sample).`);
      lines.push('> Reported for development iteration only. Publishable figures require a');
      lines.push('> full 500-question run; cite nothing from this page until then.');
      lines.push('');
    }
    lines.push(`- Questions evaluated: ${report.questionsEvaluated}${isFullRun ? '' : ` of ${FULL_DATASET} (${sampling} sample)`}`);
    lines.push(`- Consolidation mode: ${report.consolidationMode}`);
    lines.push(`- Timestamp: ${report.timestamp}`);
    lines.push('');

    // Overall Recall table
    lines.push('### Retrieval Quality');
    lines.push('');
    lines.push('> **Recall@k (sessions)** is the comparable metric: a hit means a gold');
    lines.push('> session is among the first k distinct sessions by rank — LongMemEval\'s');
    lines.push('> definition. **Recall@k (rows)** counts a hit anywhere inside the top-k');
    lines.push('> retrieved rows; because consolidation packs multiple sessions per row it');
    lines.push('> is strictly more generous and is NOT comparable to published figures.');
    lines.push('');
    lines.push('| Metric | Sessions (comparable) | Rows (native) |');
    lines.push('|--------|----------------------|---------------|');
    const ks = Object.keys(report.overall.recallAtSessions).map(Number).sort((a, b) => a - b);
    for (const k of ks) {
      const sess = formatPct(report.overall.recallAtSessions[k] ?? 0);
      const rows = formatPct(report.overall.recallAtRows[k] ?? 0);
      lines.push(`| Recall@${k} | ${sess} | ${rows} |`);
    }
    lines.push('');
    lines.push(`Sessions packed per retrieved row: **${report.overall.sessionsPerRow.toFixed(1)}**`);
    lines.push('(1.0 means rows and sessions are 1:1 and the two columns converge.)');
    lines.push('');

    // Baseline comparison — only the sessions column is on the same footing.
    lines.push('**Baselines (compare against the Sessions column only):** Hippo 74.0% R@5');
    lines.push('(BM25 keyword), Zep +18.5% over full-context');
    lines.push('');

    // Per-category table
    lines.push('### Per-Category Breakdown');
    lines.push('');
    const categories = Object.entries(report.perCategory).sort(([a], [b]) => a.localeCompare(b));
    if (categories.length > 0) {
      const headerKs = ks.map((k) => `R@${k} (sessions)`).join(' | ');
      lines.push(`| Category | Count | ${headerKs} |`);
      lines.push(`|----------|-------|${ks.map(() => '------').join('|')}|`);
      for (const [cat, data] of categories) {
        const recalls = ks.map((k) => formatPct(data.recallAtSessions[k] ?? 0)).join(' | ');
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
