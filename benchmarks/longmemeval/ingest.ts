// LongMemEval ingestion pipeline
//
// Loads dataset, creates agents in MemForge, ingests sessions, consolidates.
// Usage: npx tsx benchmarks/longmemeval/ingest.ts [--limit=50]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadConfig, type BenchmarkConfig } from '../lib/config.js';
import { createLimiter } from '../lib/concurrency.js';
import type { LongMemEvalInstance, IngestManifest } from './types.js';

// Dynamic import to avoid module-level side effects
async function createClient(config: BenchmarkConfig) {
  const { MemForgeClient } = await import('../../src/client.js');
  return new MemForgeClient({
    baseUrl: config.memforgeUrl,
    token: config.memforgeToken,
  });
}

async function ingestQuestion(
  client: Awaited<ReturnType<typeof createClient>>,
  instance: LongMemEvalInstance,
  questionIndex: number,
  config: BenchmarkConfig,
): Promise<{ agentId: string; sessionsIngested: number; ingestMs: number; consolidateMs: number }> {
  const agentId = `${config.agentPrefix}${questionIndex}`;

  // Clear any prior state
  try {
    await client.clear(agentId);
  } catch {
    // Agent may not exist — that's fine
  }

  // Ingest each session
  const ingestStart = performance.now();
  let sessionsIngested = 0;

  for (let i = 0; i < instance.haystack_sessions.length; i++) {
    const session = instance.haystack_sessions[i];
    if (!session) continue;

    const sessionId = instance.haystack_session_ids[i];
    const sessionDate = instance.haystack_dates[i];

    // Concatenate turns with role labels
    const turnText = session
      .map((turn) => `[${turn.role}]: ${turn.content}`)
      .join('\n');

    // Prefix with session marker for scoring
    const taggedContent = `[SESSION_ID:${sessionId}]\n${turnText}`;

    await client.add(agentId, taggedContent, {
      session_id: sessionId,
      session_date: sessionDate,
      session_index: i,
      benchmark: 'longmemeval',
    });
    sessionsIngested++;
  }

  const ingestMs = performance.now() - ingestStart;

  // Consolidate
  const consolidateStart = performance.now();
  await client.consolidate(agentId, config.consolidationMode);
  const consolidateMs = performance.now() - consolidateStart;

  return { agentId, sessionsIngested, ingestMs, consolidateMs };
}

export async function main(configOverride?: BenchmarkConfig): Promise<IngestManifest> {
  const config = configOverride ?? loadConfig();

  // Parse CLI args
  for (const arg of process.argv.slice(2)) {
    const limitMatch = arg.match(/^--limit=(\d+)$/);
    if (limitMatch?.[1]) config.questionLimit = parseInt(limitMatch[1], 10);
  }

  console.log('=== LongMemEval Ingestion ===');
  console.log(`Server: ${config.memforgeUrl}`);
  console.log(`Limit: ${config.questionLimit}, Concurrency: ${config.concurrency}`);

  // Load dataset
  const dataFile = join(config.datasetDir, 'longmemeval_s.json');
  const dataset = JSON.parse(readFileSync(dataFile, 'utf-8')) as LongMemEvalInstance[];
  const questions = dataset.slice(config.questionOffset, config.questionOffset + config.questionLimit);
  console.log(`Loaded ${dataset.length} instances, processing ${questions.length}`);

  // Health check
  const client = await createClient(config);
  try {
    await client.health();
    console.log('MemForge server is reachable');
  } catch (err) {
    throw new Error(`Cannot reach MemForge at ${config.memforgeUrl}: ${(err as Error).message}`);
  }

  // Ingest with concurrency limit
  const limit = createLimiter(config.concurrency);
  const agents: IngestManifest['agents'] = [];
  let completed = 0;
  const totalStart = performance.now();

  const promises = questions.map((instance, i) => {
    const questionIndex = config.questionOffset + i;
    return limit(async () => {
      const result = await ingestQuestion(client, instance, questionIndex, config);
      agents.push({
        agentId: result.agentId,
        questionIndex,
        sessionsIngested: result.sessionsIngested,
        ingestMs: result.ingestMs,
        consolidateMs: result.consolidateMs,
      });
      completed++;
      if (completed % 10 === 0 || completed === questions.length) {
        const elapsed = ((performance.now() - totalStart) / 1000).toFixed(1);
        console.log(`  [${completed}/${questions.length}] ${elapsed}s elapsed`);
      }
    });
  });

  await Promise.all(promises);

  // Save manifest
  mkdirSync(config.resultsDir, { recursive: true });
  const manifest: IngestManifest = {
    timestamp: new Date().toISOString(),
    agentPrefix: config.agentPrefix,
    questionCount: questions.length,
    consolidationMode: config.consolidationMode,
    agents: agents.sort((a, b) => a.questionIndex - b.questionIndex),
  };

  const manifestPath = join(config.resultsDir, 'ingest-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Manifest saved to ${manifestPath}`);

  const totalMs = performance.now() - totalStart;
  const totalSessions = agents.reduce((s, a) => s + a.sessionsIngested, 0);
  console.log(`Ingested ${totalSessions} sessions across ${questions.length} questions in ${(totalMs / 1000).toFixed(1)}s`);

  return manifest;
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ingest.ts')) {
  main().catch((err) => {
    console.error('Ingestion failed:', (err as Error).message);
    process.exit(1);
  });
}
