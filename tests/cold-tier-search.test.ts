// MemForge — Cold Tier Search & Restore Tests (Sprint D, Phase 2, Issue #14)
//
// Run: node --import tsx/esm --test tests/cold-tier-search.test.ts
//
// WARNING: Requires DATABASE_URL pointing to a test database with schema applied.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { AuditChain } = await import('../src/audit.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');

// ─── Setup ───────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const AGENT = 'test-cold-search-agent';

const pool = new Pool({ connectionString: DATABASE_URL });
const auditChain = new AuditChain(pool);

const manager = new MemoryManager({
  databaseUrl: DATABASE_URL,
  autoRegisterAgents: true,
  embeddingProvider: new NoOpEmbeddingProvider(),
  llmProvider: null,
  sleepCycle: {
    tokenBudget: 100_000,
    evictionThreshold: 0.1,
    revisionThreshold: 0.4,
    includeReflection: false,
    weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
  },
  auditChain,
});

async function ensureAgent(): Promise<void> {
  await pool.query(
    `INSERT INTO agents (id, metadata) VALUES ($1, '{}') ON CONFLICT (id) DO NOTHING`,
    [AGENT],
  );
}

async function insertColdRow(opts: {
  content: string;
  namespace?: string;
  archivedAt?: Date;
  sourceTable?: 'hot_tier' | 'warm_tier';
}): Promise<bigint> {
  const ts = opts.archivedAt ?? new Date();
  const { rows } = await pool.query<{ id: bigint }>(
    `INSERT INTO cold_tier (agent_id, source_table, source_id, content, metadata, archived_at, original_created_at, namespace)
     VALUES ($1, $2, 1, $3, '{}', $4, $4, $5)
     RETURNING id`,
    [AGENT, opts.sourceTable ?? 'warm_tier', opts.content, ts, opts.namespace ?? 'default'],
  );
  return rows[0]!.id;
}

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM audit_chain WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM cold_tier WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [AGENT]);
}

// ─── Substring search ────────────────────────────────────────────────────────

describe('searchColdTier — substring match', () => {
  before(async () => {
    await cleanup();
    await ensureAgent();
    await insertColdRow({ content: 'The user prefers dark mode' });
    await insertColdRow({ content: 'Project deadline is Friday' });
    await insertColdRow({ content: 'API key rotation scheduled' });
  });

  after(cleanup);

  it('returns only the row whose content matches the q substring', async () => {
    const result = await manager.searchColdTier(AGENT, { q: 'dark mode' });

    assert.equal(result.total, 1);
    assert.equal(result.rows.length, 1);
    assert.ok(result.rows[0]!.content.includes('dark mode'));
  });
});

// ─── Namespace filter ────────────────────────────────────────────────────────

describe('searchColdTier — namespace filter', () => {
  before(async () => {
    await cleanup();
    await ensureAgent();
    await insertColdRow({ content: 'alpha memory 1', namespace: 'alpha' });
    await insertColdRow({ content: 'alpha memory 2', namespace: 'alpha' });
    await insertColdRow({ content: 'beta memory 1', namespace: 'beta' });
  });

  after(cleanup);

  it('returns only rows in the requested namespace', async () => {
    const result = await manager.searchColdTier(AGENT, { namespace: 'alpha' });

    assert.equal(result.total, 2);
    assert.equal(result.rows.length, 2);
    assert.ok(result.rows.every((r) => r.namespace === 'alpha'));
  });
});

// ─── Date range filter ───────────────────────────────────────────────────────

describe('searchColdTier — date range filter', () => {
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-06-01T00:00:00Z');
  const t2 = new Date('2024-12-01T00:00:00Z');

  before(async () => {
    await cleanup();
    await ensureAgent();
    await insertColdRow({ content: 'early row', archivedAt: t0 });
    await insertColdRow({ content: 'mid row', archivedAt: t1 });
    await insertColdRow({ content: 'late row', archivedAt: t2 });
  });

  after(cleanup);

  it('returns only rows within the from/to range', async () => {
    const from = new Date('2024-03-01T00:00:00Z');
    const to = new Date('2024-09-01T00:00:00Z');

    const result = await manager.searchColdTier(AGENT, { from, to });

    assert.equal(result.total, 1);
    assert.equal(result.rows.length, 1);
    assert.ok(result.rows[0]!.content.includes('mid row'));
  });
});

// ─── Pagination ──────────────────────────────────────────────────────────────

describe('searchColdTier — pagination via limit/offset', () => {
  before(async () => {
    await cleanup();
    await ensureAgent();
    // Insert 10 rows with deterministic ordering via archived_at
    for (let i = 0; i < 10; i++) {
      const ts = new Date(Date.now() - i * 60_000);
      await insertColdRow({ content: `row ${i}`, archivedAt: ts });
    }
  });

  after(cleanup);

  it('returns the correct slice for limit=3, offset=3', async () => {
    const full = await manager.searchColdTier(AGENT, { limit: 10 });
    const page = await manager.searchColdTier(AGENT, { limit: 3, offset: 3 });

    assert.equal(full.total, 10);
    assert.equal(page.rows.length, 3);
    assert.equal(page.total, 10);

    // Slice from the full result to verify correct rows returned
    const expectedIds = full.rows.slice(3, 6).map((r) => r.id);
    const actualIds = page.rows.map((r) => r.id);
    assert.deepEqual(actualIds, expectedIds);
  });
});

// ─── Restore round-trip ──────────────────────────────────────────────────────

describe('restoreColdTier — round-trip', () => {
  let coldId: bigint;

  before(async () => {
    await cleanup();
    await ensureAgent();
    coldId = await insertColdRow({ content: 'Restored memory content', namespace: 'alpha' });
  });

  after(cleanup);

  it('creates a warm_tier row with correct content and audit metadata; cold row survives', async () => {
    const result = await manager.restoreColdTier(AGENT, coldId);

    // Warm row exists with matching content
    const { rows: warmRows } = await pool.query<{ content: string; namespace: string; metadata: Record<string, unknown> }>(
      `SELECT content, namespace, metadata FROM warm_tier WHERE id = $1 AND agent_id = $2`,
      [result.warm_tier_id, AGENT],
    );

    assert.equal(warmRows.length, 1);
    assert.equal(warmRows[0]!.content, 'Restored memory content');
    assert.equal(warmRows[0]!.namespace, 'alpha');
    assert.equal(String((warmRows[0]!.metadata as Record<string, unknown>)['_restored_from_cold_id']), String(coldId));

    // Cold row still present — non-destructive
    const { rows: coldRows } = await pool.query<{ id: bigint }>(
      `SELECT id FROM cold_tier WHERE id = $1 AND agent_id = $2`,
      [coldId, AGENT],
    );
    assert.equal(coldRows.length, 1);
  });
});

// ─── Restore 404 ────────────────────────────────────────────────────────────

describe('restoreColdTier — not found', () => {
  before(async () => {
    await cleanup();
    await ensureAgent();
  });

  after(cleanup);

  it('throws NOT_FOUND error for a non-existent cold_id', async () => {
    const nonExistentId = BigInt(9_999_999_999);

    await assert.rejects(
      () => manager.restoreColdTier(AGENT, nonExistentId),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, 'NOT_FOUND');
        return true;
      },
    );
  });
});
