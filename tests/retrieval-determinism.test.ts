// MemForge — retrieval determinism tests
//
// Ranking functions tie constantly: measured on a real corpus, 20 retrieved
// rows shared only 6 distinct ts_rank_cd values. With `ORDER BY rank DESC`
// and no second key, Postgres is free to return tied rows in any order, so
// the same query against unchanged data returned different results run to
// run — observed as a 2.4pp swing in benchmark Recall@3 with nothing changed.
//
// That is a correctness problem before it is a measurement problem: callers
// paging or caching results, and anyone trying to tell an improvement from
// noise, both need a total order.
//
// Run: node --import tsx/esm --test tests/retrieval-determinism.test.ts
// Requires: DATABASE_URL

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const TEST_AGENT = 'test-agent-retrieval-determinism';
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
    evictionThreshold: 0.05,
    revisionThreshold: 0.4,
    includeReflection: false,
    weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
  },
});

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM knowledge_gaps WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

describe('retrieval ordering is deterministic under rank ties', () => {
  before(async () => {
    await cleanup();
    await pool.query(`INSERT INTO agents (id) VALUES ($1) ON CONFLICT DO NOTHING`, [TEST_AGENT]);

    // Rows must tie on rank while differing in their opening text: query()
    // collapses results sharing their first 100 characters ("prevents similar
    // memories filling all top-k slots"), so wholly identical rows would be
    // deduplicated to one and never exercise the ordering path.
    //
    // ts_rank_cd uses no length normalisation by default, so a distinct
    // leading marker that the query does not match leaves rank untouched —
    // verified: 6 such rows produce exactly 1 distinct rank.
    for (let i = 0; i < 12; i++) {
      await pool.query(
        `INSERT INTO warm_tier (agent_id, content, content_hash, importance)
         VALUES ($1, $2, $3, 0.5)`,
        [
          TEST_AGENT,
          `marker${i} distinct opening words here to defeat the dedup prefix check, followed by quarterly planning probe`,
          `det-${i}`,
        ],
      );
    }
  });
  after(async () => {
    await cleanup();
    await pool.end();
    await closePool();
  });

  it('returns the same ids in the same order across repeated identical queries', async () => {
    const runs: string[][] = [];
    for (let i = 0; i < 5; i++) {
      const results = await manager.query(TEST_AGENT, { q: 'quarterly planning probe', limit: 10 });
      runs.push(results.map((r) => String(r.id)));
    }

    assert.equal(runs[0]!.length, 10, 'fixture must produce a full page of rank-tied rows');
    for (let i = 1; i < runs.length; i++) {
      assert.deepEqual(runs[i], runs[0], `run ${i + 1} returned a different order than run 1`);
    }
  });

  it('orders tied rows newest-first', async () => {
    // The documented tie semantic: when relevance cannot separate two
    // memories, prefer the more recent. Pinned so a future ORDER BY edit
    // cannot silently invert it.
    const results = await manager.query(TEST_AGENT, { q: 'quarterly planning probe', limit: 10 });
    const ids = results.map((r) => BigInt(r.id));

    const descending = [...ids].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
    assert.deepEqual(ids, descending, 'tied rows must come back in descending id order');
  });

  it('keeps paging stable — a second page does not repeat the first', async () => {
    // Without a total order, LIMIT/paging over tied rows can return the same
    // row on consecutive pages and drop others entirely.
    const page = await manager.query(TEST_AGENT, { q: 'quarterly planning probe', limit: 5 });
    const wider = await manager.query(TEST_AGENT, { q: 'quarterly planning probe', limit: 10 });

    assert.deepEqual(
      wider.slice(0, 5).map((r) => String(r.id)),
      page.map((r) => String(r.id)),
      'the first 5 of a 10-row query must equal the 5-row query',
    );
  });
});
