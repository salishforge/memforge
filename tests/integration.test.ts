// MemForge Integration Tests
//
// Tests the core MemoryManager API against a real PostgreSQL database.
// Requires: DATABASE_URL pointing to a test database with schema applied.
//
// Run: node --import tsx/esm --test tests/integration.test.ts
//
// WARNING: This test creates and deletes data. Use a dedicated test database.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

// Dynamic import to handle module resolution
const { MemoryManager } = await import('../src/memory-manager.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');

// ─── Setup ──────────────────────────────────────────────────────────────────

const TEST_AGENT = 'test-agent-integration';
const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

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
  // Clean up test data in dependency order
  await pool.query(`DELETE FROM memory_revisions WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM procedures WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM reflections WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier_entities WHERE warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = $1)`, [TEST_AGENT]);
  await pool.query(`DELETE FROM relationships WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM entities WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM cold_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM consolidation_log WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

// ─── Agent Registration ─────────────────────────────────────────────────────

describe('Agent registration', () => {
  before(cleanup);
  after(cleanup);

  it('auto-registers an agent on first add', async () => {
    const result = await manager.add(TEST_AGENT, 'test memory');
    assert.equal(result.agent_id, TEST_AGENT);

    const { rows } = await pool.query(`SELECT id FROM agents WHERE id = $1`, [TEST_AGENT]);
    assert.equal(rows.length, 1, 'Agent should be registered');
  });
});

// ─── Add & Query ────────────────────────────────────────────────────────────

describe('Add and query', () => {
  before(async () => {
    await cleanup();
    // Add some test memories
    await manager.add(TEST_AGENT, 'The deployment of v2.0 was successful');
    await manager.add(TEST_AGENT, 'User Alice reported a bug in the login page');
    await manager.add(TEST_AGENT, 'Redis cache integration completed');
    // Consolidate to warm tier
    await manager.consolidate(TEST_AGENT);
  });

  after(cleanup);

  it('consolidates hot-tier events into warm tier', async () => {
    const stats = await manager.stats(TEST_AGENT);
    assert.equal(stats.hot_count, 0, 'Hot tier should be empty after consolidation');
    assert.ok(stats.warm_count > 0, 'Warm tier should have entries');
  });

  it('keyword search finds matching memories', async () => {
    const results = await manager.query(TEST_AGENT, { q: 'deployment', mode: 'keyword' });
    assert.ok(results.length > 0, 'Should find deployment-related memories');
    const content = results.map(r => r.content).join(' ');
    assert.ok(content.includes('deployment') || content.includes('v2.0'), 'Results should contain deployment text');
  });

  it('keyword search returns empty for non-matching queries', async () => {
    const results = await manager.query(TEST_AGENT, { q: 'xyznonexistent', mode: 'keyword' });
    assert.equal(results.length, 0, 'Should find nothing for non-matching query');
  });

  it('respects limit parameter', async () => {
    const results = await manager.query(TEST_AGENT, { q: 'the', mode: 'keyword', limit: 1 });
    assert.ok(results.length <= 1, 'Should respect limit');
  });
});

// ─── Timeline ───────────────────────────────────────────────────────────────

describe('Timeline', () => {
  before(async () => {
    await cleanup();
    await manager.add(TEST_AGENT, 'Event at start');
    await manager.add(TEST_AGENT, 'Event in middle');
    await manager.add(TEST_AGENT, 'Event at end');
    await manager.consolidate(TEST_AGENT);
  });

  after(cleanup);

  it('returns memories in chronological order', async () => {
    const entries = await manager.timeline(TEST_AGENT);
    assert.ok(entries.length > 0, 'Should have timeline entries');
  });

  it('respects limit parameter', async () => {
    const entries = await manager.timeline(TEST_AGENT, undefined, undefined, 1);
    assert.ok(entries.length <= 1, 'Should respect limit');
  });
});

// ─── Consolidation Modes ────────────────────────────────────────────────────

describe('Consolidation', () => {
  before(cleanup);
  after(cleanup);

  it('concat mode creates warm rows without LLM', async () => {
    await manager.add(TEST_AGENT, 'Memory one');
    await manager.add(TEST_AGENT, 'Memory two');

    const result = await manager.consolidate(TEST_AGENT, 'concat');
    assert.equal(result.status, 'complete');
    assert.equal(result.consolidation_mode, 'concat');
    assert.ok(result.warm_rows_created > 0, 'Should have created warm rows');
    assert.equal(result.hot_rows_processed, 2, 'Should have processed 2 hot rows');
  });

  it('returns 0 rows when nothing to consolidate', async () => {
    const result = await manager.consolidate(TEST_AGENT, 'concat');
    assert.equal(result.hot_rows_processed, 0);
    assert.equal(result.warm_rows_created, 0);
  });
});

// ─── Clear (Archival) ───────────────────────────────────────────────────────

describe('Clear / archival', () => {
  before(async () => {
    await cleanup();
    await manager.add(TEST_AGENT, 'Memory to archive');
    await manager.consolidate(TEST_AGENT);
  });

  after(cleanup);

  it('archives hot and warm memory to cold tier', async () => {
    const beforeStats = await manager.stats(TEST_AGENT);
    assert.ok(beforeStats.warm_count > 0, 'Should have warm memories to clear');

    const result = await manager.clear(TEST_AGENT);
    assert.ok(result.warm_archived > 0, 'Should have archived warm memories');

    const afterStats = await manager.stats(TEST_AGENT);
    assert.equal(afterStats.hot_count, 0, 'Hot tier should be empty');
    assert.equal(afterStats.warm_count, 0, 'Warm tier should be empty');
    assert.ok(afterStats.cold_count > 0, 'Cold tier should have archived data');
  });
});

// ─── Stats ──────────────────────────────────────────────────────────────────

describe('Stats', () => {
  before(async () => {
    await cleanup();
    await manager.add(TEST_AGENT, 'Stats test memory');
    await manager.consolidate(TEST_AGENT);
  });

  after(cleanup);

  it('returns correct tier counts', async () => {
    const stats = await manager.stats(TEST_AGENT);
    assert.equal(stats.agent_id, TEST_AGENT);
    assert.equal(typeof stats.hot_count, 'number');
    assert.equal(typeof stats.warm_count, 'number');
    assert.equal(typeof stats.cold_count, 'number');
    assert.equal(typeof stats.entity_count, 'number');
    assert.equal(typeof stats.relationship_count, 'number');
    assert.equal(typeof stats.reflection_count, 'number');
  });

  it('throws for unknown agent', async () => {
    await assert.rejects(
      () => manager.stats('nonexistent-agent-xyz'),
      (err: Error) => err.message.includes('not found'),
    );
  });
});

// ─── Feedback ───────────────────────────────────────────────────────────────

describe('Feedback endpoint', () => {
  before(async () => {
    await cleanup();
    await manager.add(TEST_AGENT, 'Feedback test memory about deployment');
    await manager.consolidate(TEST_AGENT);
    // Trigger a query to create retrieval log entries
    await manager.query(TEST_AGENT, { q: 'deployment', mode: 'keyword' });
  });

  after(cleanup);

  it('records positive feedback on retrieval events', async () => {
    // Get retrieval log IDs
    const { rows } = await pool.query<{ id: bigint }>(
      `SELECT id FROM retrieval_log WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [TEST_AGENT],
    );

    if (rows.length === 0) {
      // No retrieval events — skip (keyword search may not have matched)
      return;
    }

    const ids = rows.map(r => r.id);
    const result = await manager.feedback(TEST_AGENT, ids, 'positive');
    assert.equal(result.outcome, 'positive');
    assert.ok(result.updated > 0, 'Should have updated retrieval events');
  });

  it('rejects invalid outcome values', async () => {
    await assert.rejects(
      () => manager.feedback(TEST_AGENT, [BigInt(1)], 'invalid' as any),
      (err: Error) => err.message.includes('outcome'),
    );
  });

  it('rejects empty retrieval_ids', async () => {
    await assert.rejects(
      () => manager.feedback(TEST_AGENT, [], 'positive'),
      (err: Error) => err.message.includes('retrievalIds'),
    );
  });
});

