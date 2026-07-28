// MemForge — event time vs ingestion time
//
// time_start/time_end/created_at all record when MemForge *stored* a memory.
// For anything imported, backfilled, or replayed that is not when the event
// *happened*, and every temporal feature reads those columns: the after/before
// query filters, temporal proximity scoring, and the timeline endpoint. A 2023
// conversation imported today would answer "what happened this week?".
//
// occurred_at records valid time alongside the existing transaction time. It is
// nullable on purpose — these tests pin both that it is honoured when supplied
// and that its absence leaves prior behaviour exactly as it was, because every
// memory written before v3.13 has NULL there.
//
// Run: node --import tsx/esm --test tests/bitemporal.test.ts
// Requires: DATABASE_URL

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const TEST_AGENT = 'test-agent-bitemporal';
const pool = new Pool({ connectionString: DATABASE_URL });

const manager = new MemoryManager({
  databaseUrl: DATABASE_URL,
  consolidationBatchSize: 500,
  consolidationThreshold: 1,
  autoRegisterAgents: true,
  consolidationMode: 'concat',
  temporalDecayRate: 0,
  embeddingProvider: new NoOpEmbeddingProvider(),
  llmProvider: null,
  consolidationInnerBatchSize: 1,
  sleepCycle: {
    tokenBudget: 100_000,
    evictionThreshold: 0.05,
    revisionThreshold: 0.4,
    includeReflection: false,
    weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
  },
});

// Far enough back that it cannot be confused with an ingestion timestamp.
const EVENT_TIME = new Date('2023-05-20T02:21:00Z');

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

describe('event time is recorded and honoured', () => {
  before(cleanup);
  beforeEach(cleanup);
  after(async () => {
    await cleanup();
    await pool.end();
    await closePool();
  });

  it('carries a supplied event time from hot tier through consolidation', async () => {
    await manager.add(TEST_AGENT, 'I visited the museum', {}, 'neutral', undefined, undefined, undefined, undefined, EVENT_TIME);

    const hot = await pool.query<{ occurred_at: Date | null }>(
      `SELECT occurred_at FROM hot_tier WHERE agent_id = $1`, [TEST_AGENT],
    );
    assert.equal(hot.rows[0]!.occurred_at?.toISOString(), EVENT_TIME.toISOString());

    await manager.consolidate(TEST_AGENT);

    const warm = await pool.query<{ occurred_at: Date | null; time_start: Date }>(
      `SELECT occurred_at, time_start FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT],
    );
    assert.equal(warm.rows[0]!.occurred_at?.toISOString(), EVENT_TIME.toISOString());
    assert.notEqual(
      warm.rows[0]!.time_start.getUTCFullYear(),
      EVENT_TIME.getUTCFullYear(),
      'ingestion time must still record when we stored it, not when it happened',
    );
  });

  it('leaves occurred_at null when the caller does not supply one', async () => {
    await manager.add(TEST_AGENT, 'no event time given');
    await manager.consolidate(TEST_AGENT);

    const { rows } = await pool.query<{ occurred_at: Date | null }>(
      `SELECT occurred_at FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT],
    );
    assert.equal(rows[0]!.occurred_at, null, 'pre-v3.13 rows must keep behaving as before');
  });

  it('filters on when the event happened, not when it was stored', async () => {
    await manager.add(TEST_AGENT, 'museum visit long ago', {}, 'neutral', undefined, undefined, undefined, undefined, EVENT_TIME);
    await manager.consolidate(TEST_AGENT);

    // Ingested seconds ago, so an ingestion-time filter would match this.
    const recent = await manager.query(TEST_AGENT, {
      q: 'museum visit',
      after: new Date(Date.now() - 60 * 60 * 1000),
    });
    assert.equal(recent.length, 0, 'a 2023 event must not answer "in the last hour"');

    const historical = await manager.query(TEST_AGENT, {
      q: 'museum visit',
      after: new Date('2023-01-01T00:00:00Z'),
      before: new Date('2023-12-31T23:59:59Z'),
    });
    assert.equal(historical.length, 1, 'it must be found in the window it actually falls in');
  });

  it('still finds memories with no event time using ingestion time', async () => {
    await manager.add(TEST_AGENT, 'stored just now with no event time');
    await manager.consolidate(TEST_AGENT);

    const results = await manager.query(TEST_AGENT, {
      q: 'stored just now',
      after: new Date(Date.now() - 60 * 60 * 1000),
    });

    assert.equal(results.length, 1, 'the COALESCE fallback must preserve existing behaviour');
  });

  it('takes the earliest event time when a batch merges several rows', async () => {
    const batched = new MemoryManager({
      databaseUrl: DATABASE_URL!,
      consolidationBatchSize: 500,
      consolidationThreshold: 1,
      autoRegisterAgents: true,
      consolidationMode: 'concat',
      temporalDecayRate: 0,
      embeddingProvider: new NoOpEmbeddingProvider(),
      llmProvider: null,
      consolidationInnerBatchSize: 3,
      sleepCycle: {
        tokenBudget: 100_000, evictionThreshold: 0.05, revisionThreshold: 0.4, includeReflection: false,
        weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
      },
    });
    const dates = [new Date('2023-07-01T00:00:00Z'), new Date('2023-05-20T00:00:00Z'), new Date('2023-09-15T00:00:00Z')];
    for (const d of dates) {
      await batched.add(TEST_AGENT, `event on ${d.toISOString()}`, {}, 'neutral', undefined, undefined, undefined, undefined, d);
    }

    await batched.consolidate(TEST_AGENT);

    const { rows } = await pool.query<{ occurred_at: Date }>(
      `SELECT occurred_at FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT],
    );
    assert.equal(
      rows[0]!.occurred_at.toISOString(),
      '2023-05-20T00:00:00.000Z',
      'a merged memory begins when its earliest contributing event did',
    );
  });
});
