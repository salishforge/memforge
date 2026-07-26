// MemForge — Contested conflict resolution tests (Feature 1 remnant, v3.12)
//
// Phase 2.5 conflict resolution: when the multi-factor score gap between two
// conflicting live (non-superseded) memories is at most one point — one
// factor's worth of noise — both are marked epistemic_status='contested'
// instead of a noise-driven winner being picked. Decisive gaps keep the
// winner/loser behavior, and a decisive win clears a prior contested badge.
//
// Run: node --import tsx/esm --test tests/contested-conflicts.test.ts
// Requires: DATABASE_URL

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { SleepCycleEngine } = await import('../src/sleep-cycle.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');

// ─── Config ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const TEST_AGENT = 'test-agent-contested-conflicts';
const pool = new Pool({ connectionString: DATABASE_URL });

const engine = new SleepCycleEngine(
  pool,
  { chat: async () => '', summarize: async () => ({ summary: '', keyFacts: [], entities: [], relationships: [], sentiment: 'neutral' as const }) } as never,
  new NoOpEmbeddingProvider(),
  {
    tokenBudget: 100_000,
    evictionThreshold: 0.05,
    revisionThreshold: 0.4,
    includeReflection: false,
    weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
  },
  null,
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function cleanupAgent(agentId: string): Promise<void> {
  await pool.query(`DELETE FROM memory_conflicts WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM causal_edges WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM memory_sequences WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM sleep_phase_analytics WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
}

async function ensureAgent(agentId: string): Promise<void> {
  await pool.query(`INSERT INTO agents (id) VALUES ($1) ON CONFLICT DO NOTHING`, [agentId]);
}

/**
 * Seed a warm row with controlled scoring inputs. Callers MUST pass the same
 * `consolidatedAt` to both sides of a conflict — separate INSERTs see
 * different now() values, and even a microsecond difference hands one side
 * the +3 recency factor. The timestamp is relative to the test run (no
 * wall-clock cliffs). With recency neutralized and zero retrieval successes,
 * the only live factor is confidence (Math.round(2 × confidence) points):
 * 0.5 → 1 point, 0.2 → 0, 0.9 → 2.
 */
async function seedConflictMemory(
  agentId: string,
  content: string,
  hash: string,
  consolidatedAt: Date,
  opts: { superseded?: boolean; confidence?: number } = {},
): Promise<string> {
  const metadata = opts.superseded ? { _superseded: true } : {};
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO warm_tier (agent_id, content, content_hash, consolidated_at, retrieval_success_count, confidence, metadata)
     VALUES ($1, $2, $3, $6, 0, $5, $4)
     RETURNING id`,
    [agentId, content, hash, JSON.stringify(metadata), opts.confidence ?? 0.5, consolidatedAt],
  );
  return rows[0]!.id;
}

/** One shared timestamp per conflict pair, an hour in the past. */
function pairTimestamp(): Date {
  return new Date(Date.now() - 3600_000);
}

async function seedConflict(agentId: string, idA: string, idB: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO memory_conflicts (agent_id, warm_tier_id_a, warm_tier_id_b)
     VALUES ($1, $2, $3) RETURNING id`,
    [agentId, idA, idB],
  );
  return rows[0]!.id;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('conflict resolution — contested close calls', () => {
  const AGENT = `${TEST_AGENT}-close`;
  let idA: string, idB: string, conflictId: string;

  before(async () => {
    await cleanupAgent(AGENT);
    await ensureAgent(AGENT);
    // Identical scoring inputs on both sides → score delta 0 → contested.
    const ts = pairTimestamp();
    idA = await seedConflictMemory(AGENT, 'The deploy window is Tuesday', 'cc-close-a', ts);
    idB = await seedConflictMemory(AGENT, 'The deploy window is Thursday', 'cc-close-b', ts);
    conflictId = await seedConflict(AGENT, idA, idB);

    await engine.run(AGENT);
  });
  after(() => cleanupAgent(AGENT));

  it('marks both memories contested instead of picking a winner', async () => {
    const { rows } = await pool.query<{ id: string; epistemic_status: string }>(
      `SELECT id, epistemic_status FROM warm_tier WHERE agent_id = $1 ORDER BY id`,
      [AGENT],
    );

    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.epistemic_status === 'contested'), 'both sides of a close call must be contested');
  });

  it('resolves the conflict with a contested strategy and no winner', async () => {
    const { rows } = await pool.query<{ resolved: boolean; winner_id: string | null; resolution_strategy: string }>(
      `SELECT resolved, winner_id, resolution_strategy FROM memory_conflicts WHERE id = $1`,
      [conflictId],
    );

    assert.equal(rows[0]?.resolved, true);
    assert.equal(rows[0]?.winner_id, null, 'a contested resolution names no winner');
    assert.ok(rows[0]?.resolution_strategy?.startsWith('contested('), `strategy must record the contested call: ${rows[0]?.resolution_strategy}`);
  });

  it('does not apply the loser confidence penalty to either side', async () => {
    const { rows } = await pool.query<{ confidence: number; metadata: Record<string, unknown> }>(
      `SELECT confidence, metadata FROM warm_tier WHERE agent_id = $1`,
      [AGENT],
    );

    for (const r of rows) {
      assert.equal(r.confidence, 0.5, 'confidence must be untouched on contested calls');
      assert.ok(!('_conflict_loser' in r.metadata), 'no side of a contested call is a loser');
    }
  });
});

describe('conflict resolution — the delta boundary', () => {
  it('a one-point gap is contested (one factor of noise must not decide)', async () => {
    const AGENT = `${TEST_AGENT}-delta1`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      // confidence 0.5 → 1 point vs 0.2 → 0 points: delta exactly 1
      const ts = pairTimestamp();
      const idA = await seedConflictMemory(AGENT, 'Config lives in etcd', 'cc-d1-a', ts, { confidence: 0.5 });
      const idB = await seedConflictMemory(AGENT, 'Config lives in consul', 'cc-d1-b', ts, { confidence: 0.2 });
      const conflictId = await seedConflict(AGENT, idA, idB);

      await engine.run(AGENT);

      const { rows } = await pool.query<{ resolution_strategy: string }>(
        `SELECT resolution_strategy FROM memory_conflicts WHERE id = $1`, [conflictId],
      );
      assert.ok(rows[0]?.resolution_strategy?.startsWith('contested('), `delta 1 must contest: ${rows[0]?.resolution_strategy}`);
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('a two-point gap is decisive', async () => {
    const AGENT = `${TEST_AGENT}-delta2`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      // confidence 0.9 → 2 points vs 0.2 → 0 points: delta exactly 2
      const ts = pairTimestamp();
      const idWinner = await seedConflictMemory(AGENT, 'The port is 5432', 'cc-d2-a', ts, { confidence: 0.9 });
      const idLoser = await seedConflictMemory(AGENT, 'The port is 5433', 'cc-d2-b', ts, { confidence: 0.2 });
      const conflictId = await seedConflict(AGENT, idWinner, idLoser);

      await engine.run(AGENT);

      const { rows } = await pool.query<{ winner_id: string; resolution_strategy: string }>(
        `SELECT winner_id, resolution_strategy FROM memory_conflicts WHERE id = $1`, [conflictId],
      );
      assert.equal(rows[0]?.winner_id, idWinner);
      assert.ok(rows[0]?.resolution_strategy?.startsWith('multi_factor('), `delta 2 must decide: ${rows[0]?.resolution_strategy}`);
    } finally {
      await cleanupAgent(AGENT);
    }
  });
});

describe('conflict resolution — decisive gaps keep winner/loser semantics', () => {
  const AGENT = `${TEST_AGENT}-decisive`;
  let idWinner: string, idLoser: string, conflictId: string;

  before(async () => {
    await cleanupAgent(AGENT);
    await ensureAgent(AGENT);
    // Supersession contributes +100 to the other side → decisive gap.
    const ts = pairTimestamp();
    idWinner = await seedConflictMemory(AGENT, 'The current deploy window is Friday', 'cc-dec-w', ts);
    idLoser = await seedConflictMemory(AGENT, 'The old deploy window was Monday', 'cc-dec-l', ts, { superseded: true });
    conflictId = await seedConflict(AGENT, idWinner, idLoser);

    await engine.run(AGENT);
  });
  after(() => cleanupAgent(AGENT));

  it('picks the decisively stronger memory as winner', async () => {
    const { rows } = await pool.query<{ winner_id: string; resolution_strategy: string }>(
      `SELECT winner_id, resolution_strategy FROM memory_conflicts WHERE id = $1`,
      [conflictId],
    );

    assert.equal(rows[0]?.winner_id, idWinner);
    assert.ok(rows[0]?.resolution_strategy?.startsWith('multi_factor('), `decisive calls keep the multi_factor strategy: ${rows[0]?.resolution_strategy}`);
  });

  it('penalizes the loser and leaves the winner untouched', async () => {
    const { rows } = await pool.query<{ id: string; confidence: number; epistemic_status: string; metadata: Record<string, unknown> }>(
      `SELECT id, confidence, epistemic_status, metadata FROM warm_tier WHERE agent_id = $1`,
      [AGENT],
    );

    const winner = rows.find((r) => r.id === idWinner);
    const loser = rows.find((r) => r.id === idLoser);
    assert.ok(winner && loser);
    assert.notEqual(winner.epistemic_status, 'contested', 'decisive winner must not be contested');
    assert.equal(winner.confidence, 0.5, "winner's confidence must be untouched");
    assert.ok(loser.confidence <= 0.2, 'loser confidence must be capped at 0.2');
    assert.equal(loser.metadata['_conflict_loser'], true);
  });
});

describe('conflict resolution — supersession and contested recovery', () => {
  it('a both-superseded pair resolves decisively, never contested', async () => {
    const AGENT = `${TEST_AGENT}-bothsup`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      // Identical real factors + mutual +100 offset: the old ratio rule
      // would have contested two stale facts; the gate must not.
      const ts = pairTimestamp();
      const idA = await seedConflictMemory(AGENT, 'API limit was 100/min', 'cc-sup-a', ts, { superseded: true });
      const idB = await seedConflictMemory(AGENT, 'API limit was 500/min', 'cc-sup-b', ts, { superseded: true });
      const conflictId = await seedConflict(AGENT, idA, idB);

      await engine.run(AGENT);

      const { rows } = await pool.query<{ winner_id: string | null; resolution_strategy: string }>(
        `SELECT winner_id, resolution_strategy FROM memory_conflicts WHERE id = $1`, [conflictId],
      );
      assert.ok(rows[0]?.winner_id, 'a winner must be named');
      assert.ok(rows[0]?.resolution_strategy?.startsWith('multi_factor('), 'stale facts must not be revived as contested');
      const { rows: statuses } = await pool.query<{ epistemic_status: string }>(
        `SELECT epistemic_status FROM warm_tier WHERE agent_id = $1`, [AGENT],
      );
      assert.ok(statuses.every((r) => r.epistemic_status !== 'contested'));
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('a decisive re-resolution clears the contested badge on the winner only', async () => {
    const AGENT = `${TEST_AGENT}-recover`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      const ts = pairTimestamp();
      const idWinner = await seedConflictMemory(AGENT, 'Retention is 90 days', 'cc-rec-w', ts, { confidence: 0.9 });
      const idLoser = await seedConflictMemory(AGENT, 'Retention is 30 days', 'cc-rec-l', ts, { confidence: 0.2 });
      // Both carry a contested badge from an earlier close call.
      await pool.query(
        `UPDATE warm_tier SET epistemic_status = 'contested' WHERE agent_id = $1`, [AGENT],
      );
      await seedConflict(AGENT, idWinner, idLoser);

      await engine.run(AGENT);

      const { rows } = await pool.query<{ id: string; epistemic_status: string }>(
        `SELECT id, epistemic_status FROM warm_tier WHERE agent_id = $1`, [AGENT],
      );
      const winner = rows.find((r) => r.id === idWinner);
      const loser = rows.find((r) => r.id === idLoser);
      assert.equal(winner?.epistemic_status, 'provisional', 'the decisive winner sheds the contested badge (to provisional, not established)');
      assert.equal(loser?.epistemic_status, 'contested', 'the loser keeps its contested badge');
    } finally {
      await cleanupAgent(AGENT);
    }
  });
});

// ─── Teardown ────────────────────────────────────────────────────────────────

after(async () => {
  await pool.end();
  await closePool();
});
