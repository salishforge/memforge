// MemForge — Streaming Consolidation Tests
//
// Verifies the cursor-based streaming consolidate() implementation:
// multi-batch processing, idempotent resume after partial failure, small
// inputs, and advisory-lock serialization of concurrent calls.
//
// Requires: DATABASE_URL pointing to a test database with schema applied.
//
// Run: node --import tsx/esm --test tests/streaming-consolidation.test.ts

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');

// ─── Setup ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const AGENT_STREAMING = 'test-streaming-consolidation';
const AGENT_RESUME    = 'test-streaming-resume';
const AGENT_SMALL     = 'test-streaming-small';
const AGENT_LOCK      = 'test-streaming-lock';

const ALL_AGENTS = [AGENT_STREAMING, AGENT_RESUME, AGENT_SMALL, AGENT_LOCK];

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

/** Insert N hot-tier rows for an agent directly (bypasses add() dedup logic). */
async function insertHotRows(agentId: string, count: number): Promise<void> {
  // Register agent first
  await pool.query(
    `INSERT INTO agents (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [agentId],
  );
  // Use a word-list rotation so adjacent rows share minimal vocabulary.
  // This ensures the Jaccard overlap heuristic doesn't skip LLM calls in tests
  // that exercise summarize mode.
  const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
    'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa'];
  for (let i = 0; i < count; i++) {
    const w1 = WORDS[i % WORDS.length]!;
    const w2 = WORDS[(i + 5) % WORDS.length]!;
    const w3 = WORDS[(i + 11) % WORDS.length]!;
    await pool.query(
      `INSERT INTO hot_tier (agent_id, content, metadata, content_hash)
       VALUES ($1, $2, '{}', $3)`,
      [agentId, `Row ${i + 1} topic: ${w1} ${w2} ${w3} unique-token-${i}`, `hash-${agentId}-${i}`],
    );
  }
}

function makeManager(opts: {
  innerBatchSize: number;
  llmProvider?: InstanceType<typeof MockLLMProvider> | null;
}): InstanceType<typeof MemoryManager> {
  return new MemoryManager({
    databaseUrl: DATABASE_URL!,
    consolidationBatchSize: 500,
    consolidationInnerBatchSize: opts.innerBatchSize,
    consolidationThreshold: 1,
    autoRegisterAgents: false,
    consolidationMode: 'concat',
    temporalDecayRate: 0,
    embeddingProvider: new NoOpEmbeddingProvider(),
    llmProvider: opts.llmProvider ?? null,
    sleepCycle: {
      tokenBudget: 100_000,
      evictionThreshold: 0.1,
      revisionThreshold: 0.4,
      includeReflection: false,
      weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
    },
  });
}

// ─── Multi-batch happy path ──────────────────────────────────────────────────

describe('Streaming consolidation: multi-batch happy path', () => {
  before(async () => {
    await cleanupAgent(AGENT_STREAMING);
    await insertHotRows(AGENT_STREAMING, 150);
  });
  after(() => cleanupAgent(AGENT_STREAMING));

  it('processes 150 rows in 3 batches of 50 and empties hot_tier', async () => {
    const manager = makeManager({ innerBatchSize: 50 });

    const result = await manager.consolidate(AGENT_STREAMING);

    assert.equal(result.hot_rows_processed, 150);
    assert.equal(result.batchesProcessed, 3);
    assert.equal(result.status, 'complete');

    const { rows: hotRows } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM hot_tier WHERE agent_id = $1`,
      [AGENT_STREAMING],
    );
    assert.equal(parseInt(hotRows[0]!.count, 10), 0, 'hot_tier should be empty after consolidation');

    const { rows: warmRows } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM warm_tier WHERE agent_id = $1`,
      [AGENT_STREAMING],
    );
    assert.equal(parseInt(warmRows[0]!.count, 10), 3, '3 warm rows — one per inner batch');
  });
});

// ─── Idempotent resume after partial run ─────────────────────────────────────
//
// Verifies the idempotent re-run property: calling consolidate() twice when
// the first call only processes part of the available rows (via outer cap)
// leaves the remainder available for the second call without any duplication.
// This is the same invariant that holds after a partial failure — rows not
// deleted from hot_tier are always eligible for the next run.

describe('Streaming consolidation: idempotent resume', () => {
  before(async () => {
    await cleanupAgent(AGENT_RESUME);
    await insertHotRows(AGENT_RESUME, 100);
  });
  after(() => cleanupAgent(AGENT_RESUME));

  it('two sequential calls with outer cap=50 process all 100 rows without duplication', async () => {
    // Cap the outer batch to 50 so the first call leaves 50 rows in hot_tier.
    // The second call then picks up exactly the remaining 50.
    const manager = new MemoryManager({
      databaseUrl: DATABASE_URL!,
      consolidationBatchSize: 50,   // outer cap — first call sees at most 50
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

    const r1 = await manager.consolidate(AGENT_RESUME);
    assert.equal(r1.hot_rows_processed, 50, 'first call processes up to the outer cap');
    assert.equal(r1.batchesProcessed, 1);
    assert.equal(r1.status, 'complete');

    const { rows: hotMid } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM hot_tier WHERE agent_id = $1`,
      [AGENT_RESUME],
    );
    assert.equal(parseInt(hotMid[0]!.count, 10), 50, '50 rows remain after first call');

    const r2 = await manager.consolidate(AGENT_RESUME);
    assert.equal(r2.hot_rows_processed, 50, 'second call processes the remaining 50');
    assert.equal(r2.batchesProcessed, 1);
    assert.equal(r2.status, 'complete');

    const { rows: hotFinal } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM hot_tier WHERE agent_id = $1`,
      [AGENT_RESUME],
    );
    assert.equal(parseInt(hotFinal[0]!.count, 10), 0, 'hot_tier is empty after both calls');

    const { rows: warmFinal } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM warm_tier WHERE agent_id = $1`,
      [AGENT_RESUME],
    );
    assert.equal(parseInt(warmFinal[0]!.count, 10), 2, '2 warm rows — one per call, no duplicates');
  });
});

