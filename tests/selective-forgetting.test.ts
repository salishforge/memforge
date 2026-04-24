// MemForge — Selective forgetting (deprecated namespaces)
//
// Validates the deprecate/undeprecate API and Phase 5.10 decay behavior.
//
// Run: node --import tsx/esm --test tests/selective-forgetting.test.ts
// Requires DATABASE_URL.

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { SleepCycleEngine } = await import('../src/sleep-cycle.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const TEST_AGENT = 'test-agent-selective-forgetting';
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
    includeReflection: true,
    weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
  },
});

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM deprecated_namespaces WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM drift_signals WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

async function seedMemory(
  content: string,
  namespace: string,
  importance = 0.7,
  confidence = 0.7,
  graduated = false,
): Promise<bigint> {
  const { rows } = await pool.query<{ id: bigint }>(
    `INSERT INTO warm_tier (agent_id, content, importance, confidence, graduated, namespace, time_start, time_end)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())
     RETURNING id`,
    [TEST_AGENT, content, importance, confidence, graduated, namespace],
  );
  return rows[0]!.id;
}

async function getRow(id: bigint): Promise<{ importance: number; confidence: number } | null> {
  const { rows } = await pool.query<{ importance: number; confidence: number }>(
    `SELECT importance, confidence FROM warm_tier WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

function newEngine(): InstanceType<typeof SleepCycleEngine> {
  return new SleepCycleEngine(
    pool,
    { chat: async () => '', summarize: async () => '' } as never,
    new NoOpEmbeddingProvider(),
    // evictionThreshold raised to 0 so the test row isn't swept by Phase 2
    // before Phase 5.10 has a chance to decay it.
    { evictionThreshold: 0.0, revisionThreshold: 0.4 },
  );
}

describe('Selective forgetting — deprecated namespaces', () => {
  beforeEach(async () => {
    await cleanup();
    await pool.query(
      `INSERT INTO agents (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [TEST_AGENT],
    );
  });

  it('deprecateNamespace records the namespace and returns the result', async () => {
    const result = await manager.deprecateNamespace(TEST_AGENT, 'old-domain', 'team reorg');
    assert.equal(result.deprecated, true);
    assert.equal(result.namespace, 'old-domain');

    const list = await manager.listDeprecatedNamespaces(TEST_AGENT);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.namespace, 'old-domain');
    assert.equal(list[0]!.reason, 'team reorg');
  });

  it('undeprecateNamespace removes the entry', async () => {
    await manager.deprecateNamespace(TEST_AGENT, 'old-domain');
    const result = await manager.undeprecateNamespace(TEST_AGENT, 'old-domain');
    assert.equal(result.restored, true);

    const list = await manager.listDeprecatedNamespaces(TEST_AGENT);
    assert.equal(list.length, 0);
  });

  it('undeprecateNamespace on a non-deprecated namespace returns restored:false', async () => {
    const result = await manager.undeprecateNamespace(TEST_AGENT, 'never-deprecated');
    assert.equal(result.restored, false);
  });

  it('Phase 5.10 decays importance and confidence in deprecated namespaces', async () => {
    const id = await seedMemory('forgettable', 'old-domain', 0.7, 0.7, false);
    await manager.deprecateNamespace(TEST_AGENT, 'old-domain');

    const before = (await getRow(id))!;
    const result = await newEngine().run(TEST_AGENT);
    const after = (await getRow(id))!;

    assert.ok(result.deprecated_decayed === 1, `expected 1 row decayed, got ${result.deprecated_decayed}`);
    assert.ok(after.importance < before.importance, `importance should drop, ${before.importance} → ${after.importance}`);
    assert.ok(after.confidence < before.confidence, `confidence should drop, ${before.confidence} → ${after.confidence}`);
    // Sanity: drops by ~0.1 (importance) and ~0.05 (confidence) for non-graduated rows.
    // Phase 1 may also adjust importance, so we only assert direction here.
  });

  it('does NOT decay rows in non-deprecated namespaces', async () => {
    const keep = await seedMemory('keep me', 'live-domain', 0.7, 0.7);
    const drop = await seedMemory('decay me', 'old-domain', 0.7, 0.7);
    await manager.deprecateNamespace(TEST_AGENT, 'old-domain');

    await newEngine().run(TEST_AGENT);

    const dropAfter = (await getRow(drop))!;
    const keepAfter = (await getRow(keep))!;

    assert.ok(dropAfter.confidence < 0.7, 'deprecated namespace row should lose confidence');
    assert.equal(keepAfter.confidence, 0.7, 'live namespace row should NOT lose confidence');
  });

  it('graduated rows decay at half rate', async () => {
    const grad = await seedMemory('stable but deprecated', 'old-domain', 0.8, 0.8, true);
    const norm = await seedMemory('decay normally', 'old-domain', 0.8, 0.8, false);
    await manager.deprecateNamespace(TEST_AGENT, 'old-domain');

    await newEngine().run(TEST_AGENT);

    const gradAfter = (await getRow(grad))!;
    const normAfter = (await getRow(norm))!;

    // Graduated drops by 0.025, normal by 0.05 (Phase 1 may also adjust;
    // we just assert graduated lost less confidence than normal).
    const gradLoss = 0.8 - gradAfter.confidence;
    const normLoss = 0.8 - normAfter.confidence;
    assert.ok(gradLoss < normLoss,
      `graduated loss (${gradLoss.toFixed(3)}) should be less than normal loss (${normLoss.toFixed(3)})`);
  });

  it('importance and confidence respect floors (0.0 and 0.1)', async () => {
    const id = await seedMemory('already low', 'old-domain', 0.05, 0.12);
    await manager.deprecateNamespace(TEST_AGENT, 'old-domain');

    // Run several cycles to push past floors
    for (let i = 0; i < 5; i++) {
      await newEngine().run(TEST_AGENT);
    }

    const after = (await getRow(id))!;
    assert.ok(after.importance >= 0.0, 'importance must stay ≥ 0');
    assert.ok(after.confidence >= 0.1, 'confidence must stay ≥ 0.1 (the established floor)');
  });

  it('un-deprecating stops further decay on subsequent cycles', async () => {
    const id = await seedMemory('borderline', 'old-domain', 0.7, 0.7);
    await manager.deprecateNamespace(TEST_AGENT, 'old-domain');

    await newEngine().run(TEST_AGENT);
    const afterDecay = (await getRow(id))!;

    await manager.undeprecateNamespace(TEST_AGENT, 'old-domain');
    const result = await newEngine().run(TEST_AGENT);

    assert.equal(result.deprecated_decayed ?? 0, 0,
      'no rows should be decayed once the namespace is restored');

    // confidence should not drop further from the un-deprecate cycle. It may
    // shift up or down from Phase 1 scoring, but Phase 5.10 itself should
    // contribute zero further decay.
    const final = (await getRow(id))!;
    assert.ok(
      Math.abs(final.confidence - afterDecay.confidence) < 0.06,
      `confidence should be stable after undeprecate, was ${afterDecay.confidence} → ${final.confidence}`,
    );
  });
});

after(async () => {
  await cleanup();
  await pool.end();
  await closePool();
});
