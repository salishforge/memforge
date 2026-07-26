// MemForge — Causal Memory Graph tests (Phase 5 Feature 3, v3.10)
//
// Four layers:
//   Integration — getCausalChain() / predict() against real DB
//   Sleep       — Phase 6.1 (phaseCausalInference) via SleepCycleEngine.run()
//   E2E         — GET /memory/:id/causal and POST /memory/:id/predict via HTTP
//   Migration   — causal_edges table, unique constraint, indexes, RLS
//
// Run: node --import tsx/esm --test tests/causal-graph.test.ts
// Requires: DATABASE_URL (with schema/migration-v3.10.sql applied)

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { SleepCycleEngine } = await import('../src/sleep-cycle.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { createDefaultRegistry } = await import('../src/classifier.js');

// ─── Config ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const TEST_AGENT = 'test-agent-causal-graph';
const pool = new Pool({ connectionString: DATABASE_URL });

const SLEEP_CONFIG = {
  tokenBudget: 100_000,
  evictionThreshold: 0.05,
  revisionThreshold: 0.4,
  includeReflection: false,
  weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
};

const manager = new MemoryManager({
  databaseUrl: DATABASE_URL,
  consolidationBatchSize: 500,
  consolidationThreshold: 1,
  autoRegisterAgents: true,
  consolidationMode: 'concat',
  temporalDecayRate: 0,
  embeddingProvider: new NoOpEmbeddingProvider(),
  llmProvider: null,
  sleepCycle: SLEEP_CONFIG,
});

// SleepCycleEngine instance for direct phase testing (bypasses LLM requirement)
const engine = new SleepCycleEngine(
  pool,
  { chat: async () => '', summarize: async () => ({ summary: '', keyFacts: [], entities: [], relationships: [], sentiment: 'neutral' as const }) } as never,
  new NoOpEmbeddingProvider(),
  SLEEP_CONFIG,
  null,
);

// ─── Cleanup helpers ─────────────────────────────────────────────────────────

async function cleanupAgent(agentId: string = TEST_AGENT): Promise<void> {
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM knowledge_gaps WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM causal_edges WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM memory_sequences WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM sleep_phase_analytics WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
}

async function ensureAgent(agentId: string = TEST_AGENT): Promise<void> {
  await pool.query(`INSERT INTO agents (id) VALUES ($1) ON CONFLICT DO NOTHING`, [agentId]);
}

// ─── Seed helpers ────────────────────────────────────────────────────────────
//
// warm_tier.id is BIGSERIAL — node-pg returns int8 as string, so ids flow
// through these helpers as strings and get BigInt()-wrapped at call sites.

async function seedWarm(agentId: string, content: string, hash: string, namespace = 'default'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO warm_tier (agent_id, content, content_hash, importance, namespace)
     VALUES ($1, $2, $3, 0.9, $4) RETURNING id`,
    [agentId, content, hash, namespace],
  );
  return rows[0]!.id;
}

/** Expected predict() probability for a seeded edge — mirror of the
 * production squash: confidence × (1 − e^(−strength/30)). */
function expectedProbability(strength: number, confidence: number): number {
  return confidence * (1 - Math.exp(-strength / 30));
}

async function seedEdge(
  agentId: string,
  causeId: string,
  effectId: string,
  strength: number,
  confidence: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO causal_edges (agent_id, cause_id, effect_id, strength, observation_count, avg_lag_seconds, confidence)
     VALUES ($1, $2, $3, $4, 3, 60, $5)`,
    [agentId, causeId, effectId, strength, confidence],
  );
}

// ─── Integration tests — getCausalChain() ────────────────────────────────────

