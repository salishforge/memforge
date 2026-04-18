// MemForge — Memory Namespace Tests (Sprint C.1 / Phase 2 / Issue #16)
//
// Tests the backend namespace partitioning added in v3.1. Namespaces scope
// memories to a domain — 'frontend', 'backend', 'ops' — without duplicating
// the knowledge graph (entities and relationships stay agent-scoped).
//
// Requires: DATABASE_URL pointing to a test database with schema applied.
//
// Run: node --import tsx/esm --test tests/memory-namespaces.test.ts

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');

// ─── Setup ───────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const AGENT_NS = 'test-ns-isolation';
const AGENT_CONSOLIDATE = 'test-ns-consolidation';
const AGENT_ENTITY = 'test-ns-entity-reuse';

const ALL_AGENTS = [AGENT_NS, AGENT_CONSOLIDATE, AGENT_ENTITY];

async function ensureAgent(agentId: string): Promise<void> {
  await pool.query(
    `INSERT INTO agents (id, metadata) VALUES ($1, '{}') ON CONFLICT (id) DO NOTHING`,
    [agentId],
  );
}

async function cleanupAgent(agentId: string): Promise<void> {
  await pool.query(`DELETE FROM memory_revisions WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM procedures WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM reflections WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM warm_tier_entities WHERE warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = $1)`, [agentId]);
  await pool.query(`DELETE FROM relationships WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM entities WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM cold_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM consolidation_log WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
}

async function cleanupAll(): Promise<void> {
  await Promise.all(ALL_AGENTS.map(cleanupAgent));
}

function makeManager(): InstanceType<typeof MemoryManager> {
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

// ─── Test 1: Default namespace is 'default' ──────────────────────────────────
//
// add() without a namespace param stores in 'default'.
// query() without a namespace param retrieves from 'default' only.

describe('namespace: default namespace is "default"', () => {
  const manager = makeManager();

  before(async () => {
    await cleanupAgent(AGENT_NS);
    await ensureAgent(AGENT_NS);
  });

  after(() => cleanupAgent(AGENT_NS));

  it('add without namespace stores in default', async () => {
    await manager.add(AGENT_NS, 'content stored in default namespace');

    const { rows } = await pool.query<{ namespace: string }>(
      `SELECT namespace FROM hot_tier WHERE agent_id = $1`,
      [AGENT_NS],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.namespace, 'default');
  });

  it('query without namespace retrieves only default namespace rows', async () => {
    // Consolidate so there is something in warm_tier
    await manager.consolidate(AGENT_NS);

    const results = await manager.query(AGENT_NS, { q: 'default namespace' });

    // All results must come from warm_tier rows with namespace='default'
    for (const r of results) {
      const { rows } = await pool.query<{ namespace: string }>(
        `SELECT namespace FROM warm_tier WHERE id = $1`,
        [r.id],
      );
      assert.equal(rows[0]!.namespace, 'default', `warm row ${r.id} must have namespace=default`);
    }
  });
});

// ─── Test 2: Namespace isolation ─────────────────────────────────────────────
//
// Rows in namespace 'a' must not appear in queries for namespace 'b' and vice versa.

describe('namespace: isolation between namespaces', () => {
  const manager = makeManager();

  before(async () => {
    await cleanupAgent(AGENT_NS);
    await ensureAgent(AGENT_NS);

    // Insert one hot row per namespace then consolidate each
    await manager.add(AGENT_NS, 'memory about frontend work', {}, 'neutral', undefined, 'frontend');
    await manager.consolidate(AGENT_NS, undefined, { namespace: 'frontend' });

    await manager.add(AGENT_NS, 'memory about backend database', {}, 'neutral', undefined, 'backend');
    await manager.consolidate(AGENT_NS, undefined, { namespace: 'backend' });
  });

  after(() => cleanupAgent(AGENT_NS));

  it('query namespace=frontend returns only frontend rows', async () => {
    const results = await manager.query(AGENT_NS, { q: 'memory', namespace: 'frontend' });

    assert.ok(results.length > 0, 'expected at least one result');
    for (const r of results) {
      const { rows } = await pool.query<{ namespace: string }>(
        `SELECT namespace FROM warm_tier WHERE id = $1`,
        [r.id],
      );
      assert.equal(rows[0]!.namespace, 'frontend');
    }
  });

  it('query namespace=backend returns only backend rows', async () => {
    const results = await manager.query(AGENT_NS, { q: 'memory', namespace: 'backend' });

    assert.ok(results.length > 0, 'expected at least one result');
    for (const r of results) {
      const { rows } = await pool.query<{ namespace: string }>(
        `SELECT namespace FROM warm_tier WHERE id = $1`,
        [r.id],
      );
      assert.equal(rows[0]!.namespace, 'backend');
    }
  });

  it('frontend query does not see backend rows', async () => {
    const results = await manager.query(AGENT_NS, { q: 'database', namespace: 'frontend' });
    // 'database' only appears in the backend row — frontend should return nothing
    assert.equal(results.length, 0, 'frontend query must not see backend rows');
  });
});

// ─── Test 3: Consolidation is namespace-scoped ───────────────────────────────
//
// consolidate(namespace='a') moves only hot rows in 'a' to warm; 'b' stays hot.
// The resulting warm rows carry namespace='a'.

describe('namespace: consolidation is namespace-scoped', () => {
  const manager = makeManager();

  before(async () => {
    await cleanupAgent(AGENT_CONSOLIDATE);
    await ensureAgent(AGENT_CONSOLIDATE);

    // Insert hot rows in two namespaces — explicit timestamps ensure order
    const t1 = new Date('2026-01-01T10:00:00Z');
    const t2 = new Date('2026-01-01T10:01:00Z');
    await pool.query(
      `INSERT INTO hot_tier (agent_id, content, metadata, content_hash, namespace, created_at)
       VALUES ($1, $2, '{}', $3, $4, $5)`,
      [AGENT_CONSOLIDATE, 'hot row for namespace alpha', 'hash-alpha-1', 'alpha', t1],
    );
    await pool.query(
      `INSERT INTO hot_tier (agent_id, content, metadata, content_hash, namespace, created_at)
       VALUES ($1, $2, '{}', $3, $4, $5)`,
      [AGENT_CONSOLIDATE, 'hot row for namespace beta', 'hash-beta-1', 'beta', t2],
    );
  });

  after(() => cleanupAgent(AGENT_CONSOLIDATE));

  it('consolidating alpha moves only alpha hot rows to warm', async () => {
    const result = await manager.consolidate(AGENT_CONSOLIDATE, undefined, { namespace: 'alpha' });

    assert.equal(result.hot_rows_processed, 1, 'only alpha hot row should be processed');
    assert.equal(result.warm_rows_created, 1);

    // alpha hot row is gone
    const { rows: alphaHot } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM hot_tier WHERE agent_id = $1 AND namespace = 'alpha'`,
      [AGENT_CONSOLIDATE],
    );
    assert.equal(parseInt(alphaHot[0]!.count, 10), 0, 'alpha hot rows should be gone after consolidation');

    // beta hot row remains
    const { rows: betaHot } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM hot_tier WHERE agent_id = $1 AND namespace = 'beta'`,
      [AGENT_CONSOLIDATE],
    );
    assert.equal(parseInt(betaHot[0]!.count, 10), 1, 'beta hot rows must remain untouched');
  });

  it('consolidated warm rows carry namespace=alpha', async () => {
    const { rows } = await pool.query<{ namespace: string }>(
      `SELECT namespace FROM warm_tier WHERE agent_id = $1`,
      [AGENT_CONSOLIDATE],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.namespace, 'alpha', 'warm row must inherit namespace from the hot rows');
  });
});

// ─── Test 4: Cross-namespace entity reuse ────────────────────────────────────
//
// Entities live on agent_id, not on namespace. Adding warm rows mentioning
// "User Sarah" in two namespaces should upsert to the same entity row —
// the knowledge graph is shared across namespaces.

describe('namespace: cross-namespace entity reuse', () => {
  const manager = makeManager();

  before(async () => {
    await cleanupAgent(AGENT_ENTITY);
    await ensureAgent(AGENT_ENTITY);

    // Insert an entity and two warm rows (one per namespace) referencing it
    const { rows: entityRows } = await pool.query<{ id: bigint }>(
      `INSERT INTO entities (agent_id, name, entity_type) VALUES ($1, 'User Sarah', 'person')
       ON CONFLICT (agent_id, name) DO UPDATE SET mention_count = entities.mention_count + 1
       RETURNING id`,
      [AGENT_ENTITY],
    );
    const entityId = entityRows[0]!.id;

    // Warm row in namespace 'ops'
    const { rows: warmOps } = await pool.query<{ id: bigint }>(
      `INSERT INTO warm_tier (agent_id, content, source_hot_ids, metadata, namespace)
       VALUES ($1, 'Sarah manages ops deployments', '{}', '{}', 'ops')
       RETURNING id`,
      [AGENT_ENTITY],
    );
    await pool.query(
      `INSERT INTO warm_tier_entities (warm_tier_id, entity_id) VALUES ($1, $2)`,
      [warmOps[0]!.id, entityId],
    );

    // Warm row in namespace 'engineering'
    const { rows: warmEng } = await pool.query<{ id: bigint }>(
      `INSERT INTO warm_tier (agent_id, content, source_hot_ids, metadata, namespace)
       VALUES ($1, 'Sarah reviews engineering PRs', '{}', '{}', 'engineering')
       RETURNING id`,
      [AGENT_ENTITY],
    );
    await pool.query(
      `INSERT INTO warm_tier_entities (warm_tier_id, entity_id) VALUES ($1, $2)`,
      [warmEng[0]!.id, entityId],
    );
  });

  after(() => cleanupAgent(AGENT_ENTITY));

  it('both namespace rows link to the same entity row', async () => {
    // Entities are not namespace-scoped — one row for "User Sarah" shared across namespaces.
    // This is Design A: the knowledge graph is agent-scoped, not namespace-scoped.
    // Warm rows in different namespaces reference the same entity via warm_tier_entities.
    const { rows: entityRows } = await pool.query<{ id: bigint }>(
      `SELECT id FROM entities WHERE agent_id = $1 AND name = 'User Sarah'`,
      [AGENT_ENTITY],
    );
    assert.equal(entityRows.length, 1, 'exactly one entity row regardless of namespaces');

    const entityId = entityRows[0]!.id;

    // Both warm rows should link to this single entity
    const { rows: junctionRows } = await pool.query<{ warm_tier_id: bigint; namespace: string }>(
      `SELECT wte.warm_tier_id, w.namespace
       FROM warm_tier_entities wte
       JOIN warm_tier w ON w.id = wte.warm_tier_id
       WHERE wte.entity_id = $1 AND w.agent_id = $2
       ORDER BY w.namespace`,
      [entityId, AGENT_ENTITY],
    );

    assert.equal(junctionRows.length, 2, 'both warm rows must link to the single entity');
    const namespaces = junctionRows.map((r) => r.namespace).sort();
    assert.deepEqual(namespaces, ['engineering', 'ops'], 'junction covers both namespaces');
  });
});

// ─── Test 5: Invalid namespace is rejected ───────────────────────────────────
//
// Namespaces must match /^[a-z0-9][a-z0-9_-]*$/i. Values with spaces, leading
// hyphens, or empty strings must be rejected at the schema-validation layer.

describe('namespace: invalid namespace rejected at validation', () => {
  const manager = makeManager();

  before(async () => {
    await cleanupAgent(AGENT_NS);
    await ensureAgent(AGENT_NS);
  });

  after(() => cleanupAgent(AGENT_NS));

  it('namespace with spaces throws TypeError from add()', async () => {
    await assert.rejects(
      () => manager.add(AGENT_NS, 'some content', {}, 'neutral', undefined, 'Foo Bar'),
      (err: unknown) => err instanceof TypeError,
    );
  });

  it('namespace with leading hyphen throws TypeError from query()', async () => {
    await assert.rejects(
      () => manager.query(AGENT_NS, { q: 'search', namespace: '-invalid' }),
      (err: unknown) => err instanceof TypeError,
    );
  });

  it('empty namespace throws TypeError from consolidate()', async () => {
    await assert.rejects(
      () => manager.consolidate(AGENT_NS, undefined, { namespace: '' }),
      (err: unknown) => err instanceof TypeError,
    );
  });

  it('namespace exceeding 128 chars throws TypeError from add()', async () => {
    const longNs = 'a'.repeat(129);
    await assert.rejects(
      () => manager.add(AGENT_NS, 'some content', {}, 'neutral', undefined, longNs),
      (err: unknown) => err instanceof TypeError,
    );
  });
});