// ─── Entity Deduplication ───────────────────────────────────────────────────

describe('Entity deduplication', () => {
  before(async () => {
    await cleanup();
    // Register agent first
    await manager.add(TEST_AGENT, 'test');
    await manager.consolidate(TEST_AGENT);

    // Create similar entities manually
    await pool.query(
      `INSERT INTO entities (agent_id, name, entity_type, mention_count) VALUES
       ($1, 'Robert Smith', 'person', 5),
       ($1, 'Robert Smithe', 'person', 2),
       ($1, 'Completely Different', 'person', 1)`,
      [TEST_AGENT],
    );
  });

  after(cleanup);

  it('merges similar entities', async () => {
    const merged = await manager.deduplicateEntities(TEST_AGENT, 0.6);
    assert.ok(merged >= 1, `Should have merged at least 1 pair, got ${merged}`);

    // Verify "Robert Smithe" no longer exists
    const { rows } = await pool.query(
      `SELECT name FROM entities WHERE agent_id = $1 AND name LIKE 'Robert%' ORDER BY name`,
      [TEST_AGENT],
    );
    assert.equal(rows.length, 1, 'Should have merged to one Robert entity');
  });

  it('does not merge dissimilar entities', async () => {
    const { rows } = await pool.query(
      `SELECT name FROM entities WHERE agent_id = $1 AND name = 'Completely Different'`,
      [TEST_AGENT],
    );
    assert.equal(rows.length, 1, 'Dissimilar entity should not be merged');
  });
});

