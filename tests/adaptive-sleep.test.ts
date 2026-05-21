// MemForge — Adaptive Sleep Intelligence tests (Feature 5, v3.8)
//
// Three layers:
//   Unit        — recordPhaseAnalytics / shouldSkipPhase against real DB
//   Integration — runSleepCycle records analytics rows
//   Migration   — sleep_phase_analytics table schema
//
// Run: node --import tsx/esm --test tests/adaptive-sleep.test.ts
// Requires: DATABASE_URL

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { SleepCycleEngine } = await import('../src/sleep-cycle.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');

// ─── Config ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const TEST_AGENT = 'test-agent-adaptive-sleep';
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
  sleepCycle: {
    tokenBudget: 100_000,
    evictionThreshold: 0.1,
    revisionThreshold: 0.4,
    includeReflection: false,
    weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
  },
});

// Build the engine directly for unit tests — same config as manager's internal engine.
// Constructor: (pool, llm, embedder, config, audit)
// LLM is not exercised in these tests so we pass a stub that satisfies the type.
const engine = new SleepCycleEngine(
  pool,
  { chat: async () => '', summarize: async () => ({ summary: '', keyFacts: [], entities: [], relationships: [], sentiment: 'neutral' as const }) } as never,
  new NoOpEmbeddingProvider(),
  {
    tokenBudget: 100_000,
    evictionThreshold: 0.1,
    revisionThreshold: 0.4,
    includeReflection: false,
    weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
  },
  null,
);

async function cleanupAnalytics(agentId = TEST_AGENT): Promise<void> {
  await pool.query(`DELETE FROM sleep_phase_analytics WHERE agent_id = $1`, [agentId]);
}

async function cleanupAgent(agentId = TEST_AGENT): Promise<void> {
  await pool.query(`DELETE FROM memory_revisions WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM reflections WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM warm_tier_entities WHERE warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = $1)`, [agentId]);
  await pool.query(`DELETE FROM relationships WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM entities WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM cold_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM consolidation_log WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM sleep_phase_analytics WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
}

// ─── Unit tests — recordPhaseAnalytics ───────────────────────────────────────

describe('recordPhaseAnalytics — writes a row to sleep_phase_analytics', () => {
  before(async () => {
    // Register the agent so FK constraint is satisfied
    await pool.query(
      `INSERT INTO agents (id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [TEST_AGENT],
    );
    await cleanupAnalytics();
  });
  after(cleanupAnalytics);

  it('inserts a row with the expected columns', async () => {
    const before = Date.now();
    await engine.recordPhaseAnalytics(TEST_AGENT, 'test-phase', 42, 0, 3);
    const after = Date.now();

    const { rows } = await pool.query<{
      agent_id: string;
      phase: string;
      duration_ms: number;
      tokens_used: number;
      changes_made: number;
      created_at: Date;
    }>(
      `SELECT agent_id, phase, duration_ms, tokens_used, changes_made, created_at
       FROM sleep_phase_analytics
       WHERE agent_id = $1 AND phase = $2
       ORDER BY created_at DESC LIMIT 1`,
      [TEST_AGENT, 'test-phase'],
    );

    assert.equal(rows.length, 1, 'exactly one row should be inserted');
    const row = rows[0]!;
    assert.equal(row.agent_id, TEST_AGENT);
    assert.equal(row.phase, 'test-phase');
    assert.equal(row.duration_ms, 42);
    assert.equal(row.tokens_used, 0);
    assert.equal(row.changes_made, 3);
    const createdMs = new Date(row.created_at).getTime();
    assert.ok(createdMs >= before && createdMs <= after + 1000,
      `created_at ${row.created_at} should be within the test window`);
  });

  it('records tokens_used correctly', async () => {
    await engine.recordPhaseAnalytics(TEST_AGENT, 'phase-with-tokens', 100, 512, 1);
    const { rows } = await pool.query<{ tokens_used: number }>(
      `SELECT tokens_used FROM sleep_phase_analytics WHERE agent_id = $1 AND phase = $2 ORDER BY created_at DESC LIMIT 1`,
      [TEST_AGENT, 'phase-with-tokens'],
    );
    assert.equal(rows[0]?.tokens_used, 512);
  });

  it('records changes_made=0 correctly', async () => {
    await engine.recordPhaseAnalytics(TEST_AGENT, 'idle-phase', 5, 0, 0);
    const { rows } = await pool.query<{ changes_made: number }>(
      `SELECT changes_made FROM sleep_phase_analytics WHERE agent_id = $1 AND phase = 'idle-phase' ORDER BY created_at DESC LIMIT 1`,
      [TEST_AGENT],
    );
    assert.equal(rows[0]?.changes_made, 0);
  });
});

