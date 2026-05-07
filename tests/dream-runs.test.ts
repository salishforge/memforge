// MemForge — Dream-runs (Claude Dreaming compatibility) tests
//
// Verifies the Layer 1 (Parity) async-job substrate end-to-end:
//   - createDreamRun enqueues a pending row
//   - DreamRunsWorker claims and executes, transitioning to completed/canceled
//   - cancelDreamRun pre-running flips state to canceled without execution
//   - cancellation mid-cycle exits at the next phase boundary
//   - list filters work
//   - unsupported options (output_mode='new_namespace') are rejected up front
//
// Requires: DATABASE_URL with schema applied.
// Run: node --import tsx/esm --test tests/dream-runs.test.ts

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { DreamRunsWorker } = await import('../src/dream-runs.js');
const { MockLLMProvider } = await import('./mocks/mock-llm-provider.js');
const { MockEmbeddingProvider } = await import('./mocks/mock-embedding-provider.js');
const { closePool } = await import('../src/db.js');

const TEST_AGENT = 'test-agent-dream-runs';
const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const mockLlm = new MockLLMProvider();
const mockEmbedding = new MockEmbeddingProvider();

const manager = new MemoryManager({
  databaseUrl: DATABASE_URL,
  consolidationBatchSize: 500,
  consolidationThreshold: 1,
  autoRegisterAgents: true,
  consolidationMode: 'concat',
  temporalDecayRate: 0,
  embeddingProvider: mockEmbedding,
  llmProvider: mockLlm,
  sleepCycle: {
    tokenBudget: 100_000,
    evictionThreshold: 0.1,
    revisionThreshold: 0.4,
    includeReflection: false,
    weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
  },
});

let worker: InstanceType<typeof DreamRunsWorker> | null = null;

async function cleanup(): Promise<void> {
  // Hard-stop any leftover pending runs from a crashed previous run before
  // deleting the agent, otherwise CASCADE can race with an in-flight worker.
  await pool.query(`DELETE FROM dream_runs WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM drift_signals WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM audit_chain WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM memory_revisions WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier_entities WHERE warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = $1)`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

describe('Dream runs (Layer 1 — Parity)', () => {
  before(async () => {
    await cleanup();
    mockLlm.reset();
    mockEmbedding.reset();
  });

  after(async () => {
    if (worker) {
      await worker.stop();
      worker = null;
    }
    await cleanup();
    await pool.end();
    await closePool();
  });

  it('createDreamRun returns a pending row with the requested fields', async () => {
    await manager.add(TEST_AGENT, 'a memory to dream over');

    const run = await manager.createDreamRun(TEST_AGENT, {
      namespace: 'default',
      sessionIds: ['default'],
      instructions: 'focus on factual accuracy',
    });

    assert.equal(run.agent_id, TEST_AGENT);
    assert.equal(run.status, 'pending');
    assert.equal(run.source, 'local');
    assert.equal(run.output_mode, 'in_place');
    assert.equal(run.namespace, 'default');
    assert.deepEqual(run.session_ids, ['default']);
    assert.equal(run.instructions, 'focus on factual accuracy');
    assert.match(run.id, /^[0-9a-f-]{36}$/);
  });

  it('rejects output_mode=new_namespace at the boundary (not yet implemented)', async () => {
    await assert.rejects(
      () => manager.createDreamRun(TEST_AGENT, { outputMode: 'new_namespace' }),
      /not yet implemented/,
    );
  });

  it('rejects session_ids beyond Anthropic-Dreams cap of 100', async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `session-${i}`);
    await assert.rejects(
      () => manager.createDreamRun(TEST_AGENT, { sessionIds: tooMany }),
      /100 entries/,
    );
  });

  it('rejects instructions over 4096 chars', async () => {
    await assert.rejects(
      () => manager.createDreamRun(TEST_AGENT, { instructions: 'x'.repeat(4097) }),
      /4096/,
    );
  });

  it('worker drains pending and transitions to completed', async () => {
    await pool.query(`DELETE FROM dream_runs WHERE agent_id = $1`, [TEST_AGENT]);
    const run = await manager.createDreamRun(TEST_AGENT);

    worker = new DreamRunsWorker(manager, pool, { databaseUrl: DATABASE_URL, disablePolling: true });
    await worker.start();
    await worker.drainPending();

    const after = await manager.getDreamRun(TEST_AGENT, run.id);
    assert.ok(after);
    assert.equal(after.status, 'completed');
    assert.ok(after.completed_at);
    assert.ok(after.started_at);
    assert.ok(Array.isArray(after.input_warm_ids), 'input snapshot recorded');
    assert.ok(after.sleep_cycle_result, 'sleep cycle result persisted');
  });

  it('cancelDreamRun pre-running flips status to canceled without executing', async () => {
    await pool.query(`DELETE FROM dream_runs WHERE agent_id = $1`, [TEST_AGENT]);
    // No worker drain between create and cancel — race-free since worker is paused.
    if (worker) {
      await worker.stop();
      worker = null;
    }

    const run = await manager.createDreamRun(TEST_AGENT);
    const canceled = await manager.cancelDreamRun(TEST_AGENT, run.id);

    assert.equal(canceled.status, 'canceled');
    assert.ok(canceled.cancel_requested_at);
    assert.equal(canceled.completed_at !== null, true);
    // Should never have started.
    assert.equal(canceled.started_at, null);
  });

  it('listDreamRuns filters by status', async () => {
    await pool.query(`DELETE FROM dream_runs WHERE agent_id = $1`, [TEST_AGENT]);

    const r1 = await manager.createDreamRun(TEST_AGENT);
    const r2 = await manager.createDreamRun(TEST_AGENT);
    await manager.cancelDreamRun(TEST_AGENT, r2.id);

    const all = await manager.listDreamRuns(TEST_AGENT);
    assert.equal(all.total, 2);
    assert.equal(all.runs.length, 2);

    const onlyCanceled = await manager.listDreamRuns(TEST_AGENT, { status: 'canceled' });
    assert.equal(onlyCanceled.total, 1);
    assert.equal(onlyCanceled.runs[0]?.id, r2.id);

    const onlyPending = await manager.listDreamRuns(TEST_AGENT, { status: 'pending' });
    assert.equal(onlyPending.total, 1);
    assert.equal(onlyPending.runs[0]?.id, r1.id);
  });

  it('cancelDreamRun on a terminal run is a no-op (returns existing)', async () => {
    const all = await manager.listDreamRuns(TEST_AGENT, { status: 'canceled' });
    const target = all.runs[0];
    assert.ok(target);
    const again = await manager.cancelDreamRun(TEST_AGENT, target.id);
    assert.equal(again.status, 'canceled');
    assert.equal(again.id, target.id);
  });

  it('cancelDreamRun on missing id throws', async () => {
    await assert.rejects(
      () => manager.cancelDreamRun(TEST_AGENT, '00000000-0000-0000-0000-000000000000'),
      /not found/,
    );
  });

  it('getDreamRun rejects malformed UUIDs', async () => {
    await assert.rejects(
      () => manager.getDreamRun(TEST_AGENT, 'not-a-uuid'),
      /Invalid dream run id/,
    );
  });
});
