// MemForge — caller metadata survives consolidation
//
// Consolidation rebuilds the warm row's metadata from its own bookkeeping
// (batch_size, oldest, newest, ...). It used to write only those keys, so
// anything the caller attached at add() time was dropped the moment a batch
// consolidated — and because consolidation then deletes the hot rows, the
// values were unrecoverable. An agent tagging memories with a source document,
// a customer id, or the real-world time of an event lost all of it.
//
// The contract these tests pin:
//  - every contributing row's caller keys are preserved, in batch order,
//    under `_source_metadata`
//  - keys the whole batch agrees on are additionally hoisted to the top level,
//    so they stay filterable in SQL
//  - system state and consolidation's own keys are never impersonated
//
// Run: node --import tsx/esm --test tests/consolidation-metadata.test.ts
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

const TEST_AGENT = 'test-agent-consolidation-metadata';
const pool = new Pool({ connectionString: DATABASE_URL });

function makeManager(consolidationBatchSize: number) {
  return new MemoryManager({
    databaseUrl: DATABASE_URL!,
    consolidationBatchSize: 500,
    consolidationThreshold: 1,
    autoRegisterAgents: true,
    consolidationMode: 'concat',
    temporalDecayRate: 0,
    embeddingProvider: new NoOpEmbeddingProvider(),
    llmProvider: null,
    consolidationInnerBatchSize: consolidationBatchSize,
    sleepCycle: {
      tokenBudget: 100_000,
      evictionThreshold: 0.05,
      revisionThreshold: 0.4,
      includeReflection: false,
      weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
    },
  });
}

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

async function warmRows(): Promise<Array<Record<string, unknown>>> {
  const { rows } = await pool.query<{ metadata: Record<string, unknown> }>(
    `SELECT metadata FROM warm_tier WHERE agent_id = $1 ORDER BY id ASC`,
    [TEST_AGENT],
  );
  return rows.map((r) => r.metadata);
}

describe('caller metadata survives consolidation', () => {
  before(cleanup);
  beforeEach(cleanup);
  after(async () => {
    await cleanup();
    await pool.end();
    await closePool();
  });

  it('preserves a single row\'s caller keys', async () => {
    const manager = makeManager(1);
    await manager.add(TEST_AGENT, 'deployment finished', {
      session_date: '2023/05/20 (Sat) 02:21',
      source_document: 'runbook-14',
    });

    await manager.consolidate(TEST_AGENT);

    const [metadata] = await warmRows();
    assert.equal(metadata!['session_date'], '2023/05/20 (Sat) 02:21');
    assert.equal(metadata!['source_document'], 'runbook-14');
  });

  it('keeps every row\'s values when a batch folds several rows together', async () => {
    const manager = makeManager(3);
    for (const date of ['2023/05/20', '2023/05/21', '2023/05/22']) {
      await manager.add(TEST_AGENT, `event on ${date}`, { session_date: date });
    }

    await manager.consolidate(TEST_AGENT);

    const [metadata] = await warmRows();
    assert.deepEqual(
      metadata!['_source_metadata'],
      [{ session_date: '2023/05/20' }, { session_date: '2023/05/21' }, { session_date: '2023/05/22' }],
      'each contributing row keeps its own value, in batch order',
    );
  });

  it('hoists a key only when the whole batch agrees on it', async () => {
    const manager = makeManager(3);
    for (const date of ['2023/05/20', '2023/05/21', '2023/05/22']) {
      await manager.add(TEST_AGENT, `event on ${date}`, { session_date: date, customer_id: 'acme' });
    }

    await manager.consolidate(TEST_AGENT);

    const [metadata] = await warmRows();
    assert.equal(metadata!['customer_id'], 'acme', 'unanimous key is directly filterable');
    assert.equal(
      metadata!['session_date'],
      undefined,
      'a key the rows disagree on must not be hoisted to a single arbitrary value',
    );
  });

  it('does not let a caller key overwrite consolidation\'s own bookkeeping', async () => {
    const manager = makeManager(2);
    for (let i = 0; i < 2; i++) {
      await manager.add(TEST_AGENT, `row ${i}`, { batch_size: 'forged', consolidation_mode: 'forged' });
    }

    await manager.consolidate(TEST_AGENT);

    const [metadata] = await warmRows();
    assert.equal(metadata!['batch_size'], 2, 'system value wins');
    assert.equal(metadata!['consolidation_mode'], 'concat', 'system value wins');
    assert.deepEqual(
      metadata!['_source_metadata'],
      [{ batch_size: 'forged', consolidation_mode: 'forged' }, { batch_size: 'forged', consolidation_mode: 'forged' }],
      'the caller\'s values are still preserved, just not in the system slot',
    );
  });

  it('does not promote hot-tier system state as if the caller had set it', async () => {
    const manager = makeManager(1);
    await manager.add(TEST_AGENT, 'a memory', { visible: 'yes' });
    // _outcome_type is written by MemForge on the hot row, not by the caller.
    await pool.query(
      `UPDATE hot_tier SET metadata = metadata || '{"_outcome_type": "success"}'::jsonb
       WHERE agent_id = $1`,
      [TEST_AGENT],
    );

    await manager.consolidate(TEST_AGENT);

    const [metadata] = await warmRows();
    const preserved = (metadata!['_source_metadata'] as Array<Record<string, unknown>>)[0]!;
    assert.deepEqual(preserved, { visible: 'yes' }, 'only caller-authored keys are carried across');
  });

  it('leaves metadata untouched when the caller supplied none', async () => {
    const manager = makeManager(1);
    await manager.add(TEST_AGENT, 'a memory with no caller metadata');

    await manager.consolidate(TEST_AGENT);

    const [metadata] = await warmRows();
    assert.equal(
      '_source_metadata' in metadata!,
      false,
      'no empty provenance record on rows that never had caller metadata',
    );
  });
});