// ─── Small input — fewer rows than inner batch size ──────────────────────────

describe('Streaming consolidation: small input', () => {
  before(async () => {
    await cleanupAgent(AGENT_SMALL);
    await insertHotRows(AGENT_SMALL, 10);
  });
  after(() => cleanupAgent(AGENT_SMALL));

  it('consolidates 10 rows in 1 batch when inner batch size is 50', async () => {
    const manager = makeManager({ innerBatchSize: 50 });

    const result = await manager.consolidate(AGENT_SMALL);

    assert.equal(result.hot_rows_processed, 10);
    assert.equal(result.batchesProcessed, 1);
    assert.equal(result.warm_rows_created, 1);
    assert.equal(result.status, 'complete');

    const { rows: hotRows } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM hot_tier WHERE agent_id = $1`,
      [AGENT_SMALL],
    );
    assert.equal(parseInt(hotRows[0]!.count, 10), 0);
  });
});

// ─── Concurrent calls are serialized by advisory lock ───────────────────────

describe('Streaming consolidation: concurrent calls are serialized', () => {
  before(async () => {
    await cleanupAgent(AGENT_LOCK);
    // 40 rows total so two concurrent calls of batch size 20 would race if unlocked
    await insertHotRows(AGENT_LOCK, 40);
  });
  after(() => cleanupAgent(AGENT_LOCK));

  it('two concurrent consolidate() calls for the same agent do not produce duplicate warm rows', async () => {
    const m1 = makeManager({ innerBatchSize: 20 });
    const m2 = makeManager({ innerBatchSize: 20 });

    // Run both concurrently. One will block on the advisory lock while the other
    // processes all 40 rows. The second will find 0 rows and return immediately.
    const [r1, r2] = await Promise.all([
      m1.consolidate(AGENT_LOCK),
      m2.consolidate(AGENT_LOCK),
    ]);

    const totalProcessed = r1.hot_rows_processed + r2.hot_rows_processed;
    assert.equal(totalProcessed, 40, 'combined, both calls must process exactly 40 rows (no double-processing)');

    const { rows: hotRows } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM hot_tier WHERE agent_id = $1`,
      [AGENT_LOCK],
    );
    assert.equal(parseInt(hotRows[0]!.count, 10), 0, 'hot_tier must be empty — no rows skipped or double-deleted');

    const { rows: warmRows } = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM warm_tier WHERE agent_id = $1`,
      [AGENT_LOCK],
    );
    // With advisory serialization: the first caller processes all 40 rows (2 batches),
    // the second finds 0 and creates 0 warm rows. Total = 2.
    assert.ok(warmRows[0] && parseInt(warmRows[0].count, 10) >= 1, 'at least one warm row must be created');
    assert.ok(warmRows[0] && parseInt(warmRows[0].count, 10) <= 2, 'at most 2 warm rows (2 batches of 20)');
  });
});