describe('getCausalChain — traversal', () => {
  // Linear chain A→B→C→D→E plus a disjoint cycle X⇄Y.
  let idA: string, idB: string, idC: string, idD: string, idE: string;
  let idX: string, idY: string;

  before(async () => {
    await cleanupAgent();
    await ensureAgent();
    idA = await seedWarm(TEST_AGENT, 'Chain memory alpha', 'cg-chain-a');
    idB = await seedWarm(TEST_AGENT, 'Chain memory bravo', 'cg-chain-b');
    idC = await seedWarm(TEST_AGENT, 'Chain memory charlie', 'cg-chain-c');
    idD = await seedWarm(TEST_AGENT, 'Chain memory delta', 'cg-chain-d');
    idE = await seedWarm(TEST_AGENT, 'Chain memory echo', 'cg-chain-e');
    await seedEdge(TEST_AGENT, idA, idB, 0.5, 0.5);
    await seedEdge(TEST_AGENT, idB, idC, 0.5, 0.5);
    await seedEdge(TEST_AGENT, idC, idD, 0.5, 0.5);
    await seedEdge(TEST_AGENT, idD, idE, 0.5, 0.5);

    idX = await seedWarm(TEST_AGENT, 'Cycle memory xray', 'cg-cycle-x');
    idY = await seedWarm(TEST_AGENT, 'Cycle memory yankee', 'cg-cycle-y');
    await seedEdge(TEST_AGENT, idX, idY, 0.5, 0.5);
    await seedEdge(TEST_AGENT, idY, idX, 0.5, 0.5);
  });
  after(() => cleanupAgent());

  it('returns the downstream effects chain for seeded causal_edges', async () => {
    const chain = await manager.getCausalChain(TEST_AGENT, BigInt(idA), 'effects', 10);

    assert.equal(chain.length, 4, 'A has 4 downstream nodes: B, C, D, E');
    const byDepth = [...chain].sort((a, b) => a.depth - b.depth);
    assert.deepEqual(
      byDepth.map((n) => String(n.memory_id)),
      [idB, idC, idD, idE],
      'nodes must appear in hop order B→C→D→E',
    );
    for (const node of chain) {
      assert.equal(node.direction, 'effect', 'effects traversal labels every node "effect"');
      assert.equal(node.edge_strength, 0.5);
      assert.equal(node.edge_confidence, 0.5);
    }
  });

  it('direction=causes traverses backwards', async () => {
    const chain = await manager.getCausalChain(TEST_AGENT, BigInt(idE), 'causes', 10);

    assert.equal(chain.length, 4, 'E has 4 upstream nodes: D, C, B, A');
    const byDepth = [...chain].sort((a, b) => a.depth - b.depth);
    assert.deepEqual(
      byDepth.map((n) => String(n.memory_id)),
      [idD, idC, idB, idA],
      'nodes must appear in reverse hop order D→C→B→A',
    );
    for (const node of chain) {
      assert.equal(node.direction, 'cause', 'causes traversal labels every node "cause"');
    }
  });

  it('depth=2 limits a 4-hop chain to 2 hops', async () => {
    const chain = await manager.getCausalChain(TEST_AGENT, BigInt(idA), 'effects', 2);

    assert.equal(chain.length, 2, 'only B (depth 1) and C (depth 2) are reachable');
    assert.deepEqual(
      [...chain].sort((a, b) => a.depth - b.depth).map((n) => String(n.memory_id)),
      [idB, idC],
    );
    assert.ok(chain.every((n) => n.depth <= 2), 'no node may exceed the requested depth');
  });

  it('a cyclic edge pair (X→Y, Y→X) terminates and returns bounded results', async () => {
    // The recursive CTE has no visited-set — it bounds the cycle purely by the
    // depth cap, revisiting X and Y alternately: one node per depth 1..10.
    const chain = await manager.getCausalChain(TEST_AGENT, BigInt(idX), 'effects', 10);

    assert.equal(chain.length, 10, 'depth cap 10 yields exactly one node per depth level');
    assert.ok(chain.every((n) => n.depth >= 1 && n.depth <= 10), 'depths stay within [1, 10]');
    assert.ok(
      chain.every((n) => String(n.memory_id) === idX || String(n.memory_id) === idY),
      'only the two cycle members may appear',
    );
  });

  it("another agent's edges are invisible (agent-scoped traversal)", async () => {
    const otherAgent = `${TEST_AGENT}-other`;
    try {
      await ensureAgent(otherAgent);
      const idP = await seedWarm(otherAgent, 'Other agent cause memory', 'cg-other-p');
      const idQ = await seedWarm(otherAgent, 'Other agent effect memory', 'cg-other-q');
      await seedEdge(otherAgent, idP, idQ, 0.5, 0.5);

      const chain = await manager.getCausalChain(TEST_AGENT, BigInt(idP), 'effects', 10);

      assert.deepEqual(chain, [], "TEST_AGENT must not see the other agent's chain");
    } finally {
      await cleanupAgent(otherAgent);
    }
  });

  it('returns rows ordered by depth then edge strength without caller-side sorting', async () => {
    const idR = await seedWarm(TEST_AGENT, 'Ordering root memory', 'cg-ord-r');
    const idS1 = await seedWarm(TEST_AGENT, 'Ordering strong effect', 'cg-ord-s1');
    const idS2 = await seedWarm(TEST_AGENT, 'Ordering weak effect', 'cg-ord-s2');
    const idT = await seedWarm(TEST_AGENT, 'Ordering second hop effect', 'cg-ord-t');
    await seedEdge(TEST_AGENT, idR, idS1, 0.9, 0.5);
    await seedEdge(TEST_AGENT, idR, idS2, 0.3, 0.5);
    await seedEdge(TEST_AGENT, idS1, idT, 0.5, 0.5);

    const chain = await manager.getCausalChain(TEST_AGENT, BigInt(idR), 'effects', 10);

    assert.deepEqual(
      chain.map((n) => String(n.memory_id)),
      [idS1, idS2, idT],
      'depth 1 sorted strong-first, then depth 2 — as returned, no re-sort',
    );
  });

  it('clamps out-of-range depth to [1, 10]', async () => {
    const depthZero = await manager.getCausalChain(TEST_AGENT, BigInt(idA), 'effects', 0);
    assert.deepEqual(
      depthZero.map((n) => String(n.memory_id)),
      [idB],
      'depth 0 clamps to 1 — only the first hop',
    );

    const depthHuge = await manager.getCausalChain(TEST_AGENT, BigInt(idX), 'effects', 99);
    assert.equal(depthHuge.length, 10, 'depth 99 clamps to 10 — one cycle revisit per depth level');
  });

  it('caps results at 50 rows', async () => {
    const idFan = await seedWarm(TEST_AGENT, 'Fan-out root memory', 'cg-fan-root');
    for (let i = 0; i < 60; i++) {
      const idLeaf = await seedWarm(TEST_AGENT, `Fan-out leaf memory ${i}`, `cg-fan-${i}`);
      await seedEdge(TEST_AGENT, idFan, idLeaf, 0.5, 0.5);
    }

    const chain = await manager.getCausalChain(TEST_AGENT, BigInt(idFan), 'effects', 1);

    assert.equal(chain.length, 50, '60 direct effects must be capped at 50');
  });
});

