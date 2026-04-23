// MemForge — Phase 5.9 Embedding Migration Tests
//
// Validates the incremental embedding migration phase of the sleep cycle:
//   - legacy rows (embedding_model = NULL) are backfilled with the current model tag
//   - rows with a stale embedding_model are re-embedded and retagged
//   - the phase stops at EMBEDDING_MIGRATION_BATCH and reports a backlog
//   - dimension mismatches are refused (safety guard)
//
// Run: node --import tsx/esm --test tests/embedding-migration.test.ts
// Requires DATABASE_URL.

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { SleepCycleEngine } = await import('../src/sleep-cycle.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const TEST_AGENT = 'test-agent-embedding-migration';
const pool = new Pool({ connectionString: DATABASE_URL });

// Deterministic stub provider: same content always yields the same vector,
// and the model tag is configurable so we can simulate a provider swap.
class StubEmbeddingProvider {
  readonly dimensions: number;
  modelId: string;

  constructor(modelId: string, dimensions = 384) {
    this.modelId = modelId;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    // Stable hash → a full vector of the same float, differentiated by content.
    const sum = Array.from(text).reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const v = ((sum % 1000) / 1000) || 0.001;
    return Array(this.dimensions).fill(v);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM drift_signals WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

async function seedWarmRow(
  content: string,
  modelId: string | null,
  dims = 384,
): Promise<bigint> {
  const vec = Array(dims).fill(0.5);
  const { rows } = await pool.query<{ id: bigint }>(
    `INSERT INTO warm_tier (agent_id, content, embedding, embedding_model, time_start, time_end)
     VALUES ($1, $2, $3::halfvec, $4, now(), now())
     RETURNING id`,
    [TEST_AGENT, content, `[${vec.join(',')}]`, modelId],
  );
  return rows[0]!.id;
}

async function getModelTag(id: bigint): Promise<string | null> {
  const { rows } = await pool.query<{ embedding_model: string | null }>(
    `SELECT embedding_model FROM warm_tier WHERE id = $1`,
    [id],
  );
  return rows[0]?.embedding_model ?? null;
}

describe('Phase 5.9 embedding migration', () => {
  beforeEach(async () => {
    await cleanup();
    await pool.query(
      `INSERT INTO agents (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [TEST_AGENT],
    );
  });

  it('backfills NULL embedding_model under the current provider tag', async () => {
    const id = await seedWarmRow('hello world', null);

    const engine = new SleepCycleEngine(
      pool,
      { chat: async () => '', summarize: async () => '' } as never,
      new StubEmbeddingProvider('openai/text-embedding-3-small'),
    );

    const result = await engine.run(TEST_AGENT);
    assert.equal(result.embeddings_migrated, 1, 'expected 1 migrated row');
    assert.equal(await getModelTag(id), 'openai/text-embedding-3-small');
  });

  it('re-embeds rows whose model tag is stale', async () => {
    const stale = await seedWarmRow('content A', 'openai/old-model');
    const stale2 = await seedWarmRow('content B', 'openai/old-model');

    const engine = new SleepCycleEngine(
      pool,
      { chat: async () => '', summarize: async () => '' } as never,
      new StubEmbeddingProvider('openai/new-model'),
    );

    const result = await engine.run(TEST_AGENT);
    assert.equal(result.embeddings_migrated, 2);
    assert.equal(await getModelTag(stale), 'openai/new-model');
    assert.equal(await getModelTag(stale2), 'openai/new-model');
  });

  it('respects EMBEDDING_MIGRATION_BATCH and reports backlog', async () => {
    for (let i = 0; i < 5; i++) {
      await seedWarmRow(`row ${i}`, 'stale/v1');
    }

    process.env['EMBEDDING_MIGRATION_BATCH'] = '2';
    try {
      const engine = new SleepCycleEngine(
        pool,
        { chat: async () => '', summarize: async () => '' } as never,
        new StubEmbeddingProvider('current/v2'),
      );

      const result = await engine.run(TEST_AGENT);
      assert.equal(result.embeddings_migrated, 2);
      assert.equal(result.embeddings_migration_backlog, 3);
    } finally {
      delete process.env['EMBEDDING_MIGRATION_BATCH'];
    }
  });

  it('skips migration entirely when dimensions differ from stored vectors', async () => {
    const id = await seedWarmRow('existing row', 'stale/v1', 384);

    const engine = new SleepCycleEngine(
      pool,
      { chat: async () => '', summarize: async () => '' } as never,
      new StubEmbeddingProvider('new/dims-changed', 768),
    );

    const result = await engine.run(TEST_AGENT);
    assert.equal(result.embeddings_migrated ?? 0, 0, 'must not migrate on dim mismatch');
    assert.equal(await getModelTag(id), 'stale/v1', 'row must remain untouched');
  });

  it('no-ops when the provider is NoOp (embeddings disabled)', async () => {
    await seedWarmRow('irrelevant', null);

    const engine = new SleepCycleEngine(
      pool,
      { chat: async () => '', summarize: async () => '' } as never,
      new NoOpEmbeddingProvider(),
    );

    const result = await engine.run(TEST_AGENT);
    assert.equal(result.embeddings_migrated ?? 0, 0);
  });
});

after(async () => {
  await cleanup();
  await pool.end();
  await closePool();
});
