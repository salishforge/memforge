// LongMemEval QA Ingest Helper
//
// Reuses existing ingest logic for QA evaluation

import type { BenchmarkConfig } from '../lib/config.js';
import type { LongMemEvalInstance } from './types.js';
import type { MemForgeClient } from '../../src/client.js';

export async function ingest(
  client: MemForgeClient,
  agentId: string,
  instances: LongMemEvalInstance[],
  config: BenchmarkConfig,
): Promise<void> {
  const { performance } = await import('node:perf_hooks');
  const { writeFileSync, existsSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');

  const resultsDir = join(process.cwd(), 'benchmarks', 'longmemeval-qa', 'results');
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  let ingested = 0;
  const errors: Array<{ index: number; error: string }> = [];
  // Accumulates across every instance — the manifest below reports the full
  // set. Previously declared inside the loop and read after it, which is a
  // ReferenceError at runtime.
  const allSessions = new Set<number>();

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    if (!instance) continue;

    try {
      // Ingest all haystack sessions for this question
      for (const session of instance.haystack_sessions) {
        const sessionId = instance.haystack_session_ids[instance.haystack_sessions.indexOf(session)];
        if (!sessionId) continue;

        allSessions.add(sessionId);

        // Convert session to text with marker
        const sessionText = session
          .map((turn) => `[SESSION_ID:${sessionId}] ${turn.role.toUpperCase()}: ${turn.content}`)
          .join('\n\n');

        await client.add(agentId, sessionText);
      }

      ingested++;

      // Save incremental progress
      if ((i + 1) % 10 === 0) {
        const manifestPath = join(resultsDir, 'qa-ingest-progress.json');
        writeFileSync(
          manifestPath,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            ingested,
            total: instances.length,
            errors,
          }, null, 2),
        );
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ index: i, error });
      console.error(`Ingest error Q${i}:`, error);
    }
  }

  // Final manifest
  const manifestPath = join(resultsDir, 'qa-ingest-manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      agentId,
      ingested,
      total: instances.length,
      errors,
      allSessions: Array.from(allSessions),
    }, null, 2),
  );

  if (errors.length > 0) {
    console.warn(`Ingest completed with ${errors.length} errors`);
  }
}