// ─── Integration tests — predict() ───────────────────────────────────────────

describe('predict — probable next events', () => {
  const PREDICT_AGENT = `${TEST_AGENT}-predict`;
  let idRollback: string, idPaged: string, idPostmortem: string;

  before(async () => {
    await cleanupAgent(PREDICT_AGENT);
    await ensureAgent(PREDICT_AGENT);
    // Strength/confidence values chosen to be exactly representable in float32
    // (REAL columns) so probability assertions can recompute the squash exactly.
    const idCause = await seedWarm(PREDICT_AGENT, 'The deployment pipeline failed with a timeout error', 'cg-pred-cause');
    idRollback = await seedWarm(PREDICT_AGENT, 'Engineers rolled back the release to the previous version', 'cg-pred-eff1');
    idPaged = await seedWarm(PREDICT_AGENT, 'The on-call engineer was paged about the outage', 'cg-pred-eff2');
    idPostmortem = await seedWarm(PREDICT_AGENT, 'A postmortem review meeting was scheduled', 'cg-pred-eff3');
    await seedEdge(PREDICT_AGENT, idCause, idRollback, 0.5, 0.5);
    await seedEdge(PREDICT_AGENT, idCause, idPaged, 4.0, 0.5);
    await seedEdge(PREDICT_AGENT, idCause, idPostmortem, 30, 0.8); // mining-realistic values
  });
  after(() => cleanupAgent(PREDICT_AGENT));

  it('returns effects for a matching context with probability = confidence × (1 − e^(−strength/30))', async () => {
    const result = await manager.predict(PREDICT_AGENT, 'deployment pipeline failed');

    const rollback = result.predicted_events.find((e) => String(e.memory_id) === idRollback);
    assert.ok(rollback, 'the rollback effect must be predicted');
    assert.equal(rollback.probability, expectedProbability(0.5, 0.5));
    assert.equal(rollback.content, 'Engineers rolled back the release to the previous version');
    assert.equal(rollback.avg_lag_seconds, 60);
  });

  it('does not saturate at 1.0 for mining-realistic edge stats', async () => {
    // Phase 6.1 emits strength >= 30 and confidence >= 0.8 for any uniform-gap
    // pattern; the raw strength × confidence product would clamp to 1.0 and
    // carry no signal. The squash must stay strictly below confidence.
    const result = await manager.predict(PREDICT_AGENT, 'deployment pipeline failed');

    const postmortem = result.predicted_events.find((e) => String(e.memory_id) === idPostmortem);
    assert.ok(postmortem, 'the postmortem effect must be predicted');
    assert.equal(postmortem.probability, expectedProbability(30, 0.8));
    assert.ok(postmortem.probability < 0.8, 'probability must stay below the edge confidence');
    assert.ok(postmortem.probability > 0.5, 'a strong confident edge must still rank high');
  });

  it('ranks predictions by their reported probability descending', async () => {
    const result = await manager.predict(PREDICT_AGENT, 'deployment pipeline failed');

    assert.equal(result.predicted_events.length, 3);
    const probs = result.predicted_events.map((e) => e.probability);
    assert.deepEqual(probs, [...probs].sort((a, b) => b - a), 'events must arrive sorted by probability');
    assert.equal(String(result.predicted_events[0]?.memory_id), idPostmortem, 'strongest confident edge first');
  });

  it('returns empty predicted_events when the context matches nothing', async () => {
    const result = await manager.predict(PREDICT_AGENT, 'zebra xylophone quantum unrelated');

    assert.deepEqual(result.predicted_events, []);
  });

  it('confines predicted events to the requested namespace', async () => {
    const NS_AGENT = `${TEST_AGENT}-ns`;
    try {
      await cleanupAgent(NS_AGENT);
      await ensureAgent(NS_AGENT);
      const idCause = await seedWarm(NS_AGENT, 'Namespace probe context memory', 'cg-ns-cause', 'nsa');
      const idEffectA = await seedWarm(NS_AGENT, 'Effect inside the same namespace', 'cg-ns-eff-a', 'nsa');
      const idEffectB = await seedWarm(NS_AGENT, 'Effect in a different namespace', 'cg-ns-eff-b', 'nsb');
      await seedEdge(NS_AGENT, idCause, idEffectA, 0.5, 0.5);
      await seedEdge(NS_AGENT, idCause, idEffectB, 0.5, 0.5);

      const inNsa = await manager.predict(NS_AGENT, 'namespace probe context', 'nsa');
      const inNsb = await manager.predict(NS_AGENT, 'namespace probe context', 'nsb');

      assert.deepEqual(
        inNsa.predicted_events.map((e) => String(e.memory_id)),
        [idEffectA],
        'edges whose effect lies outside the requested namespace are excluded',
      );
      assert.deepEqual(inNsb.predicted_events, [], 'the context matches nothing in nsb');
    } finally {
      await cleanupAgent(NS_AGENT);
    }
  });

  it('ignores shared-pool matches whose ids collide with warm-tier rows', async () => {
    // Pool results live in the shared_memories id space; a numeric collision
    // with an unrelated warm row must not fabricate predictions.
    const POOL_AGENT = `${TEST_AGENT}-pool`;
    const POOL_ID = 'cg-test-pool';
    const COLLIDING_ID = '987654321001';
    try {
      await cleanupAgent(POOL_AGENT);
      await ensureAgent(POOL_AGENT);
      await pool.query(
        `INSERT INTO shared_pools (id, name, pool_type) VALUES ($1, 'causal test pool', 'team')
         ON CONFLICT DO NOTHING`,
        [POOL_ID],
      );
      await pool.query(
        `INSERT INTO pool_memberships (agent_id, pool_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [POOL_AGENT, POOL_ID],
      );
      // Unrelated warm row at the colliding id, with an outgoing causal edge
      await pool.query(
        `INSERT INTO warm_tier (id, agent_id, content, content_hash, importance)
         VALUES ($1, $2, 'Completely unrelated database migration notes', 'cg-pool-warm', 0.9)`,
        [COLLIDING_ID, POOL_AGENT],
      );
      const idEffect = await seedWarm(POOL_AGENT, 'Bogus effect that must never surface', 'cg-pool-eff');
      await seedEdge(POOL_AGENT, COLLIDING_ID, idEffect, 30, 0.8);
      // Pool memory at the SAME numeric id, matching the probe context
      await pool.query(
        `INSERT INTO shared_memories (id, pool_id, source_agent_id, content, base_confidence, importance)
         VALUES ($1, $2, $3, 'Distinct pool collision probe context knowledge', 0.9, 0.9)`,
        [COLLIDING_ID, POOL_ID, POOL_AGENT],
      );

      const result = await manager.predict(POOL_AGENT, 'distinct pool collision probe context');

      assert.deepEqual(
        result.predicted_events,
        [],
        "the pool match's id must not be treated as a warm-tier cause id",
      );
    } finally {
      await pool.query(`DELETE FROM shared_memories WHERE pool_id = $1`, [POOL_ID]);
      await pool.query(`DELETE FROM pool_memberships WHERE pool_id = $1`, [POOL_ID]);
      await pool.query(`DELETE FROM shared_pools WHERE id = $1`, [POOL_ID]);
      await cleanupAgent(POOL_AGENT);
    }
  });
});

// ─── Sleep tests — Phase 6.1 causal inference ────────────────────────────────

// The same row pair can never recur (memory_sequences UNIQUE constraint), so
// mining groups by content-prefix pattern across distinct row pairs. First 50
// chars of these bases are identical per role; suffixes differ per occurrence.
const PRED_BASE = 'Deploy pipeline started for the payments service — occurrence';
const SUCC_BASE = 'Deployment completed and service health checks verified — occurrence';

/** Seed `count` occurrences of the same content-level A→B pattern and return
 * the pred/succ warm ids in insertion order. gaps[i] is the i-th occurrence's
 * gap_seconds. */
async function seedPattern(agentId: string, gaps: number[]): Promise<{ predIds: string[]; succIds: string[] }> {
  const predIds: string[] = [];
  const succIds: string[] = [];
  for (let i = 0; i < gaps.length; i++) {
    predIds.push(await seedWarm(agentId, `${PRED_BASE} ${i}`, `cg-pat-p${i}`));
    succIds.push(await seedWarm(agentId, `${SUCC_BASE} ${i}`, `cg-pat-s${i}`));
    await pool.query(
      `INSERT INTO memory_sequences (agent_id, predecessor_id, successor_id, gap_seconds)
       VALUES ($1, $2, $3, $4)`,
      [agentId, predIds[i], succIds[i], gaps[i]],
    );
  }
  return { predIds, succIds };
}

describe('Phase 6.1 — causal inference mining', () => {
  // Each test uses its own agent: engine.run() has cumulative side effects
  // (confidence increments per cycle), so shared agents would couple tests
  // to their execution order.

  it('memory_sequences rejects duplicate (agent, predecessor, successor) rows', async () => {
    // This constraint is why mining groups by content pattern, not row pair.
    const AGENT = `${TEST_AGENT}-mine-uniq`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      const { predIds, succIds } = await seedPattern(AGENT, [60]);

      await assert.rejects(
        pool.query(
          `INSERT INTO memory_sequences (agent_id, predecessor_id, successor_id, gap_seconds)
           VALUES ($1, $2, $3, 90)`,
          [AGENT, predIds[0], succIds[0]],
        ),
        (err: Error & { code?: string }) => err.code === '23505',
        'the UNIQUE (agent_id, predecessor_id, successor_id) constraint must reject the duplicate',
      );
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('mines one edge from >= 3 occurrences of a content pattern, anchored to the earliest pair', async () => {
    const AGENT = `${TEST_AGENT}-mine-anchor`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      const { predIds, succIds } = await seedPattern(AGENT, [60, 60, 60]);

      await engine.run(AGENT);

      const { rows } = await pool.query<{ cause_id: string; effect_id: string; observation_count: number }>(
        `SELECT cause_id, effect_id, observation_count FROM causal_edges WHERE agent_id = $1`,
        [AGENT],
      );
      assert.equal(rows.length, 1, 'exactly one edge per pattern');
      assert.equal(rows[0]?.cause_id, predIds[0], 'edge anchors to the earliest predecessor');
      assert.equal(rows[0]?.effect_id, succIds[0], 'edge anchors to the earliest successor');
      assert.equal(rows[0]?.observation_count, 3);
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('mined edge carries pattern-level stats (avg lag, count-scaled confidence, cv-floored strength)', async () => {
    const AGENT = `${TEST_AGENT}-mine-stats`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedPattern(AGENT, [60, 60, 60]);

      await engine.run(AGENT);

      const { rows } = await pool.query<{ strength: number; confidence: number; avg_lag_seconds: number }>(
        `SELECT strength, confidence, avg_lag_seconds FROM causal_edges WHERE agent_id = $1`,
        [AGENT],
      );
      const edge = rows[0];
      assert.ok(edge);
      assert.equal(edge.avg_lag_seconds, 60, 'avg lag over the three 60s gaps');
      assert.ok(Math.abs(edge.confidence - 0.8) < 1e-6, `confidence 0.5 + 3*0.1 = 0.8, got ${edge.confidence}`);
      assert.equal(edge.strength, 30, 'uniform gaps → cv floor 0.1 → strength = 3 * (1/0.1) = 30');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('weights strength by temporal consistency for non-uniform gaps', async () => {
    const AGENT = `${TEST_AGENT}-mine-cv`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      // gaps 30/60/90: mean 60, sample stddev 30 → cv 0.5 → strength 3 × (1/0.5) = 6
      await seedPattern(AGENT, [30, 60, 90]);

      await engine.run(AGENT);

      const { rows } = await pool.query<{ strength: number }>(
        `SELECT strength FROM causal_edges WHERE agent_id = $1`,
        [AGENT],
      );
      assert.ok(rows[0]);
      assert.ok(Math.abs(rows[0].strength - 6) < 1e-3, `cv 0.5 must yield strength 6, got ${rows[0].strength}`);
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('does not mine patterns with fewer than 3 occurrences', async () => {
    const AGENT = `${TEST_AGENT}-mine-few`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedPattern(AGENT, [30, 30]);

      await engine.run(AGENT);

      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*) FROM causal_edges WHERE agent_id = $1`,
        [AGENT],
      );
      assert.equal(rows[0]?.count, '0', 'two occurrences must stay below the mining threshold');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('re-confirmation on a later cycle raises confidence by exactly 0.1', async () => {
    const AGENT = `${TEST_AGENT}-mine-reconfirm`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedPattern(AGENT, [60, 60, 60]);

      await engine.run(AGENT);
      const first = await pool.query<{ confidence: number }>(
        `SELECT confidence FROM causal_edges WHERE agent_id = $1`, [AGENT],
      );
      await engine.run(AGENT);
      const second = await pool.query<{ confidence: number }>(
        `SELECT confidence FROM causal_edges WHERE agent_id = $1`, [AGENT],
      );

      assert.ok(Math.abs((first.rows[0]?.confidence ?? 0) - 0.8) < 1e-6, 'insert-time confidence 0.5 + 3×0.1');
      assert.ok(
        Math.abs((second.rows[0]?.confidence ?? 0) - 0.9) < 1e-6,
        `one re-confirming cycle must add exactly 0.1 (below the cap), got ${second.rows[0]?.confidence}`,
      );
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('the earliest-pair anchor stays stable as new occurrences arrive', async () => {
    const AGENT = `${TEST_AGENT}-mine-stable`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      const { predIds } = await seedPattern(AGENT, [60, 60, 60]);
      await engine.run(AGENT);

      // A fourth occurrence arrives; the next cycle must UPDATE the existing
      // edge in place, not scatter a second edge anchored elsewhere.
      const p4 = await seedWarm(AGENT, `${PRED_BASE} 4`, 'cg-pat-p4');
      const s4 = await seedWarm(AGENT, `${SUCC_BASE} 4`, 'cg-pat-s4');
      await pool.query(
        `INSERT INTO memory_sequences (agent_id, predecessor_id, successor_id, gap_seconds)
         VALUES ($1, $2, $3, 60)`,
        [AGENT, p4, s4],
      );
      await engine.run(AGENT);

      const { rows } = await pool.query<{ cause_id: string; observation_count: number }>(
        `SELECT cause_id, observation_count FROM causal_edges WHERE agent_id = $1`,
        [AGENT],
      );
      assert.equal(rows.length, 1, 'still exactly one edge for the pattern');
      assert.equal(rows[0]?.cause_id, predIds[0], 'anchor must not move to the new pair');
      assert.equal(rows[0]?.observation_count, 4, 'stats must absorb the new occurrence');
    } finally {
      await cleanupAgent(AGENT);
    }
  });
});

describe('Phase 6.1 — edge pruning', () => {
  const PRUNE_AGENT = `${TEST_AGENT}-prune`;
  let idW1: string, idW2: string, idW3: string;

  before(async () => {
    await cleanupAgent(PRUNE_AGENT);
    await ensureAgent(PRUNE_AGENT);
    idW1 = await seedWarm(PRUNE_AGENT, 'Prune test cause memory', 'cg-prune-1');
    idW2 = await seedWarm(PRUNE_AGENT, 'Prune test weak effect memory', 'cg-prune-2');
    idW3 = await seedWarm(PRUNE_AGENT, 'Prune test strong effect memory', 'cg-prune-3');
    await seedEdge(PRUNE_AGENT, idW1, idW2, 0.05, 0.5); // below the 0.1 prune floor
    await seedEdge(PRUNE_AGENT, idW1, idW3, 0.5, 0.5); //  above it

    await engine.run(PRUNE_AGENT);
  });
  after(() => cleanupAgent(PRUNE_AGENT));

  it('prunes edges with strength < 0.1', async () => {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM causal_edges WHERE agent_id = $1 AND effect_id = $2`,
      [PRUNE_AGENT, idW2],
    );
    assert.equal(rows[0]?.count, '0', 'the strength-0.05 edge must be deleted');
  });

  it('keeps edges with strength >= 0.1', async () => {
    const { rows } = await pool.query<{ strength: number }>(
      `SELECT strength FROM causal_edges WHERE agent_id = $1 AND effect_id = $2`,
      [PRUNE_AGENT, idW3],
    );
    assert.equal(rows.length, 1, 'the strength-0.5 edge must survive the cycle');
    assert.equal(rows[0]?.strength, 0.5);
  });
});

// ─── E2E tests — HTTP via real server ────────────────────────────────────────

describe('Causal Memory Graph — E2E (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  const E2E_AGENT = `${TEST_AGENT}-e2e`;
  let e2eCause: string, e2eEffect: string;

  before(async () => {
    await cleanupAgent(E2E_AGENT);
    await ensureAgent(E2E_AGENT);
    e2eCause = await seedWarm(E2E_AGENT, 'E2E causal chain root memory', 'cg-e2e-cause');
    e2eEffect = await seedWarm(E2E_AGENT, 'E2E causal chain downstream memory', 'cg-e2e-effect');
    await seedEdge(E2E_AGENT, e2eCause, e2eEffect, 0.5, 0.5);

    const app = createApp({
      manager,
      auditChain: null,
      classifierRegistry: createDefaultRegistry(),
      rateLimitMax: 0,
    });
    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://localhost:${addr.port}`;
  });

  after(async () => {
    server.close();
    await cleanupAgent(E2E_AGENT);
  });

  it('GET /memory/:id/causal returns the chain for a memory with edges', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/causal?memory_id=${e2eCause}&direction=effects`);

    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: Array<{ memory_id: unknown; content: string; direction: string; depth: number }> };
    assert.equal(body.ok, true);
    assert.equal(body.data.length, 1);
    assert.equal(String(body.data[0]?.memory_id), e2eEffect);
    assert.equal(body.data[0]?.content, 'E2E causal chain downstream memory');
    assert.equal(body.data[0]?.direction, 'effect');
    assert.equal(body.data[0]?.depth, 1);
  });

  it('GET /memory/:id/causal without memory_id returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/causal?direction=effects`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('memory_id'), `error must mention memory_id: ${body.error}`);
  });

  it('GET /memory/:id/causal with a bad direction returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/causal?memory_id=${e2eCause}&direction=sideways`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('direction'), `error must mention direction: ${body.error}`);
  });

  it('GET /memory/:id/causal with depth=0 returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/causal?memory_id=${e2eCause}&direction=effects&depth=0`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('depth'), `error must mention depth: ${body.error}`);
  });

  it('GET /memory/:id/causal with depth=11 returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/causal?memory_id=${e2eCause}&direction=effects&depth=11`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('depth'), `error must mention depth: ${body.error}`);
  });

  it('GET /memory/:id/causal with memory_id beyond int8 range returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/causal?memory_id=99999999999999999999999&direction=effects`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('memory_id'), `error must mention memory_id: ${body.error}`);
  });

  it('GET /memory/:id/causal with an invalid agent id returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/bad%20agent/causal?memory_id=1&direction=effects`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('agentId'), `error must mention agentId: ${body.error}`);
  });

  it('GET /memory/:id/causal with an unknown memory_id returns 200 with an empty array', async () => {
    // Documented behavior: the traversal cannot distinguish "memory does not
    // exist" from "memory has no edges", so both yield 200 [] — never 404.
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/causal?memory_id=999999998&direction=effects`);

    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: unknown[] };
    assert.equal(body.ok, true);
    assert.deepEqual(body.data, []);
  });

  it('POST /memory/:id/predict returns predictions for a matching context', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'E2E causal chain root' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: { predicted_events: Array<{ memory_id: unknown; probability: number }> } };
    assert.equal(body.ok, true);
    assert.equal(body.data.predicted_events.length, 1);
    assert.equal(String(body.data.predicted_events[0]?.memory_id), e2eEffect);
    assert.equal(body.data.predicted_events[0]?.probability, expectedProbability(0.5, 0.5));
  });

  it('POST /memory/:id/predict without context returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean };
    assert.equal(body.ok, false);
  });

  it('POST /memory/:id/predict with context over 10000 characters returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'x'.repeat(10_001) }),
    });

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean };
    assert.equal(body.ok, false);
  });
});

// ─── Migration tests — v3.10 causal_edges ────────────────────────────────────

describe('Migration v3.10 — causal_edges', () => {
  it('table exists with the expected columns and types', async () => {
    const { rows } = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'causal_edges'`,
    );
    const cols = new Map(rows.map((r) => [r.column_name, r.data_type]));

    assert.equal(cols.get('id'), 'bigint');
    assert.equal(cols.get('agent_id'), 'text');
    assert.equal(cols.get('cause_id'), 'bigint');
    assert.equal(cols.get('effect_id'), 'bigint');
    assert.equal(cols.get('strength'), 'real');
    assert.equal(cols.get('observation_count'), 'integer');
    assert.equal(cols.get('avg_lag_seconds'), 'real');
    assert.equal(cols.get('confidence'), 'real');
    assert.equal(cols.get('created_at'), 'timestamp with time zone');
  });

  it('has a UNIQUE constraint on (agent_id, cause_id, effect_id)', async () => {
    const { rows } = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'causal_edges'::regclass AND contype = 'u'`,
    );

    assert.equal(rows.length, 1, 'exactly one unique constraint expected');
    assert.equal(rows[0]?.def, 'UNIQUE (agent_id, cause_id, effect_id)');
  });

  it('has the (agent_id, cause_id) traversal index', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'causal_edges' AND indexname = 'causal_edges_agent_cause_idx'`,
    );

    assert.equal(rows.length, 1, 'causal_edges_agent_cause_idx must exist');
    assert.ok(rows[0]?.indexdef.includes('agent_id'), 'index must include agent_id');
    assert.ok(rows[0]?.indexdef.includes('cause_id'), 'index must include cause_id');
  });

  it('has the (agent_id, effect_id) traversal index', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'causal_edges' AND indexname = 'causal_edges_agent_effect_idx'`,
    );

    assert.equal(rows.length, 1, 'causal_edges_agent_effect_idx must exist');
    assert.ok(rows[0]?.indexdef.includes('agent_id'), 'index must include agent_id');
    assert.ok(rows[0]?.indexdef.includes('effect_id'), 'index must include effect_id');
  });

  it('has row level security enabled with the agent-isolation policy', async () => {
    const { rows: rls } = await pool.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'causal_edges'`,
    );
    assert.equal(rls[0]?.relrowsecurity, true, 'RLS must be enabled on causal_edges');

    const { rows: policies } = await pool.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE tablename = 'causal_edges'`,
    );
    assert.ok(
      policies.some((p) => p.policyname === 'causal_edges_agent_isolation'),
      'causal_edges_agent_isolation policy must exist',
    );
  });
});

// ─── Teardown ────────────────────────────────────────────────────────────────

after(async () => {
  await pool.end();
  await closePool();
});