// ─── Unit tests — shouldSkipPhase ────────────────────────────────────────────

describe('shouldSkipPhase — skip logic', () => {
  before(async () => {
    await pool.query(`INSERT INTO agents (id) VALUES ($1) ON CONFLICT DO NOTHING`, [TEST_AGENT]);
    await cleanupAnalytics();
  });
  after(cleanupAnalytics);

  it('returns false when there is no history', async () => {
    const skip = await engine.shouldSkipPhase(TEST_AGENT, 'new-phase-no-history');
    assert.equal(skip, false);
  });

  it('returns false with only 1 zero-change run (needs 3)', async () => {
    await engine.recordPhaseAnalytics(TEST_AGENT, 'phase-one-zero', 10, 0, 0);
    const skip = await engine.shouldSkipPhase(TEST_AGENT, 'phase-one-zero');
    assert.equal(skip, false);
  });

  it('returns false with only 2 zero-change runs (needs 3)', async () => {
    await engine.recordPhaseAnalytics(TEST_AGENT, 'phase-two-zeros', 10, 0, 0);
    await engine.recordPhaseAnalytics(TEST_AGENT, 'phase-two-zeros', 10, 0, 0);
    const skip = await engine.shouldSkipPhase(TEST_AGENT, 'phase-two-zeros');
    assert.equal(skip, false);
  });

  it('returns true when last 3 runs all had changes_made=0', async () => {
    const phase = 'phase-three-zeros';
    await engine.recordPhaseAnalytics(TEST_AGENT, phase, 10, 0, 0);
    await engine.recordPhaseAnalytics(TEST_AGENT, phase, 10, 0, 0);
    await engine.recordPhaseAnalytics(TEST_AGENT, phase, 10, 0, 0);
    const skip = await engine.shouldSkipPhase(TEST_AGENT, phase);
    assert.equal(skip, true);
  });

  it('returns false when last 3 runs include one non-zero', async () => {
    const phase = 'phase-mixed';
    await engine.recordPhaseAnalytics(TEST_AGENT, phase, 10, 0, 0);
    await engine.recordPhaseAnalytics(TEST_AGENT, phase, 10, 0, 1); // one change
    await engine.recordPhaseAnalytics(TEST_AGENT, phase, 10, 0, 0);
    const skip = await engine.shouldSkipPhase(TEST_AGENT, phase);
    assert.equal(skip, false);
  });

  it('uses only the LAST 3 runs (ignores older history)', async () => {
    const phase = 'phase-history-window';
    // Older runs that had changes — these should be ignored
    await engine.recordPhaseAnalytics(TEST_AGENT, phase, 10, 0, 5);
    await engine.recordPhaseAnalytics(TEST_AGENT, phase, 10, 0, 3);
    // 3 most recent: all zero
    await engine.recordPhaseAnalytics(TEST_AGENT, phase, 10, 0, 0);
    await engine.recordPhaseAnalytics(TEST_AGENT, phase, 10, 0, 0);
    await engine.recordPhaseAnalytics(TEST_AGENT, phase, 10, 0, 0);
    const skip = await engine.shouldSkipPhase(TEST_AGENT, phase);
    assert.equal(skip, true, 'should skip because the 3 most recent runs all had zero changes');
  });

  it('phase isolation — analytics for one phase do not affect another', async () => {
    const phaseA = 'phase-isolation-a';
    const phaseB = 'phase-isolation-b';
    // phaseA: 3 zero-change runs → should skip
    await engine.recordPhaseAnalytics(TEST_AGENT, phaseA, 10, 0, 0);
    await engine.recordPhaseAnalytics(TEST_AGENT, phaseA, 10, 0, 0);
    await engine.recordPhaseAnalytics(TEST_AGENT, phaseA, 10, 0, 0);
    // phaseB: no history → should not skip
    const skipA = await engine.shouldSkipPhase(TEST_AGENT, phaseA);
    const skipB = await engine.shouldSkipPhase(TEST_AGENT, phaseB);
    assert.equal(skipA, true);
    assert.equal(skipB, false);
  });
});

// ─── Integration tests — sleep cycle analytics ───────────────────────────────

