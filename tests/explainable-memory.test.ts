// MemForge — Explainable Memory Operations tests (Phase 5 Feature 2, v3.10)
//
// Three layers:
//   Integration — explain flag in query(), explainMemory() against real DB
//   E2E         — GET /memory/:id/explain and query?explain=true via HTTP
//
// No migration layer — this feature is pure code (no schema changes).
//
// Run: node --import tsx/esm --test tests/explainable-memory.test.ts
// Requires: DATABASE_URL

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { createDefaultRegistry } = await import('../src/classifier.js');
const { queryKey } = await import('../src/cache.js');

// ─── Config ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const TEST_AGENT = 'test-agent-explainable-memory';
const pool = new Pool({ connectionString: DATABASE_URL });

const SLEEP_CONFIG = {
  tokenBudget: 100_000,
  evictionThreshold: 0.05,
  revisionThreshold: 0.4,
  includeReflection: false,
  weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
};

const manager = new MemoryManager({
  databaseUrl: DATABASE_URL,
  consolidationBatchSize: 500,
  consolidationThreshold: 1,
  autoRegisterAgents: true,
  consolidationMode: 'concat',
  temporalDecayRate: 0,
  embeddingProvider: new NoOpEmbeddingProvider(),
  llmProvider: null,
  sleepCycle: SLEEP_CONFIG,
});

// ─── Cleanup helpers ─────────────────────────────────────────────────────────

async function cleanupAgent(agentId: string = TEST_AGENT): Promise<void> {
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM knowledge_gaps WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
}

async function ensureAgent(agentId: string = TEST_AGENT): Promise<void> {
  await pool.query(`INSERT INTO agents (id) VALUES ($1) ON CONFLICT DO NOTHING`, [agentId]);
}

// ─── Integration tests — query() explain flag ────────────────────────────────

