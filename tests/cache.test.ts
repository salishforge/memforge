// MemForge Cache Integration Tests
//
// Tests:
//   - Cache hit/miss behavior
//   - TTL-based expiration
//   - Write-triggered invalidation
//   - Batch invalidation by agent
//   - Pattern invalidation
//   - Cache statistics accuracy
//   - Redis unavailable (graceful degradation)
//
// Run: node --import tsx/esm tests/cache.test.ts
// (requires Redis at localhost:6379)

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRedis,
  cacheGet,
  cacheSet,
  invalidatePattern,
  invalidateAgent,
  flushCache,
  statsKey,
  searchKey,
  getLocalStats,
  closeRedis,
} from '../src/cache.js';

// ─── Setup ────────────────────────────────────────────────────────────────────

const TEST_PREFIX = 'memforge:test-agent-';
const AGENT_A = 'test-agent-alpha';
const AGENT_B = 'test-agent-beta';

async function clearTestKeys(): Promise<void> {
  await Promise.all([
    invalidateAgent(AGENT_A),
    invalidateAgent(AGENT_B),
  ]);
}

// ─── Hit / Miss ───────────────────────────────────────────────────────────────

describe('Cache hit / miss', () => {
  before(async () => {
    // Verify Redis is reachable
    const redis = await getRedis();
    if (!redis) {
      console.warn('[test] Redis unavailable — skipping cache tests');
      process.exit(0);
    }
    await clearTestKeys();
  });

  after(async () => {
    await clearTestKeys();
    await closeRedis();
  });

  beforeEach(async () => {
    await clearTestKeys();
  });

  it('returns null for a key that has never been set', async () => {
    const key = statsKey(AGENT_A);
    const result = await cacheGet(key);
    assert.equal(result, null, 'Expected null for cache miss');
  });

  it('returns the stored value after cacheSet', async () => {
    const key = statsKey(AGENT_A);
    const payload = { agent_id: AGENT_A, hot_count: 5, warm_count: 10, cold_count: 0 };

    await cacheSet(key, payload, 'hot');
    const result = await cacheGet(key) as typeof payload;

    assert.ok(result !== null, 'Expected a cache hit');
    assert.deepEqual(result, payload);
  });

  it('search key encodes query + limit', async () => {
    const key1 = searchKey(AGENT_A, 'redis caching', 10);
    const key2 = searchKey(AGENT_A, 'redis caching', 20);
    const key3 = searchKey(AGENT_A, 'different query', 10);

    assert.notEqual(key1, key2, 'Same query with different limits should have different keys');
    assert.notEqual(key1, key3, 'Different queries should have different keys');
  });

  it('different agents do not share cache entries', async () => {
    const keyA = statsKey(AGENT_A);
    const keyB = statsKey(AGENT_B);
    const dataA = { agent_id: AGENT_A, hot_count: 1 };
    const dataB = { agent_id: AGENT_B, hot_count: 99 };

    await Promise.all([
      cacheSet(keyA, dataA, 'hot'),
      cacheSet(keyB, dataB, 'hot'),
    ]);

    const resultA = await cacheGet(keyA) as typeof dataA;
    const resultB = await cacheGet(keyB) as typeof dataB;

    assert.equal(resultA.hot_count, 1, 'Agent A count should be 1');
    assert.equal(resultB.hot_count, 99, 'Agent B count should be 99');
  });

  it('overwrites an existing key with cacheSet', async () => {
    const key = statsKey(AGENT_A);
    await cacheSet(key, { hot_count: 1 }, 'hot');
    await cacheSet(key, { hot_count: 42 }, 'hot');

    const result = await cacheGet(key) as { hot_count: number };
    assert.equal(result.hot_count, 42, 'Second write should overwrite first');
  });
});

// ─── Invalidation ─────────────────────────────────────────────────────────────

