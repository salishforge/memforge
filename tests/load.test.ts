// MemForge — Load and Performance Tests
//
// Structured benchmarks for detecting performance regressions.
// Not included in standard CI — run separately with: npm run test:load
//
// Requires: DATABASE_URL pointing to a test database with schema applied.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { performance } from 'node:perf_hooks';

const { MemoryManager } = await import('../src/memory-manager.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');

// ─── Setup ──────────────────────────────────────────────────────────────────

const TEST_AGENT = 'test-agent-load';
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
  await pool.query(`DELETE FROM audit_chain WHERE agent_id = $1`, [TEST_AGENT]);
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

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

// ─��─ Write Throughput ───────────────────────────────────────────────────────

describe('Write throughput', () => {
  before(cleanup);
  after(cleanup);

  it('adds 500 memories sequentially under 10s', async () => {
    const start = performance.now();

    for (let i = 0; i < 500; i++) {
      await manager.add(TEST_AGENT, `Load test memory ${i}: observation about system behavior and performance characteristics`);
    }

    const elapsed = performance.now() - start;
    const rate = 500 / (elapsed / 1000);
    console.log(`  Write: 500 adds in ${elapsed.toFixed(0)}ms (${rate.toFixed(1)} ops/sec)`);

    assert.ok(elapsed < 10_000, `Write took ${elapsed.toFixed(0)}ms — expected under 10s`);
  });
});

// ─── Consolidation Throughput ���──────────────────────────────────────────────

describe('Consolidation throughput', () => {
  before(async () => {
    await cleanup();
    // Seed hot tier
    for (let i = 0; i < 500; i++) {
      await manager.add(TEST_AGENT, `Consolidation test memory ${i}: detailed event data about interactions`);
    }
  });
  after(cleanup);

  it('consolidates 500 hot rows (concat mode) under 5s', async () => {
    const start = performance.now();
    const result = await manager.consolidate(TEST_AGENT, 'concat');
    const elapsed = performance.now() - start;

    console.log(`  Consolidation: ${result.warm_rows_created} warm rows from 500 hot rows in ${elapsed.toFixed(0)}ms`);
    assert.ok(elapsed < 5_000, `Consolidation took ${elapsed.toFixed(0)}ms — expected under 5s`);
    assert.ok(result.warm_rows_created > 0, 'warm rows created');
  });
});

// ─── Query Latency ──────────────────────────────────────────────────────────

describe('Query latency at scale', () => {
  before(async () => {
    await cleanup();
    // Seed warm tier by adding and consolidating in batches
    for (let batch = 0; batch < 5; batch++) {
      for (let i = 0; i < 100; i++) {
        await manager.add(TEST_AGENT, `Batch ${batch} event ${i}: ${randomTopic()} with details about ${randomTopic()}`);
      }
      await manager.consolidate(TEST_AGENT, 'concat');
    }
  });
  after(cleanup);

  it('keyword queries complete under 100ms p95', async () => {
    const latencies: number[] = [];
    const queries = ['deployment', 'database', 'performance', 'security', 'testing'];

    for (let round = 0; round < 10; round++) {
      for (const q of queries) {
        const start = performance.now();
        await manager.query(TEST_AGENT, { q, mode: 'keyword', limit: 10 });
        latencies.push(performance.now() - start);
      }
    }

    latencies.sort((a, b) => a - b);
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    console.log(`  Query latency (keyword, 50 queries): p50=${p50.toFixed(1)}ms, p95=${p95.toFixed(1)}ms`);

    assert.ok(p95 < 100, `p95 latency ${p95.toFixed(1)}ms — expected under 100ms`);
  });
});

// ─── Concurrent Queries ─────────────────────────────────────────────────────

describe('Concurrent queries', () => {
  before(async () => {
    await cleanup();
    for (let i = 0; i < 50; i++) {
      await manager.add(TEST_AGENT, `Concurrent test memory ${i}: data about ${randomTopic()}`);
    }
    await manager.consolidate(TEST_AGENT, 'concat');
  });
  after(cleanup);

  it('handles 20 concurrent queries without errors', async () => {
    const start = performance.now();

    const queries = Array.from({ length: 20 }, (_, i) =>
      manager.query(TEST_AGENT, { q: randomTopic(), mode: 'keyword', limit: 5 }),
    );

    const results = await Promise.all(queries);
    const elapsed = performance.now() - start;

    console.log(`  Concurrent: 20 queries in ${elapsed.toFixed(0)}ms`);
    assert.equal(results.length, 20, 'all queries returned');
    assert.ok(elapsed < 5_000, `Concurrent queries took ${elapsed.toFixed(0)}ms — expected under 5s`);
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const TOPICS = [
  'deployment pipeline', 'database migration', 'API performance',
  'security audit', 'test coverage', 'Redis caching',
  'user authentication', 'error handling', 'memory management',
  'knowledge graph', 'sleep cycle', 'entity extraction',
];

function randomTopic(): string {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)] ?? 'general';
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

after(async () => {
  await pool.end();
  await closePool();
});
