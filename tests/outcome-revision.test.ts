// MemForge — Outcome-driven revision priorities
//
// Validates that memories with repeated negative retrieval outcomes
// enter the revision queue (Phase 2) regardless of current confidence,
// and that chronic negatives drift confidence down over cycles (Phase 1).
//
// Run: node --import tsx/esm --test tests/outcome-revision.test.ts
// Requires DATABASE_URL.

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { SleepCycleEngine } = await import('../src/sleep-cycle.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const TEST_AGENT = 'test-agent-outcome-revision';
const pool = new Pool({ connectionString: DATABASE_URL });

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM drift_signals WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

async function seedMemory(content: string, confidence: number): Promise<bigint> {
  const { rows } = await pool.query<{ id: bigint }>(
    `INSERT INTO warm_tier (agent_id, content, confidence, importance, time_start, time_end)
     VALUES ($1, $2, $3, 0.8, now(), now())
     RETURNING id`,
    [TEST_AGENT, content, confidence],
  );
  return rows[0]!.id;
}

async function seedOutcome(warmId: bigint, outcome: 'positive' | 'negative', daysAgo = 0): Promise<void> {
  await pool.query(
    `INSERT INTO retrieval_log (agent_id, warm_tier_id, query_text, query_mode, rank_position, outcome, created_at, feedback_at)
     VALUES ($1, $2, 'test', 'hybrid', 1, $3, now() - interval '1 day' * $4, now())`,
    [TEST_AGENT, warmId, outcome, daysAgo],
  );
}

function newEngine(): InstanceType<typeof SleepCycleEngine> {
  return new SleepCycleEngine(
    pool,
    { chat: async () => '', summarize: async () => '' } as never,
    new NoOpEmbeddingProvider(),
    // High evictionThreshold in test would evict our rows before we see them
    { evictionThreshold: 0.0, revisionThreshold: 0.4 },
  );
}

async function getConfidence(id: bigint): Promise<number> {
  const { rows } = await pool.query<{ confidence: number }>(
    `SELECT confidence FROM warm_tier WHERE id = $1`,
    [id],
  );
  return rows[0]!.confidence;
}

describe('Outcome-driven revision priorities', () => {
  beforeEach(async () => {
    await cleanup();
    await pool.query(
      `INSERT INTO agents (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [TEST_AGENT],
    );
  });

  it('queues high-confidence memory for revision after repeated negatives', async () => {
    const id = await seedMemory('active failure', 0.85);
    // 3 negatives, 0 positives → 100% negative ratio, well over threshold
    await seedOutcome(id, 'negative');
    await seedOutcome(id, 'negative');
    await seedOutcome(id, 'negative');

    const engine = newEngine();
    const result = await engine.run(TEST_AGENT);

    assert.ok(
      result.phase2_flagged_for_revision >= 1,
      `expected memory to be flagged despite confidence 0.85, got ${result.phase2_flagged_for_revision}`,
    );
  });

  it('does NOT queue memory with mostly positive outcomes', async () => {
    const id = await seedMemory('mostly good', 0.8);
    await seedOutcome(id, 'positive');
    await seedOutcome(id, 'positive');
    await seedOutcome(id, 'positive');
    await seedOutcome(id, 'negative'); // 1/4 negative → below threshold

    const engine = newEngine();
    const result = await engine.run(TEST_AGENT);

    assert.equal(result.phase2_flagged_for_revision, 0,
      'mostly-positive memory should not enter revision queue from outcome path');
  });

  it('drifts confidence down on memories with >50% negative ratio and >=3 negatives', async () => {
    const id = await seedMemory('chronic failure', 0.9);
    await seedOutcome(id, 'negative');
    await seedOutcome(id, 'negative');
    await seedOutcome(id, 'negative');
    await seedOutcome(id, 'negative');

    const engine = newEngine();
    await engine.run(TEST_AGENT);

    const after = await getConfidence(id);
    assert.ok(
      after < 0.9,
      `confidence should drift down from 0.9, got ${after}`,
    );
    assert.ok(
      after >= 0.7,
      `single cycle should drop ~0.1; got ${after}`,
    );
  });

  it('requires at least 3 negatives before confidence drifts', async () => {
    const id = await seedMemory('two complaints', 0.9);
    await seedOutcome(id, 'negative');
    await seedOutcome(id, 'negative'); // only 2 — below threshold

    const engine = newEngine();
    await engine.run(TEST_AGENT);

    const after = await getConfidence(id);
    assert.equal(after, 0.9, 'should not drift on 2 negatives');
  });

  it('ignores outcomes older than 7 days', async () => {
    const id = await seedMemory('old complaints', 0.9);
    await seedOutcome(id, 'negative', 10);
    await seedOutcome(id, 'negative', 10);
    await seedOutcome(id, 'negative', 10);

    const engine = newEngine();
    const result = await engine.run(TEST_AGENT);

    assert.equal(result.phase2_flagged_for_revision, 0,
      'old negatives should not trigger queuing');
    assert.equal(await getConfidence(id), 0.9,
      'old negatives should not drift confidence');
  });
});

after(async () => {
  await cleanup();
  await pool.end();
  await closePool();
});