describe('Adaptive Sleep Intelligence — integration', () => {
  before(async () => {
    await cleanupAgent();
    // Register agent and seed some memory so the cycle has something to score
    await manager.add(TEST_AGENT, 'First memory for sleep cycle testing');
    await manager.add(TEST_AGENT, 'Second memory with important context');
    await manager.consolidate(TEST_AGENT);
  });
  after(cleanupAgent);

  it('sleep cycle completes without errors and returns a SleepCycleResult', async () => {
    // engine.run() directly — manager.sleep() requires a non-null LLM provider in config
    const result = await engine.run(TEST_AGENT);
    assert.ok(result, 'engine.run must return a result');
    assert.equal(result.agent_id, TEST_AGENT);
    assert.ok(typeof result.duration_ms === 'number', 'duration_ms must be a number');
    assert.ok(result.duration_ms >= 0, 'duration_ms must be non-negative');
  });

  it('running a sleep cycle on an empty agent succeeds without errors', async () => {
    const emptyAgent = `${TEST_AGENT}-empty`;
    try {
      await pool.query(`INSERT INTO agents (id) VALUES ($1) ON CONFLICT DO NOTHING`, [emptyAgent]);
      const result = await engine.run(emptyAgent);
      assert.ok(result, 'should return a result even for an empty agent');
      assert.equal(result.agent_id, emptyAgent);
    } finally {
      await pool.query(`DELETE FROM sleep_phase_analytics WHERE agent_id = $1`, [emptyAgent]);
      await pool.query(`DELETE FROM agents WHERE id = $1`, [emptyAgent]);
    }
  });
});

// ─── Migration tests — sleep_phase_analytics table ───────────────────────────

describe('Migration v3.8 — sleep_phase_analytics table', () => {
  it('sleep_phase_analytics table exists', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_name = 'sleep_phase_analytics' AND table_schema = 'public'`,
    );
    assert.ok(rows.length > 0, 'sleep_phase_analytics table must exist');
  });

  it('has expected columns with correct types', async () => {
    const { rows } = await pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'sleep_phase_analytics'
       ORDER BY ordinal_position`,
    );

    const colMap = new Map(rows.map((r) => [r.column_name, r]));

    assert.ok(colMap.has('id'), 'id column must exist');
    assert.ok(colMap.has('agent_id'), 'agent_id column must exist');
    assert.equal(colMap.get('agent_id')?.data_type, 'text');
    assert.equal(colMap.get('agent_id')?.is_nullable, 'NO');

    assert.ok(colMap.has('phase'), 'phase column must exist');
    assert.equal(colMap.get('phase')?.data_type, 'text');
    assert.equal(colMap.get('phase')?.is_nullable, 'NO');

    assert.ok(colMap.has('duration_ms'), 'duration_ms column must exist');
    assert.equal(colMap.get('duration_ms')?.data_type, 'integer');

    assert.ok(colMap.has('tokens_used'), 'tokens_used column must exist');
    assert.equal(colMap.get('tokens_used')?.data_type, 'integer');

    assert.ok(colMap.has('changes_made'), 'changes_made column must exist');
    assert.equal(colMap.get('changes_made')?.data_type, 'integer');

    assert.ok(colMap.has('created_at'), 'created_at column must exist');
  });

  it('has the agent_idx index', async () => {
    const { rows } = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'sleep_phase_analytics' AND indexname = 'sleep_phase_analytics_agent_idx'`,
    );
    assert.ok(rows.length > 0, 'sleep_phase_analytics_agent_idx index must exist');
  });

  it('has RLS enabled', async () => {
    const { rows } = await pool.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'sleep_phase_analytics'`,
    );
    assert.equal(rows[0]?.relrowsecurity, true, 'RLS must be enabled on sleep_phase_analytics');
  });

  it('has the agent isolation policy', async () => {
    const { rows } = await pool.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
       WHERE tablename = 'sleep_phase_analytics' AND policyname = 'sleep_phase_analytics_agent_isolation'`,
    );
    assert.ok(rows.length > 0, 'agent isolation policy must exist');
  });

  it('table migration is idempotent — CREATE TABLE IF NOT EXISTS does not fail', async () => {
    await assert.doesNotReject(
      pool.query(`
        CREATE TABLE IF NOT EXISTS sleep_phase_analytics (
          id           BIGSERIAL   PRIMARY KEY,
          agent_id     TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          phase        TEXT        NOT NULL,
          duration_ms  INTEGER     NOT NULL,
          tokens_used  INTEGER     NOT NULL DEFAULT 0,
          changes_made INTEGER     NOT NULL DEFAULT 0,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `),
    );
  });
});

// Ensure pool closes cleanly
after(async () => {
  await pool.end();
  await closePool();
});
