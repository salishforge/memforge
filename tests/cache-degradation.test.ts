// MemForge — cache degradation tests (Redis absent)
//
// The existing cache suite exits early when Redis is unreachable, so the
// no-Redis path — a documented, supported deployment — had no coverage at all.
// That is how this shipped: every cached read re-attempted a connection that
// takes ~7.5s to fail (connectTimeout plus the reconnect backoff ladder), so
// "graceful degradation" meant multi-second latency on every /query and
// /stats rather than an immediate fall-through to Postgres.
//
// These tests run ONLY when Redis is genuinely absent; with a live Redis they
// skip, because the breaker they exercise never opens.
//
// Run: node --import tsx/esm --test tests/cache-degradation.test.ts
// Requires: no database, no Redis.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

const { getRedis, cacheGet, cacheSet, resetRedisCircuitBreaker } = await import('../src/cache.js');

// Point at a port nothing listens on so the outcome does not depend on
// whether the developer happens to be running Redis locally.
process.env['REDIS_URL'] = 'redis://127.0.0.1:6390';

let redisAbsent = false;

before(async () => {
  resetRedisCircuitBreaker();
  const client = await getRedis();
  redisAbsent = client === null;
});

describe('cache degradation when Redis is unreachable', () => {
  it('reports no client rather than throwing', async (t) => {
    if (!redisAbsent) return t.skip('Redis reachable — breaker never opens');

    assert.equal(await getRedis(), null);
  });

  it('short-circuits subsequent connection attempts', async (t) => {
    if (!redisAbsent) return t.skip('Redis reachable — breaker never opens');

    // The first attempt in before() already failed and opened the breaker.
    // Every later call must return immediately instead of re-paying the
    // ~7.5s connect timeout. The generous bound still fails loudly against
    // the pre-fix behaviour, which took seconds per call.
    const start = Date.now();
    for (let i = 0; i < 5; i++) {
      assert.equal(await getRedis(), null);
    }
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 500, `5 calls with the breaker open took ${elapsed}ms — expected well under 500ms`);
  });

  it('cacheGet returns a miss immediately', async (t) => {
    if (!redisAbsent) return t.skip('Redis reachable — breaker never opens');

    const start = Date.now();
    const value = await cacheGet('memforge:degradation-probe:stats');
    const elapsed = Date.now() - start;

    assert.equal(value, null, 'a missing cache must read as a miss, not an error');
    assert.ok(elapsed < 500, `cacheGet took ${elapsed}ms with Redis absent`);
  });

  it('cacheSet is a no-op rather than a failure', async (t) => {
    if (!redisAbsent) return t.skip('Redis reachable — breaker never opens');

    const start = Date.now();
    await cacheSet('memforge:degradation-probe:stats', { hot_count: 1 }, 'hot');
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 500, `cacheSet took ${elapsed}ms with Redis absent`);
  });

  it('re-probes after the breaker is reset', async (t) => {
    if (!redisAbsent) return t.skip('Redis reachable — breaker never opens');

    // Resetting simulates the cooldown elapsing: the next call is allowed to
    // attempt a real connection again, so a Redis that comes back is picked
    // up rather than being suppressed forever.
    resetRedisCircuitBreaker();
    const start = Date.now();
    const client = await getRedis();
    const elapsed = Date.now() - start;

    assert.equal(client, null, 'still unreachable in this environment');
    assert.ok(elapsed > 50, `expected a real connection attempt after reset, took only ${elapsed}ms`);
  });
});
