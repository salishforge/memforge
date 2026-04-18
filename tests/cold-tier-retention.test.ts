// MemForge — Cold Tier Retention Tests
//
// Tests the pruneColdTier() method. All tests insert rows with explicit timestamps
// so behaviour is deterministic (no sleeping, no time travel in Postgres).
//
// Run: node --import tsx/esm --test tests/cold-tier-retention.test.ts
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

const AGENT_A = 'test-cold-retention-agent-a';
const AGENT_B = 'test-cold-retention-agent-b';

const pool = new Pool({ connectionString: DATABASE_URL });
const auditChain = new AuditChain(pool);

async function ensureAgent(agentId: string): Promise<void> {
  await pool.query(
    `INSERT INTO agents (id, metadata) VALUES ($1, '{}')
     ON CONFLICT (id) DO NOTHING`,
    [agentId],
  );
}

async function insertColdRow(agentId: string, archivedAt: Date): Promise<bigint> {
  const { rows } = await pool.query<{ id: bigint }>(
    `INSERT INTO cold_tier (agent_id, source_table, source_id, content, metadata, archived_at, original_created_at)
     VALUES ($1, 'warm_tier', 1, 'test content', '{}', $2, $2)
     RETURNING id`,
    [agentId, archivedAt],
  );
  return rows[0]!.id;
}

async function coldCount(agentId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM cold_tier WHERE agent_id = $1`,
    [agentId],
  );
  return parseInt(rows[0]!.count, 10);
}

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM audit_chain WHERE agent_id IN ($1, $2)`, [AGENT_A, AGENT_B]);
  await pool.query(`DELETE FROM cold_tier WHERE agent_id IN ($1, $2)`, [AGENT_A, AGENT_B]);
  await pool.query(`DELETE FROM agents WHERE id IN ($1, $2)`, [AGENT_A, AGENT_B]);
}

// ─── Retention disabled (default) ────────────────────────────────────────────

describe('pruneColdTier — retention disabled', () => {
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
      // coldRetentionDays intentionally absent — default is disabled
    },
    auditChain,
  });

  before(async () => {
    await cleanup();
    await ensureAgent(AGENT_A);
    // Insert a row archived 100 days ago — far past any plausible retention threshold
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    await insertColdRow(AGENT_A, old);
  });

  after(cleanup);

  it('returns 0 pruned without issuing any delete', async () => {
    const result = await manager.pruneColdTier(AGENT_A);

    assert.equal(result.pruned, 0);
    assert.equal(await coldCount(AGENT_A), 1, 'Row must still exist when retention is disabled');
  });
});

// ─── Retention enabled — only deletes expired rows ───────────────────────────

describe('pruneColdTier — retention enabled, 30-day window', () => {
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
      coldRetentionDays: 30,
    },
    auditChain,
  });

  before(async () => {
    await cleanup();
    await ensureAgent(AGENT_A);
  });

  after(cleanup);

  it('deletes rows older than 30 days and keeps recent rows', async () => {
    // Row archived 60 days ago — eligible for deletion
    const expired = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await insertColdRow(AGENT_A, expired);

    // Row archived 10 days ago — within retention window, must survive
    const fresh = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await insertColdRow(AGENT_A, fresh);

    assert.equal(await coldCount(AGENT_A), 2);

    const result = await manager.pruneColdTier(AGENT_A);

    assert.equal(result.pruned, 1, 'Only the expired row should be pruned');
    assert.equal(await coldCount(AGENT_A), 1, 'Fresh row must remain');
  });
});

// ─── Scoped to agent — other agents are unaffected ───────────────────────────

describe('pruneColdTier — agent scoping', () => {
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
      coldRetentionDays: 30,
    },
    auditChain,
  });

  before(async () => {
    await cleanup();
    await ensureAgent(AGENT_A);
    await ensureAgent(AGENT_B);
    // Both agents have an expired row archived 60 days ago
    const expired = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await insertColdRow(AGENT_A, expired);
    await insertColdRow(AGENT_B, expired);
  });

  after(cleanup);

  it('pruning agent-a does not touch agent-b rows', async () => {
    const result = await manager.pruneColdTier(AGENT_A);

    assert.equal(result.pruned, 1);
    assert.equal(await coldCount(AGENT_A), 0, 'Agent A row should be gone');
    assert.equal(await coldCount(AGENT_B), 1, 'Agent B row must be untouched');
  });
});

// ─── Audit trail — audit_chain entries survive the prune ────────────────────

describe('pruneColdTier — audit trail preserved', () => {
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
      coldRetentionDays: 30,
    },
    auditChain,
  });

  before(async () => {
    await cleanup();
    await ensureAgent(AGENT_A);
  });

  after(cleanup);

  it('audit_chain records are queryable after cold_tier rows are pruned', async () => {
    const expired = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await insertColdRow(AGENT_A, expired);

    const result = await manager.pruneColdTier(AGENT_A);
    assert.equal(result.pruned, 1);

    // The audit summary entry uses target_id=0 (recordBatch sentinel)
    // and target_table='cold_tier'. Wait briefly for the fire-and-forget audit write.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_chain
       WHERE agent_id = $1 AND target_table = 'cold_tier' AND operation = 'delete'`,
      [AGENT_A],
    );
    assert.ok(parseInt(rows[0]!.count, 10) >= 1, 'Audit entry for the prune must exist');
  });
});
