// MemForge — Memory Budgeting Tests (Sprint E, Phase 2)
//
// Tests the per-agent warm_tier hard cap enforced during the sleep cycle.
// All tests insert rows with explicit importance values so behaviour is
// deterministic — no sleeps, no time-travel in Postgres.
//
// Run: node --import tsx/esm --test tests/memory-budgeting.test.ts
//
// WARNING: Requires DATABASE_URL pointing to a test database with schema applied.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { MockLLMProvider } = await import('./mocks/mock-llm-provider.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');

// ─── Setup ───────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const AGENT = 'test-budget-agent';

const pool = new Pool({ connectionString: DATABASE_URL });
const mockLlm = new MockLLMProvider();

async function ensureAgent(): Promise<void> {
  await pool.query(
    `INSERT INTO agents (id, metadata) VALUES ($1, '{}') ON CONFLICT (id) DO NOTHING`,
    [AGENT],
  );
}

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM audit_chain WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM memory_revisions WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM warm_tier_entities WHERE warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = $1)`, [AGENT]);
  await pool.query(`DELETE FROM cold_tier WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [AGENT]);
}

/** Insert N warm rows with importance values spread evenly across [minImp, maxImp]. */
async function insertWarmRows(opts: {
  count: number;
  namespace?: string;
  graduated?: boolean;
  importances?: number[];
}): Promise<void> {
  const ns = opts.namespace ?? 'default';
  const importances = opts.importances
    ?? Array.from({ length: opts.count }, (_, i) =>
        parseFloat(((i + 1) / opts.count).toFixed(4)));
  for (const imp of importances) {
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, source_hot_ids, metadata, importance, graduated, namespace)
       VALUES ($1, $2, '{}', '{}', $3, $4, $5)`,
      [AGENT, `memory with importance ${imp}`, imp, opts.graduated ?? false, ns],
    );
  }
}

async function warmCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM warm_tier WHERE agent_id = $1`,
    [AGENT],
  );
  return parseInt(rows[0]!.count, 10);
}

