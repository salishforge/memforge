// MemForge — Hierarchical Abstraction tests (Phase 5 Feature 4, v3.11)
//
// Four layers:
//   Integration — getAbstractions() / getPrinciples() against real DB
//   Sleep       — Phase 5.11 (phasePrincipleExtraction) via SleepCycleEngine.run()
//                 with a mock LLM returning a fixed PrincipleExtractionSchema JSON
//   E2E         — GET /memory/:id/principles and GET /memory/:id/abstractions via HTTP
//   Migration   — abstractions table, generated content_hash, unique constraint, index, RLS
//
// Run: node --import tsx/esm --test tests/abstractions.test.ts
// Requires: DATABASE_URL (with schema/migration-v3.11.sql applied)

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { SleepCycleEngine } = await import('../src/sleep-cycle.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { createDefaultRegistry } = await import('../src/classifier.js');

// ─── Config ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const TEST_AGENT = 'test-agent-abstractions';
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

// ─── Mock LLM engines ────────────────────────────────────────────────────────
//
// Phase 5.11 is the only phase that reaches llm.chat in these tests (Phase 3
// revision needs flagged warm rows, which are never seeded; reflection is
// disabled via includeReflection: false). Only the LLM boundary is mocked —
// the phase's SQL and parsing run for real.

const PRINCIPLE_HIGH = 'Always verify configuration changes in staging before production rollout';
const PRINCIPLE_LOW = 'Prefer asking clarifying questions over guessing intent';
const MOCK_PRINCIPLES_JSON = JSON.stringify({
  principles: [
    { content: PRINCIPLE_HIGH, confidence: 0.9 },
    { content: PRINCIPLE_LOW, confidence: 0.15 },
  ],
});

function makeEngine(chatResponse: string): InstanceType<typeof SleepCycleEngine> {
  return new SleepCycleEngine(
    pool,
    {
      chat: async () => chatResponse,
      summarize: async () => ({ summary: '', keyFacts: [], entities: [], relationships: [], sentiment: 'neutral' as const }),
    } as never,
    new NoOpEmbeddingProvider(),
    SLEEP_CONFIG,
    null,
  );
}

const engine = makeEngine(MOCK_PRINCIPLES_JSON);
const malformedEngine = makeEngine('this is not json at all {{');

// ─── Cleanup helpers ─────────────────────────────────────────────────────────

async function cleanupAgent(agentId: string = TEST_AGENT): Promise<void> {
  await pool.query(`DELETE FROM abstractions WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM reflections WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM sleep_phase_analytics WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
}

async function ensureAgent(agentId: string = TEST_AGENT): Promise<void> {
  await pool.query(`INSERT INTO agents (id) VALUES ($1) ON CONFLICT DO NOTHING`, [agentId]);
}

// ─── Seed helpers ────────────────────────────────────────────────────────────
//
// abstractions.id / reflections.id are BIGSERIAL — node-pg returns int8 as
// string, and int8[] (source_reflection_ids) as string[].

async function seedAbstraction(
  agentId: string,
  content: string,
  opts: {
    level?: string;
    confidence?: number;
    active?: boolean;
    namespace?: string;
    /** Postgres interval subtracted from now(), e.g. '4 days'. */
    age?: string;
  } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO abstractions (agent_id, level, content, confidence, active, namespace, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() - $7::interval)
     RETURNING id`,
    [
      agentId,
      opts.level ?? 'principle',
      content,
      opts.confidence ?? 0.5,
      opts.active ?? true,
      opts.namespace ?? 'default',
      opts.age ?? '0 seconds',
    ],
  );
  return rows[0]!.id;
}

async function seedReflection(agentId: string, content: string, level: number): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO reflections (agent_id, content, reflection_level)
     VALUES ($1, $2, $3) RETURNING id`,
    [agentId, content, level],
  );
  return rows[0]!.id;
}

/** Seed `count` meta-reflections (reflection_level 2) and return their ids. */
async function seedMetaReflections(agentId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(await seedReflection(agentId, `Meta-reflection insight number ${i} about recurring patterns`, 2));
  }
  return ids;
}

type AbstractionRow = {
  agent_id: string;
  level: string;
  content: string;
  source_reflection_ids: string[];
  confidence: number;
  active: boolean;
  namespace: string;
};

async function selectAbstractions(agentId: string): Promise<AbstractionRow[]> {
  const { rows } = await pool.query<AbstractionRow>(
    `SELECT agent_id, level, content, source_reflection_ids, confidence, active, namespace
     FROM abstractions WHERE agent_id = $1 ORDER BY confidence DESC, created_at DESC`,
    [agentId],
  );
  return rows;
}

// ─── Integration tests — getAbstractions() / getPrinciples() ─────────────────

describe('getAbstractions / getPrinciples — read paths', () => {
  const OTHER_AGENT = `${TEST_AGENT}-other`;

  before(async () => {
    await cleanupAgent();
    await cleanupAgent(OTHER_AGENT);
    await ensureAgent();
    await ensureAgent(OTHER_AGENT);
    // Confidences are float32-exact so ordering assertions can use equality.
    await seedAbstraction(TEST_AGENT, 'Ordering principle high', { confidence: 0.75 });
    await seedAbstraction(TEST_AGENT, 'Ordering principle low', { confidence: 0.25 });
    await seedAbstraction(TEST_AGENT, 'Strategy row', { level: 'strategy', confidence: 0.625 });
    await seedAbstraction(TEST_AGENT, 'Mental model row', { level: 'mental_model', confidence: 0.5 });
    await seedAbstraction(TEST_AGENT, 'Inactive principle row', { confidence: 0.875, active: false });
    await seedAbstraction(TEST_AGENT, 'Namespaced principle row', { confidence: 0.5, namespace: 'nsx' });
    await seedAbstraction(OTHER_AGENT, 'Other agent principle row', { confidence: 0.5 });
  });
  after(async () => {
    await cleanupAgent();
    await cleanupAgent(OTHER_AGENT);
  });

  it('returns active default-namespace rows ordered by confidence descending', async () => {
    const rows = await manager.getAbstractions(TEST_AGENT);

    assert.deepEqual(
      rows.map((r) => [r.content, r.confidence]),
      [
        ['Ordering principle high', 0.75],
        ['Strategy row', 0.625],
        ['Mental model row', 0.5],
        ['Ordering principle low', 0.25],
      ],
      'active default-namespace rows only, sorted by confidence desc',
    );
  });

  it('level filter returns only rows at that level', async () => {
    const rows = await manager.getAbstractions(TEST_AGENT, 'mental_model');

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.content, 'Mental model row');
    assert.equal(rows[0]?.level, 'mental_model');
  });

  it('namespace scoping returns only rows in the requested namespace', async () => {
    const rows = await manager.getAbstractions(TEST_AGENT, undefined, 'nsx');

    assert.deepEqual(rows.map((r) => r.content), ['Namespaced principle row']);
  });

  it('inactive rows are excluded', async () => {
    const rows = await manager.getAbstractions(TEST_AGENT);

    assert.ok(
      rows.every((r) => r.content !== 'Inactive principle row'),
      'the active=false row must never surface, despite its top confidence',
    );
  });

  it("another agent's rows are invisible", async () => {
    const mine = await manager.getAbstractions(TEST_AGENT);
    const theirs = await manager.getAbstractions(OTHER_AGENT);

    assert.ok(mine.every((r) => r.content !== 'Other agent principle row'));
    assert.deepEqual(theirs.map((r) => r.content), ['Other agent principle row']);
  });

  it("getPrinciples returns only level='principle' rows", async () => {
    const rows = await manager.getPrinciples(TEST_AGENT);

    assert.deepEqual(
      rows.map((r) => r.content),
      ['Ordering principle high', 'Ordering principle low'],
      'strategy and mental_model rows must be filtered out',
    );
    assert.ok(rows.every((r) => r.level === 'principle'));
  });
});

// ─── Sleep tests — Phase 5.11 principle extraction ───────────────────────────

describe('Phase 5.11 — principle extraction', () => {
  // Each test uses its own agent: engine.run() has cumulative side effects
  // (phase analytics, inserted principles), so shared agents would couple
  // tests to their execution order.

  it('creates the extracted principles as abstractions rows from >= 3 meta-reflections', async () => {
    const AGENT = `${TEST_AGENT}-extract`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      const reflectionIds = await seedMetaReflections(AGENT, 3);

      await engine.run(AGENT);

      const rows = await selectAbstractions(AGENT);
      assert.equal(rows.length, 2, 'both mocked principles must be inserted');
      assert.deepEqual(rows.map((r) => r.content), [PRINCIPLE_HIGH, PRINCIPLE_LOW]);
      assert.ok(rows.every((r) => r.level === 'principle'), "Phase 5.11 writes only level='principle'");
      assert.ok(rows.every((r) => r.namespace === 'default'), "Phase 5.11 writes only the 'default' namespace");
      assert.ok(rows.every((r) => r.active === true));
      assert.ok(Math.abs((rows[0]?.confidence ?? 0) - 0.9) < 1e-6, `confidence from the mock, got ${rows[0]?.confidence}`);
      assert.ok(Math.abs((rows[1]?.confidence ?? 0) - 0.15) < 1e-6, `confidence from the mock, got ${rows[1]?.confidence}`);
      for (const row of rows) {
        assert.deepEqual(
          [...row.source_reflection_ids].sort(),
          [...reflectionIds].sort(),
          'source_reflection_ids must record the meta-reflections that fed the extraction',
        );
      }
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('creates nothing with fewer than 3 meta-reflections', async () => {
    const AGENT = `${TEST_AGENT}-toofew`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 2);

      await engine.run(AGENT);

      const rows = await selectAbstractions(AGENT);
      assert.deepEqual(rows, [], 'two meta-reflections must stay below the extraction threshold');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('creates nothing when only level-1 reflections exist', async () => {
    const AGENT = `${TEST_AGENT}-level1`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      for (let i = 0; i < 5; i++) {
        await seedReflection(AGENT, `First-order reflection number ${i}`, 1);
      }

      await engine.run(AGENT);

      const rows = await selectAbstractions(AGENT);
      assert.deepEqual(rows, [], 'reflection_level 1 rows are not meta-reflections and must not feed extraction');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('a second run does not duplicate the same principles (content_hash dedup)', async () => {
    const AGENT = `${TEST_AGENT}-dedup`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 3);

      await engine.run(AGENT);
      const firstCount = (await selectAbstractions(AGENT)).length;
      await engine.run(AGENT);
      const secondCount = (await selectAbstractions(AGENT)).length;

      assert.equal(firstCount, 2);
      assert.equal(secondCount, 2, 're-extracting identical content must upsert-noop, not accumulate rows');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('deactivates principles below confidence 0.2 only once older than 3 days', async () => {
    const AGENT = `${TEST_AGENT}-deactivate`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      // >= 3 meta-reflections required — the phase returns before the
      // deactivation UPDATE when the extraction threshold is not met.
      await seedMetaReflections(AGENT, 3);
      await seedAbstraction(AGENT, 'Stale low-confidence principle', { confidence: 0.15, age: '4 days' });
      await seedAbstraction(AGENT, 'Young low-confidence principle', { confidence: 0.15, age: '1 day' });

      await engine.run(AGENT);

      const { rows } = await pool.query<{ content: string; active: boolean }>(
        `SELECT content, active FROM abstractions WHERE agent_id = $1 AND content LIKE '%low-confidence principle'`,
        [AGENT],
      );
      const byContent = new Map(rows.map((r) => [r.content, r.active]));
      assert.equal(byContent.get('Stale low-confidence principle'), false, 'older than 3 days → deactivated');
      assert.equal(byContent.get('Young low-confidence principle'), true, 'the cutoff is age-based — 1 day old survives');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('logs and creates nothing when the LLM returns malformed JSON', async () => {
    const AGENT = `${TEST_AGENT}-malformed`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 3);

      // Must not throw out of engine.run() — the phase swallows parse failures.
      await malformedEngine.run(AGENT);

      const rows = await selectAbstractions(AGENT);
      assert.deepEqual(rows, [], 'an unparseable LLM response must produce no abstractions');
    } finally {
      await cleanupAgent(AGENT);
    }
  });
});

// ─── E2E tests — HTTP via real server ────────────────────────────────────────

describe('Hierarchical Abstraction — E2E (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  const E2E_AGENT = `${TEST_AGENT}-e2e`;

  before(async () => {
    await cleanupAgent(E2E_AGENT);
    await ensureAgent(E2E_AGENT);
    await seedAbstraction(E2E_AGENT, 'E2E principle alpha', { confidence: 0.75 });
    await seedAbstraction(E2E_AGENT, 'E2E principle beta', { confidence: 0.25 });
    await seedAbstraction(E2E_AGENT, 'E2E strategy row', { level: 'strategy', confidence: 0.5 });
    await seedAbstraction(E2E_AGENT, 'E2E mental model row', { level: 'mental_model', confidence: 0.375 });

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

  it('GET /memory/:id/principles returns principle rows ordered by confidence', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/principles`);

    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: Array<{ content: string; level: string }> };
    assert.equal(body.ok, true);
    assert.deepEqual(body.data.map((a) => a.content), ['E2E principle alpha', 'E2E principle beta']);
    assert.ok(body.data.every((a) => a.level === 'principle'));
  });

  it('GET /memory/:id/principles?limit=1 trims to the top row', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/principles?limit=1`);

    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: Array<{ content: string }> };
    assert.deepEqual(body.data.map((a) => a.content), ['E2E principle alpha']);
  });

  it('GET /memory/:id/principles with limit=0 returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/principles?limit=0`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('limit'), `error must mention limit: ${body.error}`);
  });

  it('GET /memory/:id/principles with limit=51 returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/principles?limit=51`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('limit'), `error must mention limit: ${body.error}`);
  });

  it('GET /memory/:id/principles with an invalid namespace returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/principles?namespace=${encodeURIComponent('bad ns!')}`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('namespace'), `error must mention namespace: ${body.error}`);
  });

  it('GET /memory/:id/principles with an invalid agent id returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/bad%20agent/principles`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('agentId'), `error must mention agentId: ${body.error}`);
  });

  it('GET /memory/:id/abstractions returns all levels ordered by confidence', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/abstractions`);

    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: Array<{ content: string }> };
    assert.equal(body.ok, true);
    assert.deepEqual(
      body.data.map((a) => a.content),
      ['E2E principle alpha', 'E2E strategy row', 'E2E mental model row', 'E2E principle beta'],
    );
  });

  it('GET /memory/:id/abstractions?level=mental_model filters to that level', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/abstractions?level=mental_model`);

    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: Array<{ content: string; level: string }> };
    assert.deepEqual(body.data.map((a) => a.content), ['E2E mental model row']);
    assert.equal(body.data[0]?.level, 'mental_model');
  });

  it('GET /memory/:id/abstractions with an unknown level returns 400 listing valid values', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/abstractions?level=bogus`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('principle'), `error must list valid levels: ${body.error}`);
    assert.ok(body.error.includes('strategy'), `error must list valid levels: ${body.error}`);
    assert.ok(body.error.includes('mental_model'), `error must list valid levels: ${body.error}`);
  });

  it('GET /memory/:id/abstractions with invalid namespace returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_AGENT}/abstractions?namespace=Bad_NS!`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('namespace'), `error must mention namespace: ${body.error}`);
  });

  it('GET /memory/:id/abstractions with an invalid agent id returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/bad%20agent/abstractions`);

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('agentId'), `error must mention agentId: ${body.error}`);
  });
});

