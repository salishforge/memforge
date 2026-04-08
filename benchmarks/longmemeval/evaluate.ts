// LongMemEval evaluation pipeline
//
// Runs queries against ingested data, computes Recall@k per question.
// Usage: npx tsx benchmarks/longmemeval/evaluate.ts [--modes=keyword,hybrid]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadConfig, type BenchmarkConfig } from '../lib/config.js';
import { extractSessionIds, recallAtK } from '../lib/metrics.js';
import type { LongMemEvalInstance, QuestionResult, IngestManifest } from './types.js';

async function createClient(config: BenchmarkConfig) {
  const { MemForgeClient } = await import('../../src/client.js');
  return new MemForgeClient({
    baseUrl: config.memforgeUrl,
    token: config.memforgeToken,
  });
}

async function evaluateQuestion(
  client: Awaited<ReturnType<typeof createClient>>,
  instance: LongMemEvalInstance,
  agentId: string,
  questionIndex: number,
  mode: string,
  config: BenchmarkConfig,
  ingestMs: number,
  consolidateMs: number,
): Promise<QuestionResult> {
  const maxK = Math.max(...config.queryTopK);

  const queryStart = performance.now();
  const results = await client.query(agentId, {
    q: instance.question,
    limit: maxK,
    mode: mode as 'keyword' | 'semantic' | 'hybrid',
  });
  const queryMs = performance.now() - queryStart;

  // Extract session IDs from results in rank order
  const retrievedSessionIds: string[] = [];
  for (const result of results) {
    const content = typeof result === 'object' && result !== null && 'content' in result
      ? (result as { content: string }).content
      : '';
    const extracted = extractSessionIds(content);
    for (const id of extracted) {
      if (!retrievedSessionIds.includes(id)) {
        retrievedSessionIds.push(id);
      }
    }
  }

  // Compute Recall@k for each k
  const recallAt: Record<number, number> = {};
  const answerIds = instance.answer_session_ids.map(String);
  for (const k of config.queryTopK) {
    // For Recall@k, use session IDs from the top-k warm-tier results
    // Since one warm-tier result may contain multiple sessions (batch consolidation),
    // we extract all session IDs from results[0..k-1]
    const topKSessionIds: string[] = [];
    for (let i = 0; i < Math.min(k, results.length); i++) {
      const r = results[i];
      const content = typeof r === 'object' && r !== null && 'content' in r
        ? (r as { content: string }).content
        : '';
      for (const sid of extractSessionIds(content)) {
        if (!topKSessionIds.includes(sid)) topKSessionIds.push(sid);
      }
    }
    recallAt[k] = recallAtK(topKSessionIds, answerIds, topKSessionIds.length);
  }

  return {
    questionIndex,
    questionType: instance.question_type ?? 'unknown',
    question: instance.question,
    expectedAnswer: instance.answer,
    answerSessionIds: instance.answer_session_ids,
    retrievedSessionIds,
    recallAt,
    latency: { ingestMs, consolidateMs, queryMs },
    queryMode: mode,
    resultCount: results.length,
  };
}

export async function main(configOverride?: BenchmarkConfig, modeOverride?: string): Promise<QuestionResult[]> {
  const config = configOverride ?? loadConfig();

  // Parse CLI args
  for (const arg of process.argv.slice(2)) {
    const modesMatch = arg.match(/^--modes=(.+)$/);
    if (modesMatch?.[1]) config.queryModes = modesMatch[1].split(',').map((m) => m.trim());
  }

  const modes = modeOverride ? [modeOverride] : config.queryModes;

  console.log('=== LongMemEval Evaluation ===');
  console.log(`Modes: ${modes.join(', ')}, Top-k: ${config.queryTopK.join(', ')}`);

  // Load manifest
  const manifestPath = join(config.resultsDir, 'ingest-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Ingest manifest not found at ${manifestPath}. Run ingest first.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as IngestManifest;

  // Load dataset
  const dataFile = join(config.datasetDir, 'longmemeval_s.json');
  const dataset = JSON.parse(readFileSync(dataFile, 'utf-8')) as LongMemEvalInstance[];

  const client = await createClient(config);
  const allResults: QuestionResult[] = [];

  for (const mode of modes) {
    console.log(`\nEvaluating mode: ${mode}`);

    // Check for partial results to resume from
    const partialPath = join(config.resultsDir, `eval-partial-${mode}.json`);
    let partial: QuestionResult[] = [];
    if (existsSync(partialPath)) {
      partial = JSON.parse(readFileSync(partialPath, 'utf-8')) as QuestionResult[];
      console.log(`  Resuming from ${partial.length} partial results`);
    }
    const completedIndices = new Set(partial.map((r) => r.questionIndex));

    const modeResults: QuestionResult[] = [...partial];
    let completed = partial.length;

    for (const agent of manifest.agents) {
      if (completedIndices.has(agent.questionIndex)) continue;

      const instance = dataset[agent.questionIndex];
      if (!instance) continue;

      const result = await evaluateQuestion(
        client, instance, agent.agentId, agent.questionIndex,
        mode, config, agent.ingestMs, agent.consolidateMs,
      );
      modeResults.push(result);
      completed++;

      if (completed % 10 === 0 || completed === manifest.agents.length) {
        console.log(`  [${completed}/${manifest.agents.length}]`);
        // Save partial progress
        writeFileSync(partialPath, JSON.stringify(modeResults, null, 2), 'utf-8');
      }
    }

    // Save final results
    mkdirSync(config.resultsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultPath = join(config.resultsDir, `eval-${mode}-${timestamp}.json`);
    writeFileSync(resultPath, JSON.stringify(modeResults, null, 2), 'utf-8');
    console.log(`  Results saved to ${resultPath}`);

    // Clean up partial file
    if (existsSync(partialPath)) {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(partialPath);
    }

    allResults.push(...modeResults);
  }

  return allResults;
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('evaluate.ts')) {
  main().catch((err) => {
    console.error('Evaluation failed:', (err as Error).message);
    process.exit(1);
  });
}