describe('query() — explain flag', () => {
  before(async () => {
    await cleanupAgent();
    await ensureAgent();
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, content_hash, epistemic_status, importance)
       VALUES ($1, 'Explainable retrieval test fact', 'expl-q-1', 'established', 0.9)`,
      [TEST_AGENT],
    );
  });
  after(() => cleanupAgent());

  it('attaches an explanation array to each result when explain=true', async () => {
    const results = await manager.query(TEST_AGENT, { q: 'explainable retrieval', explain: true });

    assert.ok(results.length > 0, 'must return at least one result');
    for (const r of results) {
      assert.ok(Array.isArray(r.explanation), 'each result must carry an explanation array');
    }
  });

  it('explanation includes a rank_score factor with the result rank as weight', async () => {
    const results = await manager.query(TEST_AGENT, { q: 'explainable retrieval', explain: true });

    const first = results[0];
    assert.ok(first);
    const rankFactor = first.explanation?.find((f) => f.name === 'rank_score');
    assert.ok(rankFactor, 'rank_score factor must be present');
    assert.equal(rankFactor.weight, first.rank, 'rank_score weight must equal the result rank');
  });

  it('explanation includes a search_mode factor naming the query mode', async () => {
    const results = await manager.query(TEST_AGENT, { q: 'explainable retrieval', mode: 'keyword', explain: true });

    const factor = results[0]?.explanation?.find((f) => f.name === 'search_mode');
    assert.ok(factor, 'search_mode factor must be present');
    assert.ok(factor.detail.includes('keyword'), `detail must name the mode: ${factor.detail}`);
  });

  it('explanation includes an epistemic_status factor for rows with a status', async () => {
    const results = await manager.query(TEST_AGENT, { q: 'explainable retrieval', explain: true });

    const factor = results[0]?.explanation?.find((f) => f.name === 'epistemic_status');
    assert.ok(factor, 'epistemic_status factor must be present');
    assert.equal(factor.weight, 1.0, 'established status must weigh 1.0');
  });

  it('weighs provisional status at 0.5', async () => {
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, content_hash, epistemic_status, importance)
       VALUES ($1, 'Provisional weighting fixture', 'expl-q-prov', 'provisional', 0.8)`,
      [TEST_AGENT],
    );

    const results = await manager.query(TEST_AGENT, { q: 'provisional weighting', explain: true });

    const hit = results.find((r) => r.content.includes('Provisional weighting fixture'));
    assert.ok(hit, 'provisional fixture must be retrieved');
    const factor = hit.explanation?.find((f) => f.name === 'epistemic_status');
    assert.equal(factor?.weight, 0.5, 'provisional status must weigh 0.5');
  });

  it('weighs contested status at 0.2', async () => {
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, content_hash, epistemic_status, importance)
       VALUES ($1, 'Contested weighting fixture', 'expl-q-cont', 'contested', 0.8)`,
      [TEST_AGENT],
    );

    const results = await manager.query(TEST_AGENT, { q: 'contested weighting', explain: true });

    const hit = results.find((r) => r.content.includes('Contested weighting fixture'));
    assert.ok(hit, 'contested fixture must be retrieved');
    const factor = hit.explanation?.find((f) => f.name === 'epistemic_status');
    assert.equal(factor?.weight, 0.2, 'contested status must weigh 0.2');
  });

  it('explanation includes a temporal_decay factor when decay is active', async () => {
    const results = await manager.query(TEST_AGENT, { q: 'explainable retrieval', decayRate: 0.01, explain: true });

    const factor = results[0]?.explanation?.find((f) => f.name === 'temporal_decay');
    assert.ok(factor, 'temporal_decay factor must be present when decayRate > 0');
    assert.ok(factor.weight > 0 && factor.weight <= 1, `decay weight must be in (0, 1]: ${factor.weight}`);
  });

  it('omits the temporal_decay factor when decay is disabled', async () => {
    const results = await manager.query(TEST_AGENT, { q: 'explainable retrieval', explain: true });

    const factor = results[0]?.explanation?.find((f) => f.name === 'temporal_decay');
    assert.equal(factor, undefined, 'temporal_decay must be absent with decayRate=0');
  });

  it('does not attach explanation when explain is not set', async () => {
    const results = await manager.query(TEST_AGENT, { q: 'explainable retrieval' });

    assert.ok(results.length > 0, 'must return at least one result');
    for (const r of results) {
      assert.ok(!('explanation' in r), 'explanation must be absent without explain=true');
    }
  });
});

// ─── Integration tests — explainMemory() ─────────────────────────────────────

describe('explainMemory() — memory state report', () => {
  before(async () => {
    await cleanupAgent();
    await ensureAgent();
  });
  after(() => cleanupAgent());

  it('returns the state report for an existing warm-tier row', async () => {
    const { rows } = await pool.query<{ id: bigint }>(
      `INSERT INTO warm_tier (agent_id, content, content_hash, epistemic_status, importance, confidence)
       VALUES ($1, 'Memory to explain in detail', 'expl-m-1', 'established', 0.8, 0.9)
       RETURNING id`,
      [TEST_AGENT],
    );
    const warmId = rows[0]?.id;
    assert.ok(warmId);

    const report = await manager.explainMemory(TEST_AGENT, BigInt(warmId));

    assert.equal(report['content_preview'], 'Memory to explain in detail');
    assert.equal(report['importance'], 0.8);
    assert.equal(report['confidence'], 0.9);
    assert.equal(report['epistemic_status'], 'established');
    assert.ok('access_count' in report, 'access_count must be present');
    assert.ok('staleness_score' in report, 'staleness_score must be present');
  });

  it('truncates content_preview to 200 characters', async () => {
    const longContent = 'x'.repeat(500);
    const { rows } = await pool.query<{ id: bigint }>(
      `INSERT INTO warm_tier (agent_id, content, content_hash)
       VALUES ($1, $2, 'expl-m-long') RETURNING id`,
      [TEST_AGENT, longContent],
    );

    const report = await manager.explainMemory(TEST_AGENT, BigInt(rows[0]!.id));

    assert.equal((report['content_preview'] as string).length, 200);
  });

  it('reports would_evict_by_threshold=true for low-importance ungraduated rows', async () => {
    const { rows } = await pool.query<{ id: bigint }>(
      `INSERT INTO warm_tier (agent_id, content, content_hash, importance, confidence, graduated)
       VALUES ($1, 'Doomed low-importance memory', 'expl-m-2', 0.01, 0.9, false)
       RETURNING id`,
      [TEST_AGENT],
    );

    const report = await manager.explainMemory(TEST_AGENT, BigInt(rows[0]!.id));

    const thresholds = report['thresholds'] as Record<string, unknown>;
    assert.equal(thresholds['eviction'], SLEEP_CONFIG.evictionThreshold);
    assert.equal(thresholds['would_evict_by_threshold'], true, 'importance 0.01 < 0.05 and not graduated');
    assert.equal(thresholds['would_flag_low_confidence'], false, 'confidence 0.9 >= 0.4');
  });

  it('reports would_evict_by_threshold=false for graduated rows', async () => {
    const { rows } = await pool.query<{ id: bigint }>(
      `INSERT INTO warm_tier (agent_id, content, content_hash, importance, graduated)
       VALUES ($1, 'Graduated low-importance memory', 'expl-m-3', 0.01, true)
       RETURNING id`,
      [TEST_AGENT],
    );

    const report = await manager.explainMemory(TEST_AGENT, BigInt(rows[0]!.id));

    const thresholds = report['thresholds'] as Record<string, unknown>;
    assert.equal(thresholds['would_evict_by_threshold'], false, 'graduation exempts rows from threshold eviction (capacity eviction is out of scope for this flag)');
  });

  it('reports would_flag_low_confidence=true for low-confidence rows', async () => {
    const { rows } = await pool.query<{ id: bigint }>(
      `INSERT INTO warm_tier (agent_id, content, content_hash, importance, confidence)
       VALUES ($1, 'Shaky low-confidence memory', 'expl-m-4', 0.8, 0.2)
       RETURNING id`,
      [TEST_AGENT],
    );

    const report = await manager.explainMemory(TEST_AGENT, BigInt(rows[0]!.id));

    const thresholds = report['thresholds'] as Record<string, unknown>;
    assert.equal(thresholds['would_flag_low_confidence'], true, 'confidence 0.2 < 0.4');
  });

  it('throws NOT_FOUND for a nonexistent warm-tier id', async () => {
    await assert.rejects(
      manager.explainMemory(TEST_AGENT, BigInt(999_999_999)),
      (err: Error & { code?: string }) => err.code === 'NOT_FOUND',
    );
  });

  it("throws NOT_FOUND for another agent's row (multi-tenant isolation)", async () => {
    const otherAgent = `${TEST_AGENT}-other`;
    try {
      await ensureAgent(otherAgent);
      const { rows } = await pool.query<{ id: bigint }>(
        `INSERT INTO warm_tier (agent_id, content, content_hash)
         VALUES ($1, 'Other agent private memory', 'expl-m-other') RETURNING id`,
        [otherAgent],
      );

      await assert.rejects(
        manager.explainMemory(TEST_AGENT, BigInt(rows[0]!.id)),
        (err: Error & { code?: string }) => err.code === 'NOT_FOUND',
      );
    } finally {
      await cleanupAgent(otherAgent);
    }
  });
});

// ─── Unit tests — query cache key separation ─────────────────────────────────
//
// Pure key-derivation tests: the Redis-backed behavior itself is exercised only
// when Redis is up, so the key contract is pinned here deterministically.

describe('queryKey — explain flag participates in the cache key', () => {
  it('produces distinct keys for explain=true vs explain=false', () => {
    const base = { mode: 'keyword', namespace: 'default' };

    const withExplain = queryKey('agent-1', 'some query', 10, { ...base, explain: true });
    const withoutExplain = queryKey('agent-1', 'some query', 10, { ...base, explain: false });

    assert.notEqual(withExplain, withoutExplain, 'explain=true and explain=false must never share a cache entry');
  });

  it('treats an omitted explain flag the same as explain=false', () => {
    const omitted = queryKey('agent-1', 'some query', 10, {});

    const explicitFalse = queryKey('agent-1', 'some query', 10, { explain: false });

    assert.equal(omitted, explicitFalse, 'omitted and explicit false must hit the same cache entry');
  });

  it('produces identical keys for identical parameters', () => {
    const params = { mode: 'hybrid', epistemic: 'only_established', explain: true };

    const key1 = queryKey('agent-1', 'some query', 10, params);
    const key2 = queryKey('agent-1', 'some query', 10, { ...params });

    assert.equal(key1, key2);
  });
});

// ─── E2E tests — HTTP via real server ────────────────────────────────────────

describe('Explainable Memory — E2E (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  const E2E_AGENT = `${TEST_AGENT}-e2e`;

  before(async () => {
    await cleanupAgent(E2E_AGENT);
    await ensureAgent(E2E_AGENT);

    const app = createApp({
      manager,
      auditChain: null,
      classifierRegistry: createDefaultRegistry(),
      rateLimitMax: 0,
    });
    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://localhost:${addr.port}`;
  });

  after(async () => {
    server.close();
    await cleanupAgent(E2E_AGENT);
  });

  it('GET /memory/:id/explain returns the state report for an existing row', async () => {
    const { rows } = await pool.query<{ id: bigint }>(
      `INSERT INTO warm_tier (agent_id, content, content_hash, importance)
       VALUES ($1, 'E2E explainable memory', 'expl-e2e-1', 0.7) RETURNING id`,
      [E2E_AGENT],
    );

    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/explain?warm_id=${rows[0]!.id}`);

    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: Record<string, unknown> };
    assert.equal(body.ok, true);
    assert.equal(body.data['content_preview'], 'E2E explainable memory');
    assert.ok('thresholds' in body.data, 'thresholds must be present');
  });

  it('GET /memory/:id/explain without warm_id returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/explain`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('warm_id'), `error must mention warm_id: ${body.error}`);
  });

  it('GET /memory/:id/explain with non-numeric warm_id returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/explain?warm_id=abc`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean };
    assert.equal(body.ok, false);
  });

  it('GET /memory/:id/explain with warm_id beyond int8 range returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/explain?warm_id=99999999999999999999999`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('warm_id'), `error must mention warm_id: ${body.error}`);
  });

  it('GET /memory/:id/explain with an invalid agent id returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/bad%20agent/explain?warm_id=1`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('agentId'), `error must mention agentId: ${body.error}`);
  });

  it('GET /memory/:id/explain with unknown warm_id returns 404', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/explain?warm_id=999999999`);

    assert.equal(res.status, 404);
    const body = await res.json() as { ok: boolean };
    assert.equal(body.ok, false);
  });

  it('GET /memory/:id/query?explain=true attaches explanation to results', async () => {
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, content_hash, importance)
       VALUES ($1, 'E2E query explanation fact', 'expl-e2e-q1', 0.8)`,
      [E2E_AGENT],
    );

    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/query?q=E2E+query+explanation&explain=true`);

    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: Array<{ explanation?: unknown[] }> };
    assert.equal(body.ok, true);
    assert.ok(body.data.length > 0, 'must return at least one result');
    for (const r of body.data) {
      assert.ok(Array.isArray(r.explanation), 'each result must carry an explanation array');
    }
  });

  it('GET /memory/:id/query without explain returns results without explanation', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/query?q=E2E+query+explanation`);

    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: Array<Record<string, unknown>> };
    assert.equal(body.ok, true);
    for (const r of body.data) {
      assert.ok(!('explanation' in r), 'explanation must be absent without explain=true');
    }
  });
});

// ─── Teardown ────────────────────────────────────────────────────────────────

after(async () => {
  await pool.end();
  await closePool();
});
