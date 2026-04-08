// LongMemEval benchmark orchestrator
//
// Runs the full pipeline: download → ingest → evaluate → report
// Usage: npx tsx benchmarks/longmemeval/run.ts

import { performance } from 'node:perf_hooks';
import { loadConfig } from '../lib/config.js';
import { main as download } from './download.js';
import { main as ingest } from './ingest.js';
import { main as evaluate } from './evaluate.js';
import { main as report } from './report.js';

async function run(): Promise<void> {
  const config = loadConfig();
  const totalStart = performance.now();

  console.log('╔══════════════════════════════════════════╗');
  console.log('║  MemForge LongMemEval Benchmark Runner   ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Questions: ${config.questionLimit}`);
  console.log(`Modes: ${config.queryModes.join(', ')}`);
  console.log(`Consolidation: ${config.consolidationMode}`);
  console.log(`Concurrency: ${config.concurrency}`);
  console.log('');

  // Step 1: Download
  console.log('─── Step 1/4: Download Dataset ───');
  await download();

  // Step 2: Ingest
  console.log('\n─── Step 2/4: Ingest Sessions ───');
  await ingest(config);

  // Step 3: Evaluate (per mode)
  console.log('\n─── Step 3/4: Evaluate Retrieval ───');
  for (const mode of config.queryModes) {
    await evaluate(config, mode);
  }

  // Step 4: Report
  console.log('\n─── Step 4/4: Generate Report ───');
  await report(config);

  const totalMs = performance.now() - totalStart;
  console.log(`\nBenchmark complete in ${(totalMs / 1000).toFixed(1)}s`);
  console.log('Results: benchmarks/RESULTS.md');
}

run().catch((err) => {
  console.error('Benchmark failed:', (err as Error).message);
  process.exit(1);
});
