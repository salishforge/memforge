// MemForge — Multi-Device Identity Tests (v3.5)
//
// Validates the multi-device feature: one agent_id shared across many devices,
// with per-project namespace compartmentalization, per-session hot-tier
// isolation, cross-namespace consolidation propagation, and config hot-reload.
//
// Requires: DATABASE_URL pointing to a test database with schema applied
// (must be at v3.5 — apply schema/migration-v3.5.sql or refresh from schema.sql).
//
// Run: node --import tsx/esm --test tests/multi-device.test.ts

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { reloadConfig, __resetConfigForTests } = await import('../src/config.js');
const { closePool } = await import('../src/db.js');

// ─── Setup ───────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const AGENT = 'test-multi-device';

async function ensureAgent(): Promise<void> {
  await pool.query(
    `INSERT INTO agents (id, metadata) VALUES ($1, '{}') ON CONFLICT (id) DO NOTHING`,
    [AGENT],
  );
}

async function cleanupAgent(): Promise<void> {
  await pool.query(`DELETE FROM memory_conflicts WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM memory_revisions WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM procedures WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM reflections WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM warm_tier_entities WHERE warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = $1)`, [AGENT]);
  await pool.query(`DELETE FROM relationships WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM entities WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM cold_tier WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM consolidation_log WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [AGENT]);
}

function makeManager() {
  return new MemoryManager({
    databaseUrl: DATABASE_URL!,
    consolidationBatchSize: 500,
    consolidationInnerBatchSize: 50,
    consolidationThreshold: 1,
    autoRegisterAgents: false,
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
}

before(async () => {
  await cleanupAgent();
  await ensureAgent();
});

beforeEach(async () => {
  await cleanupAgent();
  await ensureAgent();
  __resetConfigForTests({});
});

after(async () => {
  await cleanupAgent();
  await pool.end();
  await closePool();
});

// ─── Test 1: Per-session hot-tier isolation ──────────────────────────────────
//
// Two devices write to the same (agent, namespace) but with different
// session_ids. Hot-tier rows are tagged distinctly; queries can filter by
// session_id; consolidation aggregates across all sessions of the namespace.

describe('multi-device hot-tier isolation', () => {
  it('records distinct session_id per writer in hot_tier', async () => {
    const manager = makeManager();

    await manager.add(AGENT, 'event from device A', {}, 'neutral', undefined, 'project-alpha', 'device-a-session');
    await manager.add(AGENT, 'event from device B', {}, 'neutral', undefined, 'project-alpha', 'device-b-session');

    const rows = await pool.query<{ content: string; session_id: string }>(
      `SELECT content, session_id FROM hot_tier WHERE agent_id = $1 ORDER BY id ASC`,
      [AGENT],
    );

    assert.equal(rows.rows.length, 2);
    assert.equal(rows.rows[0]!.session_id, 'device-a-session');
    assert.equal(rows.rows[1]!.session_id, 'device-b-session');
  });

  it('defaults session_id to "default" when omitted', async () => {
    const manager = makeManager();
    await manager.add(AGENT, 'no-session event', {}, 'neutral', undefined, 'default');

    const row = await pool.query<{ session_id: string }>(
      `SELECT session_id FROM hot_tier WHERE agent_id = $1`,
      [AGENT],
    );
    assert.equal(row.rows[0]!.session_id, 'default');
  });

  it('rejects malformed session_id', async () => {
    const manager = makeManager();
    await assert.rejects(
      () => manager.add(AGENT, 'event', {}, 'neutral', undefined, 'default', 'has spaces and !'),
      /Invalid session_id/,
    );
  });

  it('strips caller-supplied _session_id and _client_id from metadata', async () => {
    const manager = makeManager();
    await manager.add(
      AGENT,
      'forged metadata attempt',
      { _session_id: 'forged-session', _client_id: 'forged-client', user_field: 'kept' },
      'neutral',
      undefined,
      'default',
      'real-session',
      'real-client-id',
    );

    const row = await pool.query<{ metadata: Record<string, unknown>; session_id: string }>(
      `SELECT metadata, session_id FROM hot_tier WHERE agent_id = $1`,
      [AGENT],
    );
    const md = row.rows[0]!.metadata;
    // Forged values stripped; real session_id from typed column; real client_id injected
    assert.equal(row.rows[0]!.session_id, 'real-session');
    assert.equal(md['_client_id'], 'real-client-id');
    assert.equal(md['_session_id'], undefined, '_session_id must not appear in metadata');
    assert.equal(md['user_field'], 'kept');
  });
});

// ─── Test 2: Cross-namespace consolidation ───────────────────────────────────
//
// Project-scoped hot tiers consolidate into a shared warm namespace when
// targetNamespace differs from source. Origin namespace is recorded in
// metadata for provenance.

describe('cross-namespace consolidation', () => {
  it('writes warm rows to targetNamespace and records _origin_namespace', async () => {
    const manager = makeManager();

    await manager.add(AGENT, 'alpha event 1', {}, 'neutral', undefined, 'project-alpha', 'sess-a');
    await manager.add(AGENT, 'alpha event 2', {}, 'neutral', undefined, 'project-alpha', 'sess-a');

    const result = await manager.consolidate(AGENT, 'concat', {
      namespace: 'project-alpha',
      targetNamespace: 'shared',
    });

    assert.equal(result.status, 'complete');
    assert.ok(result.warm_rows_created > 0);

    const warm = await pool.query<{ namespace: string; metadata: Record<string, unknown>; session_id: string | null }>(
      `SELECT namespace, metadata, session_id FROM warm_tier WHERE agent_id = $1`,
      [AGENT],
    );
    assert.equal(warm.rows.length, 1);
    assert.equal(warm.rows[0]!.namespace, 'shared');
    assert.equal(warm.rows[0]!.metadata['_origin_namespace'], 'project-alpha');
    assert.equal(warm.rows[0]!.session_id, 'sess-a');
  });

  it('echoes source namespace as target when neither config nor opts override', async () => {
    const manager = makeManager();
    await manager.add(AGENT, 'beta event', {}, 'neutral', undefined, 'project-beta', 'sess-b');

    await manager.consolidate(AGENT, 'concat', { namespace: 'project-beta' });

    const warm = await pool.query<{ namespace: string; metadata: Record<string, unknown> }>(
      `SELECT namespace, metadata FROM warm_tier WHERE agent_id = $1`,
      [AGENT],
    );
    assert.equal(warm.rows[0]!.namespace, 'project-beta');
    // Same namespace → no _origin_namespace tag (not crossNamespace)
    assert.equal(warm.rows[0]!.metadata['_origin_namespace'], undefined);
  });

  it('honors WARM_CONSOLIDATION_TARGET from config', async () => {
    __resetConfigForTests({ WARM_CONSOLIDATION_TARGET: 'shared' });
    const manager = makeManager();

    await manager.add(AGENT, 'gamma event', {}, 'neutral', undefined, 'project-gamma', 'sess-g');
    await manager.consolidate(AGENT, 'concat', { namespace: 'project-gamma' });

    const warm = await pool.query<{ namespace: string }>(
      `SELECT namespace FROM warm_tier WHERE agent_id = $1`,
      [AGENT],
    );
    assert.equal(warm.rows[0]!.namespace, 'shared');
  });
});

// ─── Test 3: Concurrent consolidation safety ─────────────────────────────────

describe('concurrent consolidation', () => {
  it('serializes two concurrent consolidations on the same (agent, namespace)', async () => {
    const manager = makeManager();
    for (let i = 0; i < 10; i++) {
      await manager.add(AGENT, `event ${i}`, {}, 'neutral', undefined, 'project-alpha', 'sess-x');
    }

    // Fire two consolidations in parallel; advisory lock should serialize them.
    const [r1, r2] = await Promise.all([
      manager.consolidate(AGENT, 'concat', { namespace: 'project-alpha' }),
      manager.consolidate(AGENT, 'concat', { namespace: 'project-alpha' }),
    ]);
    assert.equal(r1.status, 'complete');
    assert.equal(r2.status, 'complete');
    // Combined warm rows should equal the original hot count (no duplication, no loss)
    const warmCount = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM warm_tier WHERE agent_id = $1`,
      [AGENT],
    );
    // With INNER_BATCH_SIZE 50 and 10 events, exactly 1 warm row total.
    assert.equal(parseInt(warmCount.rows[0]!.n, 10), 1);
  });

  it('runs different-namespace consolidations in parallel without contention', async () => {
    const manager = makeManager();
    for (let i = 0; i < 5; i++) {
      await manager.add(AGENT, `alpha ${i}`, {}, 'neutral', undefined, 'project-alpha', 'sess-a');
      await manager.add(AGENT, `beta ${i}`, {}, 'neutral', undefined, 'project-beta', 'sess-b');
    }

    const [r1, r2] = await Promise.all([
      manager.consolidate(AGENT, 'concat', { namespace: 'project-alpha' }),
      manager.consolidate(AGENT, 'concat', { namespace: 'project-beta' }),
    ]);
    assert.equal(r1.warm_rows_created + r2.warm_rows_created, 2);
  });
});

// ─── Test 4: Config hot-reload ───────────────────────────────────────────────

describe('config hot-reload', () => {
  it('reloadConfig applies overrides without restart', async () => {
    __resetConfigForTests({ WARM_CONSOLIDATION_TARGET: 'a' });

    const before = reloadConfig({ WARM_CONSOLIDATION_TARGET: 'b' });
    assert.deepEqual(before.changed, ['WARM_CONSOLIDATION_TARGET']);

    // Re-applying same value should report no changes
    const stable = reloadConfig({ WARM_CONSOLIDATION_TARGET: 'b' });
    assert.deepEqual(stable.changed, []);
  });

  it('reloadConfig without overrides re-reads process.env', async () => {
    __resetConfigForTests({});
    process.env['WARM_CONSOLIDATION_TARGET'] = 'env-driven-target';
    try {
      const result = reloadConfig();
      assert.deepEqual(result.changed, ['WARM_CONSOLIDATION_TARGET']);
      assert.ok(result.active.includes('WARM_CONSOLIDATION_TARGET'));
    } finally {
      delete process.env['WARM_CONSOLIDATION_TARGET'];
      __resetConfigForTests({});
    }
  });
});