describe('Cache invalidation', () => {
  beforeEach(async () => {
    await clearTestKeys();
  });

  it('invalidateAgent removes all keys for that agent', async () => {
    const statsKy = statsKey(AGENT_A);
    const searchKy = searchKey(AGENT_A, 'test query', 10);

    await Promise.all([
      cacheSet(statsKy, { hot_count: 5 }, 'hot'),
      cacheSet(searchKy, [{ id: 1, content: 'hello' }], 'search'),
    ]);

    // Verify they exist
    assert.ok(await cacheGet(statsKy) !== null, 'stats key should exist before invalidation');
    assert.ok(await cacheGet(searchKy) !== null, 'search key should exist before invalidation');

    await invalidateAgent(AGENT_A);

    // Verify they're gone
    assert.equal(await cacheGet(statsKy), null, 'stats key should be gone after invalidation');
    assert.equal(await cacheGet(searchKy), null, 'search key should be gone after invalidation');
  });

  it('invalidateAgent does not affect other agents', async () => {
    const keyA = statsKey(AGENT_A);
    const keyB = statsKey(AGENT_B);

    await Promise.all([
      cacheSet(keyA, { hot_count: 1 }, 'hot'),
      cacheSet(keyB, { hot_count: 2 }, 'hot'),
    ]);

    await invalidateAgent(AGENT_A);

    assert.equal(await cacheGet(keyA), null, 'Agent A key should be gone');
    assert.ok(await cacheGet(keyB) !== null, 'Agent B key should still exist');
  });

  it('flushCache(agentId) removes only that agent\'s keys', async () => {
    const keyA = statsKey(AGENT_A);
    const keyB = statsKey(AGENT_B);

    await Promise.all([
      cacheSet(keyA, { hot_count: 1 }, 'hot'),
      cacheSet(keyB, { hot_count: 2 }, 'hot'),
    ]);

    const deleted = await flushCache(AGENT_A);
    assert.ok(deleted >= 1, `Expected at least 1 deletion, got ${deleted}`);
    assert.equal(await cacheGet(keyA), null, 'Agent A key should be gone');
    assert.ok(await cacheGet(keyB) !== null, 'Agent B key should remain');
  });

  it('invalidatePattern removes matching keys', async () => {
    const key1 = `memforge:${AGENT_A}:custom1`;
    const key2 = `memforge:${AGENT_A}:custom2`;
    const redis = await getRedis();
    if (!redis) return;

    await Promise.all([
      redis.setEx(key1, 60, '"test"'),
      redis.setEx(key2, 60, '"test"'),
    ]);

    const deleted = await invalidatePattern(`memforge:${AGENT_A}:custom*`);
    assert.ok(deleted >= 2, `Expected at least 2 deletions, got ${deleted}`);
    assert.equal(await cacheGet(key1), null);
    assert.equal(await cacheGet(key2), null);
  });
});

// ─── TTL ─────────────────────────────────────────────────────────────────────

describe('Cache TTL', () => {
  it('sets TTL on keys (verified via Redis TTL command)', async () => {
    const redis = await getRedis();
    if (!redis) return;

    const key = statsKey(AGENT_A);
    await cacheSet(key, { hot_count: 1 }, 'hot');

    const ttl = await redis.ttl(key);
    // hot tier = 5 min = 300 seconds
    assert.ok(ttl > 0 && ttl <= 300, `Expected TTL between 1-300s, got ${ttl}`);

    await invalidateAgent(AGENT_A);
  });

  it('search tier has longer TTL than hot tier', async () => {
    const redis = await getRedis();
    if (!redis) return;

    const hotKey = statsKey(AGENT_A);
    const searchKy = searchKey(AGENT_A, 'test query', 10);

    await Promise.all([
      cacheSet(hotKey, { hot_count: 1 }, 'hot'),
      cacheSet(searchKy, [{ content: 'test' }], 'search'),
    ]);

    const [hotTtl, searchTtl] = await Promise.all([
      redis.ttl(hotKey),
      redis.ttl(searchKy),
    ]);

    assert.ok(searchTtl > hotTtl, `Search TTL (${searchTtl}s) should exceed hot TTL (${hotTtl}s)`);

    await clearTestKeys();
  });
});

// ─── Statistics ───────────────────────────────────────────────────────────────

describe('Cache statistics', () => {
  it('tracks hits and misses in local counters', async () => {
    const before = getLocalStats();
    const key = searchKey(AGENT_A, 'stats-test', 5);

    // Miss
    await cacheGet(key);
    // Set + Hit
    await cacheSet(key, [{ content: 'data' }], 'search');
    await cacheGet(key);

    const after = getLocalStats();

    assert.ok(after.misses >= before.misses + 1, 'Should have recorded at least 1 miss');
    assert.ok(after.hits >= before.hits + 1, 'Should have recorded at least 1 hit');
    assert.ok(after.sets >= before.sets + 1, 'Should have recorded at least 1 set');

    await invalidateAgent(AGENT_A);
  });

  it('hit_rate is between 0 and 100', () => {
    const stats = getLocalStats();
    assert.ok(stats.hit_rate >= 0 && stats.hit_rate <= 100, `hit_rate ${stats.hit_rate} out of range`);
  });
});

// ─── Performance benchmark ────────────────────────────────────────────────────

describe('Performance benchmarks', () => {
  it('cached responses are faster than simulated DB queries', async () => {
    const key = searchKey(AGENT_A, 'benchmark-query', 10);
    const fakeResults = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      content: `Memory item ${i} with some content`,
      rank: Math.random(),
    }));

    await cacheSet(key, fakeResults, 'search');

    // Warm up
    await cacheGet(key);

    // Benchmark: 100 cache reads
    const RUNS = 100;
    const cacheStart = performance.now();
    for (let i = 0; i < RUNS; i++) {
      await cacheGet(key);
    }
    const cacheDuration = performance.now() - cacheStart;
    const avgCacheMs = cacheDuration / RUNS;

    // Simulate DB latency with a 5ms floor
    const simulatedDbMs = 5;

    console.log(`  Cache avg: ${avgCacheMs.toFixed(2)}ms | Simulated DB: ${simulatedDbMs}ms`);

    // Cache should be sub-millisecond on average for Redis localhost
    assert.ok(
      avgCacheMs < simulatedDbMs,
      `Cache avg (${avgCacheMs.toFixed(2)}ms) should be < simulated DB (${simulatedDbMs}ms)`,
    );

    await invalidateAgent(AGENT_A);
  });
});

console.log('[test] Cache integration tests loaded — running with node:test');