async function coldCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM cold_tier WHERE agent_id = $1`,
    [AGENT],
  );
  return parseInt(rows[0]!.count, 10);
}

function makeManager(sleepOverrides: { warmTierMaxPerAgent?: number; evictionThreshold?: number }): InstanceType<typeof MemoryManager> {
  return new MemoryManager({
    databaseUrl: DATABASE_URL!,
    autoRegisterAgents: true,
    embeddingProvider: new NoOpEmbeddingProvider(),
    llmProvider: mockLlm,
    sleepCycle: {
      tokenBudget: 100_000,
      // Default threshold is low enough not to interfere unless explicitly raised in a test
      evictionThreshold: sleepOverrides.evictionThreshold ?? 0.0,
      revisionThreshold: 0.0,
      includeReflection: false,
      weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
      warmTierMaxPerAgent: sleepOverrides.warmTierMaxPerAgent,
    },
  });
}

// ─── 1. Cap disabled (default) ───────────────────────────────────────────────

describe('memory budgeting — cap disabled (default)', () => {
  const manager = makeManager({ warmTierMaxPerAgent: 0 });

  before(async () => {
    await cleanup();
    await ensureAgent();
    await insertWarmRows({ count: 50 });
  });
  after(cleanup);

  it('does not evict any rows when cap is 0', async () => {
    const result = await manager.sleep(AGENT);

    assert.equal(result.capacity_evicted, undefined, 'capacity_evicted must be absent');
    assert.equal(await warmCount(), 50, 'all 50 rows must remain');
  });
});

// ─── 2. Within cap ───────────────────────────────────────────────────────────

describe('memory budgeting — within cap', () => {
  const manager = makeManager({ warmTierMaxPerAgent: 20 });

  before(async () => {
    await cleanup();
    await ensureAgent();
    await insertWarmRows({ count: 10 });
  });
  after(cleanup);

  it('does not evict when row count is below cap', async () => {
    const result = await manager.sleep(AGENT);

    assert.equal(result.capacity_evicted, undefined);
    assert.equal(await warmCount(), 10);
  });
});

// ─── 3. Exactly at cap ───────────────────────────────────────────────────────

describe('memory budgeting — exactly at cap', () => {
  const manager = makeManager({ warmTierMaxPerAgent: 20 });

  before(async () => {
    await cleanup();
    await ensureAgent();
    await insertWarmRows({ count: 20 });
  });
  after(cleanup);

  it('does not evict when row count equals cap', async () => {
    const result = await manager.sleep(AGENT);

    assert.equal(result.capacity_evicted, undefined);
    assert.equal(await warmCount(), 20);
  });
});

// ─── 4. Over cap — correct count and lowest-importance rows evicted ──────────

describe('memory budgeting — over cap', () => {
  const manager = makeManager({ warmTierMaxPerAgent: 20 });

  // 30 rows with importance 0.1, 0.13, 0.17, … spread evenly through (0, 1]
  const importances = Array.from({ length: 30 }, (_, i) =>
    parseFloat(((i + 1) / 10).toFixed(2)));

  before(async () => {
    await cleanup();
    await ensureAgent();
    await insertWarmRows({ count: 30, importances });
  });
  after(cleanup);

  it('evicts exactly 10 rows and they are the 10 lowest-importance', async () => {
    const result = await manager.sleep(AGENT);

    // Exactly 10 capacity-evicted rows
    assert.equal(result.capacity_evicted, 10);
    assert.equal(await warmCount(), 20, 'exactly cap rows remain in warm');

    // The 10 evicted rows must be in cold_tier
    assert.equal(await coldCount(), 10);

    // The surviving warm rows must be the 20 highest-importance
    const { rows: surviving } = await pool.query<{ importance: number }>(
      `SELECT importance FROM warm_tier WHERE agent_id = $1 ORDER BY importance ASC`,
      [AGENT],
    );
    const lowestSurviving = surviving[0]!.importance;
    const expectedCutoff = importances.sort((a, b) => a - b)[10]!; // 11th lowest
    assert.ok(lowestSurviving >= expectedCutoff - 0.001,
      `lowest surviving importance ${lowestSurviving} should be >= ${expectedCutoff}`);
  });

  it('evicted rows appear in cold_tier with correct namespace', async () => {
    // cold_tier was populated by the previous test run — re-check namespace
    const { rows } = await pool.query<{ namespace: string }>(
      `SELECT DISTINCT namespace FROM cold_tier WHERE agent_id = $1`,
      [AGENT],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.namespace, 'default');
  });
});

// ─── 5. Capacity eviction respects namespace (cross-namespace) ───────────────

describe('memory budgeting — cross-namespace cap', () => {
  const manager = makeManager({ warmTierMaxPerAgent: 20 });

  before(async () => {
    await cleanup();
    await ensureAgent();
    // 15 rows in ns 'a', 20 rows in ns 'b' — 35 total, cap=20, evict 15
    await insertWarmRows({ count: 15, namespace: 'a' });
    await insertWarmRows({ count: 20, namespace: 'b' });
  });
  after(cleanup);

  it('evicts by importance regardless of namespace until total equals cap', async () => {
    const result = await manager.sleep(AGENT);

    assert.equal(result.capacity_evicted, 15);
    assert.equal(await warmCount(), 20, 'total across all namespaces equals cap');
    assert.equal(await coldCount(), 15, '15 rows in cold_tier');
  });
});

// ─── 6. Interaction with threshold eviction ───────────────────────────────────

describe('memory budgeting — threshold + capacity interaction', () => {
  // evictionThreshold=0.3 evicts rows with importance < 0.3 (2 rows: 0.1 and 0.2)
  // cap=10 means after threshold pass leaves 13, capacity evicts 3 more
  const manager = makeManager({ warmTierMaxPerAgent: 10, evictionThreshold: 0.3 });

  // 15 rows: importance 0.1, 0.2, 0.3, 0.4, … 1.5 (step 0.1)
  const importances = Array.from({ length: 15 }, (_, i) =>
    parseFloat(((i + 1) * 0.1).toFixed(1)));

  before(async () => {
    await cleanup();
    await ensureAgent();
    await insertWarmRows({ count: 15, importances });
  });
  after(cleanup);

  it('threshold removes sub-0.3 rows, then capacity removes the next lowest until exactly 10 remain', async () => {
    const result = await manager.sleep(AGENT);

    // 2 threshold-evicted (0.1, 0.2) + 3 capacity-evicted (0.3, 0.4, 0.5) = 5 total evicted
    assert.equal(result.phase2_evicted, 2, 'threshold should remove 2 rows');
    assert.equal(result.capacity_evicted, 3, 'capacity should remove 3 more');
    assert.equal(await warmCount(), 10, 'exactly 10 remain');
    assert.equal(await coldCount(), 5, '5 total in cold_tier');
  });
});

// ─── 7. Graduated rows are still evictable ───────────────────────────────────

describe('memory budgeting — graduated rows are not exempt from cap', () => {
  const manager = makeManager({ warmTierMaxPerAgent: 5 });

  before(async () => {
    await cleanup();
    await ensureAgent();
    // 9 normal rows with importance 0.5..0.9
    await insertWarmRows({
      count: 9,
      importances: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9],
    });
    // 1 graduated row with very low importance — should be evicted despite graduation
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, source_hot_ids, metadata, importance, graduated, namespace)
       VALUES ($1, 'graduated but low importance', '{}', '{}', 0.1, true, 'default')`,
      [AGENT],
    );
  });
  after(cleanup);

  it('evicts the graduated low-importance row because cap is a hard limit', async () => {
    const result = await manager.sleep(AGENT);

    // 10 rows total, cap=5, evict 5 (the 5 lowest: 0.1-graduated, 0.5, 0.55, 0.6, 0.65)
    assert.equal(result.capacity_evicted, 5);
    assert.equal(await warmCount(), 5);

    // Specifically confirm the graduated row is gone from warm_tier
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM warm_tier WHERE agent_id = $1 AND graduated = true`,
      [AGENT],
    );
    assert.equal(parseInt(rows[0]!.count, 10), 0, 'graduated row must have been evicted');

    // And it must be in cold_tier
    const { rows: coldRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM cold_tier
       WHERE agent_id = $1 AND content = 'graduated but low importance'`,
      [AGENT],
    );
    assert.equal(parseInt(coldRows[0]!.count, 10), 1, 'graduated row must be in cold_tier');
  });
});