// ─── Sleep tests — Phase 5.11 review hardening ───────────────────────────────
//
// Behaviors pinned after the adversarial review: skip-gate immunity, analytics
// token attribution, result surfacing, gating boundaries, ordering tiebreak,
// deactivation scoping, and re-confirmation upsert semantics.

describe('Phase 5.11 — review hardening', () => {
  it('runs despite three prior zero-change analytics rows (not skip-gated)', async () => {
    const AGENT = `${TEST_AGENT}-noskip`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      for (let i = 0; i < 3; i++) {
        await pool.query(
          `INSERT INTO sleep_phase_analytics (agent_id, phase, duration_ms, tokens_used, changes_made)
           VALUES ($1, 'principle-extraction', 5, 0, 0)`,
          [AGENT],
        );
      }
      await seedMetaReflections(AGENT, 3);

      await engine.run(AGENT);

      const rows = await selectAbstractions(AGENT);
      assert.equal(rows.length, 2, 'a zero-change history must not disable extraction');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('records the real token spend in the principle-extraction analytics row', async () => {
    const AGENT = `${TEST_AGENT}-tokens`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 3);

      await engine.run(AGENT);

      const { rows } = await pool.query<{ tokens_used: number }>(
        `SELECT tokens_used FROM sleep_phase_analytics
         WHERE agent_id = $1 AND phase = 'principle-extraction'
         ORDER BY id DESC LIMIT 1`,
        [AGENT],
      );
      assert.ok((rows[0]?.tokens_used ?? 0) > 0, 'the LLM phase must attribute its token spend');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('surfaces the change count as SleepCycleResult.principles_extracted', async () => {
    const AGENT = `${TEST_AGENT}-result`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 3);

      const first = await engine.run(AGENT);
      const second = await engine.run(AGENT);

      assert.equal(first.principles_extracted, 2, 'both mocked principles count on the first run');
      assert.equal(second.principles_extracted, undefined, 'a no-op re-extraction reports no changes');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('creates nothing when the token budget is exhausted', async () => {
    const AGENT = `${TEST_AGENT}-budget`;
    const zeroBudgetEngine = new SleepCycleEngine(
      pool,
      { chat: async () => MOCK_PRINCIPLES_JSON, summarize: async () => ({ summary: '', keyFacts: [], entities: [], relationships: [], sentiment: 'neutral' as const }) } as never,
      new NoOpEmbeddingProvider(),
      { ...SLEEP_CONFIG, tokenBudget: 0 },
      null,
    );
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 3);

      await zeroBudgetEngine.run(AGENT);

      assert.deepEqual(await selectAbstractions(AGENT), [], 'no LLM call may happen at zero budget');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('reads only the 10 most recent meta-reflections', async () => {
    const AGENT = `${TEST_AGENT}-window`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 12);

      await engine.run(AGENT);

      const rows = await selectAbstractions(AGENT);
      assert.ok(rows[0]);
      assert.equal(rows[0].source_reflection_ids.length, 10, 'the source window is capped at 10');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('creates nothing from schema-invalid JSON (confidence out of range)', async () => {
    const AGENT = `${TEST_AGENT}-badschema`;
    const badEngine = makeEngine(JSON.stringify({ principles: [{ content: 'Range violation', confidence: 2.0 }] }));
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 3);

      await badEngine.run(AGENT);

      assert.deepEqual(await selectAbstractions(AGENT), []);
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('treats a missing principles key as an empty extraction, not an error', async () => {
    const AGENT = `${TEST_AGENT}-nokey`;
    const noKeyEngine = makeEngine(JSON.stringify({ unrelated: true }));
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 3);

      const result = await noKeyEngine.run(AGENT);

      assert.deepEqual(await selectAbstractions(AGENT), []);
      assert.equal(result.principles_extracted, undefined, 'the .default([]) path reports zero changes');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('deactivation spares old low-confidence rows of other levels and old confident principles', async () => {
    const AGENT = `${TEST_AGENT}-deact-scope`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 3);
      const confidentOld = await seedAbstraction(AGENT, 'Old but confident principle', { confidence: 0.5, age: '4 days' });
      const strategyOld = await seedAbstraction(AGENT, 'Old low-confidence strategy', { level: 'strategy', confidence: 0.15, age: '4 days' });

      await engine.run(AGENT);

      const { rows } = await pool.query<{ id: string; active: boolean }>(
        `SELECT id, active FROM abstractions WHERE agent_id = $1 AND id = ANY($2)`,
        [AGENT, [confidentOld, strategyOld]],
      );
      assert.ok(rows.every((r) => r.active), 'confidence >= 0.2 rows and non-principle levels must survive');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('orders equal-confidence abstractions newest-first (created_at tiebreak)', async () => {
    const AGENT = `${TEST_AGENT}-tiebreak`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedAbstraction(AGENT, 'Older principle at shared confidence', { confidence: 0.6, age: '2 days' });
      await seedAbstraction(AGENT, 'Newer principle at shared confidence', { confidence: 0.6, age: '1 hours' });

      const rows = await manager.getAbstractions(AGENT);

      assert.deepEqual(
        rows.map((r) => r.content),
        ['Newer principle at shared confidence', 'Older principle at shared confidence'],
      );
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('re-derivation at higher confidence raises the stored confidence', async () => {
    const AGENT = `${TEST_AGENT}-reconfirm`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 3);
      await seedAbstraction(AGENT, PRINCIPLE_HIGH, { confidence: 0.3 });

      const result = await engine.run(AGENT);

      const rows = await selectAbstractions(AGENT);
      const high = rows.find((r) => r.content === PRINCIPLE_HIGH);
      assert.ok(Math.abs((high?.confidence ?? 0) - 0.9) < 1e-6, 'confidence must rise to the re-derived 0.9');
      assert.equal(result.principles_extracted, 2, 'the raise and the fresh low principle both count as changes');
    } finally {
      await cleanupAgent(AGENT);
    }
  });

  it('confident re-derivation revives a deactivated principle; a weak one does not', async () => {
    const AGENT = `${TEST_AGENT}-revive`;
    try {
      await cleanupAgent(AGENT);
      await ensureAgent(AGENT);
      await seedMetaReflections(AGENT, 3);
      await seedAbstraction(AGENT, PRINCIPLE_HIGH, { confidence: 0.9, active: false });
      await seedAbstraction(AGENT, PRINCIPLE_LOW, { confidence: 0.15, active: false });

      await engine.run(AGENT);

      const rows = await selectAbstractions(AGENT);
      const high = rows.find((r) => r.content === PRINCIPLE_HIGH);
      const low = rows.find((r) => r.content === PRINCIPLE_LOW);
      assert.equal(high?.active, true, 'a 0.9-confidence re-derivation must revive the principle');
      assert.equal(low?.active, false, 'a 0.15-confidence re-derivation must not resurrect retired junk');
    } finally {
      await cleanupAgent(AGENT);
    }
  });
});

// ─── Migration tests — v3.11 abstractions ────────────────────────────────────

describe('Migration v3.11 — abstractions', () => {
  it('table exists with the expected columns, including generated content_hash', async () => {
    const { rows } = await pool.query<{ column_name: string; data_type: string; is_generated: string }>(
      `SELECT column_name, data_type, is_generated FROM information_schema.columns
       WHERE table_name = 'abstractions'`,
    );
    const cols = new Map(rows.map((r) => [r.column_name, r]));

    assert.equal(cols.get('id')?.data_type, 'bigint');
    assert.equal(cols.get('agent_id')?.data_type, 'text');
    assert.equal(cols.get('level')?.data_type, 'text');
    assert.equal(cols.get('content')?.data_type, 'text');
    assert.equal(cols.get('content_hash')?.data_type, 'text');
    assert.equal(cols.get('content_hash')?.is_generated, 'ALWAYS', 'content_hash must be a stored generated column');
    assert.equal(cols.get('source_reflection_ids')?.data_type, 'ARRAY');
    assert.equal(cols.get('confidence')?.data_type, 'real');
    assert.equal(cols.get('active')?.data_type, 'boolean');
    assert.equal(cols.get('namespace')?.data_type, 'text');
    assert.equal(cols.get('created_at')?.data_type, 'timestamp with time zone');
  });

  it('has a UNIQUE constraint on (agent_id, level, namespace, content_hash)', async () => {
    const { rows } = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'abstractions'::regclass AND contype = 'u'`,
    );

    assert.equal(rows.length, 1, 'exactly one unique constraint expected');
    assert.equal(rows[0]?.def, 'UNIQUE (agent_id, level, namespace, content_hash)');
  });

  it('rejects a duplicate (agent, level, namespace, content) insert without ON CONFLICT', async () => {
    const MIG_AGENT = `${TEST_AGENT}-migration`;
    try {
      await cleanupAgent(MIG_AGENT);
      await ensureAgent(MIG_AGENT);
      await seedAbstraction(MIG_AGENT, 'Duplicate constraint probe principle');

      await assert.rejects(
        seedAbstraction(MIG_AGENT, 'Duplicate constraint probe principle'),
        (err: Error & { code?: string }) => err.code === '23505',
        'identical content hashes to the same md5 and must violate the unique constraint',
      );
    } finally {
      await cleanupAgent(MIG_AGENT);
    }
  });

  it('has the (agent_id, level, active) read-path index', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'abstractions' AND indexname = 'abstractions_agent_level_idx'`,
    );

    assert.equal(rows.length, 1, 'abstractions_agent_level_idx must exist');
    assert.ok(rows[0]?.indexdef.includes('agent_id'), 'index must include agent_id');
    assert.ok(rows[0]?.indexdef.includes('level'), 'index must include level');
    assert.ok(rows[0]?.indexdef.includes('active'), 'index must include active');
  });

  it('has row level security enabled with the agent-isolation policy', async () => {
    const { rows: rls } = await pool.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'abstractions'`,
    );
    assert.equal(rls[0]?.relrowsecurity, true, 'RLS must be enabled on abstractions');

    const { rows: policies } = await pool.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE tablename = 'abstractions'`,
    );
    assert.ok(
      policies.some((p) => p.policyname === 'abstractions_agent_isolation'),
      'abstractions_agent_isolation policy must exist',
    );
  });
});

// ─── Teardown ────────────────────────────────────────────────────────────────

after(async () => {
  await pool.end();
  await closePool();
});