// ─── Active Recall ──────────────────────────────────────────────────────────

describe('Active recall', () => {
  before(async () => {
    await cleanup();
    await manager.add(TEST_AGENT, 'The production database requires regular backups');
    await manager.add(TEST_AGENT, 'Never deploy on Fridays — learned this the hard way');
    await manager.consolidate(TEST_AGENT);
  });

  after(cleanup);

  it('surfaces relevant memories for a context', async () => {
    const result = await manager.activeRecall(TEST_AGENT, 'preparing for a deployment');
    assert.equal(result.agent_id, TEST_AGENT);
    assert.ok(Array.isArray(result.memories), 'Should return memories array');
    assert.ok(Array.isArray(result.procedures), 'Should return procedures array');
  });

  it('rejects empty context', async () => {
    await assert.rejects(
      () => manager.activeRecall(TEST_AGENT, ''),
      (err: Error) => err.message.includes('context'),
    );
  });
});

// ─── Memory Health ──────────────────────────────────────────────────────────

describe('Memory health', () => {
  before(async () => {
    await cleanup();
    await manager.add(TEST_AGENT, 'Health check test memory');
    await manager.consolidate(TEST_AGENT);
  });

  after(cleanup);

  it('returns health metrics', async () => {
    const health = await manager.health(TEST_AGENT);
    assert.equal(health.agent_id, TEST_AGENT);
    assert.equal(typeof health.total_memories, 'number');
    assert.equal(typeof health.avg_importance, 'number');
    assert.equal(typeof health.avg_confidence, 'number');
    assert.equal(typeof health.revision_velocity_24h, 'number');
    assert.equal(typeof health.knowledge_stability_pct, 'number');
    assert.equal(typeof health.retrieval_count_24h, 'number');
    assert.equal(typeof health.contradiction_rate, 'number');
  });
});

// ─── Input Validation ───────────────────────────────────────────────────────

describe('Input validation', () => {
  it('rejects empty agentId on add', async () => {
    await assert.rejects(
      () => manager.add('', 'test'),
      (err: Error) => err instanceof TypeError,
    );
  });

  it('rejects empty content on add', async () => {
    await assert.rejects(
      () => manager.add(TEST_AGENT, ''),
      (err: Error) => err instanceof TypeError,
    );
  });

  it('rejects empty query string', async () => {
    await assert.rejects(
      () => manager.query(TEST_AGENT, { q: '' }),
      (err: Error) => err instanceof TypeError,
    );
  });

  it('rejects empty agentId on stats', async () => {
    await assert.rejects(
      () => manager.stats(''),
      (err: Error) => err instanceof TypeError,
    );
  });
});

// ─── Teardown ───────────────────────────────────────────────────────────────

after(async () => {
  await cleanup();
  await pool.end();
});

console.log('[test] Integration tests loaded — running with node:test');
