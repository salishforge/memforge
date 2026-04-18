// MemForge — Sleep Advisory Tests (Sprint F, Phase 2)
//
// Tests the advisory sleep-scheduling recommendation engine.
// All tests use explicit data insertion and timestamps — no sleeps, no fixed waits.
//
// Run: node --import tsx/esm --test tests/sleep-advisory.test.ts
//
// WARNING: Requires DATABASE_URL pointing to a test database with schema applied.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');

// ─── Setup ───────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const AGENT = 'test-advisory-agent';

const pool = new Pool({ connectionString: DATABASE_URL });

async function ensureAgent(): Promise<void> {
  await pool.query(
    `INSERT INTO agents (id, metadata) VALUES ($1, '{}') ON CONFLICT (id) DO NOTHING`,
    [AGENT],
  );
}

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM reflections WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM warm_tier_entities WHERE warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = $1)`, [AGENT]);
  await pool.query(`DELETE FROM cold_tier WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [AGENT]);
}

async function insertHotRows(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await pool.query(
      `INSERT INTO hot_tier (agent_id, content, metadata, namespace)
       VALUES ($1, $2, '{}', 'default')`,
      [AGENT, `hot row ${i}`],
    );
  }
}

async function insertWarmRows(opts: { count: number; confidence?: number; graduated?: boolean }): Promise<void> {
  const confidence = opts.confidence ?? 0.8;
  const graduated = opts.graduated ?? false;
  for (let i = 0; i < opts.count; i++) {
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, source_hot_ids, metadata, confidence, graduated, namespace)
       VALUES ($1, $2, '{}', '{}', $3, $4, 'default')`,
      [AGENT, `warm row ${i}`, confidence, graduated],
    );
  }
}

async function insertReflections(total: number, withContradictions: number): Promise<void> {
  const now = new Date();
  for (let i = 0; i < total; i++) {
    const contradictions = i < withContradictions ? ['A contradicts B'] : [];
    await pool.query(
      `INSERT INTO reflections (agent_id, content, key_insights, contradictions, source_warm_ids,
                                trigger_type, reflection_level, source_reflection_ids, metadata, namespace, created_at)
       VALUES ($1, $2, '{}', $3, '{}', 'manual', 1, '{}', '{}', 'default', $4)`,
      [AGENT, `reflection ${i}`, JSON.stringify(contradictions), now],
    );
  }
}

async function setLastSleep(hoursAgo: number): Promise<void> {
  const ts = new Date(Date.now() - hoursAgo * 3_600_000);
  await pool.query(`UPDATE agents SET last_sleep_cycle = $1 WHERE id = $2`, [ts, AGENT]);
}

function makeManager(overrides: Record<string, unknown> = {}): InstanceType<typeof MemoryManager> {
  return new MemoryManager({
    databaseUrl: DATABASE_URL!,
    autoRegisterAgents: false,
    embeddingProvider: new NoOpEmbeddingProvider(),
    ...overrides,
  });
}

// ─── 1. No activity → urgency 'none' ─────────────────────────────────────────

describe('sleep advisory — no activity', () => {
  const manager = makeManager();

  before(async () => {
    await cleanup();
    await ensureAgent();
  });
  after(cleanup);

  it('returns urgency=none and recommended=false when agent has no data', async () => {
    const advisory = await manager.sleepAdvisory(AGENT);

    assert.equal(advisory.urgency, 'none');
    assert.equal(advisory.recommended, false);
    assert.equal(advisory.agent_id, AGENT);
    assert.equal(advisory.hot_tier_count, 0);
    assert.equal(advisory.warm_tier_count, 0);
  });
});

// ─── 2. Hot backlog → high urgency ───────────────────────────────────────────

describe('sleep advisory — hot backlog triggers high urgency', () => {
  const manager = makeManager();

  before(async () => {
    await cleanup();
    await ensureAgent();
    await insertHotRows(600);
  });
  after(cleanup);

  it('returns urgency=high and the hot_backlog signal reports value=600', async () => {
    const advisory = await manager.sleepAdvisory(AGENT);

    assert.equal(advisory.urgency, 'high');
    assert.equal(advisory.recommended, true);
    assert.equal(advisory.hot_tier_count, 600);

    const signal = advisory.signals.find((s) => s.name === 'hot_backlog');
    assert.ok(signal, 'hot_backlog signal must be present');
    assert.equal(signal!.value, 600);
    assert.equal(signal!.urgency, 'high');
  });
});

// ─── 3. Contradiction rate → high urgency ────────────────────────────────────

describe('sleep advisory — contradiction rate triggers high urgency', () => {
  const manager = makeManager();

  before(async () => {
    await cleanup();
    await ensureAgent();
    // 2 of 10 reflections have contradictions → ratio 0.20 ≥ default threshold 0.20 → high
    await insertReflections(10, 2);
  });
  after(cleanup);

  it('returns urgency=high when contradiction rate equals the high threshold', async () => {
    const advisory = await manager.sleepAdvisory(AGENT);

    const signal = advisory.signals.find((s) => s.name === 'contradiction_rate');
    assert.ok(signal, 'contradiction_rate signal must be present');
    assert.ok(signal!.value >= 0.20, `expected rate ≥ 0.20, got ${signal!.value}`);
    assert.equal(signal!.urgency, 'high');
    assert.equal(advisory.urgency, 'high');
  });
});

// ─── 4. Revision debt → medium urgency ───────────────────────────────────────

describe('sleep advisory — revision debt triggers medium urgency', () => {
  const manager = makeManager();

  before(async () => {
    await cleanup();
    await ensureAgent();
    await insertWarmRows({ count: 60, confidence: 0.2 });
  });
  after(cleanup);

  it('returns the revision_debt signal with value=60 and urgency=medium', async () => {
    const advisory = await manager.sleepAdvisory(AGENT);

    const signal = advisory.signals.find((s) => s.name === 'revision_debt');
    assert.ok(signal, 'revision_debt signal must be present');
    assert.equal(signal!.value, 60);
    assert.equal(signal!.urgency, 'medium');
    assert.equal(advisory.urgency, 'medium');
  });
});

// ─── 5. Time since last sleep → medium urgency ───────────────────────────────

describe('sleep advisory — time since last sleep triggers medium urgency', () => {
  const manager = makeManager();

  before(async () => {
    await cleanup();
    await ensureAgent();
    // One hot row so hasActivity=true
    await insertHotRows(1);
    // Set last sleep to 25 h ago (> default 24 h threshold)
    await setLastSleep(25);
  });
  after(cleanup);

  it('returns urgency=medium from time_since_last_sleep signal', async () => {
    const advisory = await manager.sleepAdvisory(AGENT);

    const signal = advisory.signals.find((s) => s.name === 'time_since_last_sleep');
    assert.ok(signal, 'time_since_last_sleep signal must be present');
    assert.ok(signal!.value > 24, `expected > 24 h, got ${signal!.value}`);
    assert.equal(signal!.urgency, 'medium');
    // hot_backlog has only 1 row — well below all thresholds, so time signal dominates
    assert.ok(
      advisory.urgency === 'medium' || advisory.urgency === 'high',
      `expected urgency medium or high, got ${advisory.urgency}`,
    );
  });
});

// ─── 6. Stability ceiling clamps urgency ─────────────────────────────────────

describe('sleep advisory — stability ceiling clamps urgency', () => {
  const manager = makeManager();

  before(async () => {
    await cleanup();
    await ensureAgent();
    // 100 warm rows, 85 graduated → 85% graduation > ceiling 0.80
    await insertWarmRows({ count: 85, graduated: true });
    await insertWarmRows({ count: 15, graduated: false });
    // 600 hot rows would normally trigger high urgency
    await insertHotRows(600);
  });
  after(cleanup);

  it('caps overall urgency to low despite hot_backlog=600 when stability ceiling is active', async () => {
    const advisory = await manager.sleepAdvisory(AGENT);

    // The stability signal itself carries no positive urgency
    const stabilitySignal = advisory.signals.find((s) => s.name === 'stability');
    assert.ok(stabilitySignal, 'stability signal must be present');
    assert.equal(stabilitySignal!.urgency, 'none');
    assert.ok(stabilitySignal!.value > 0.80, `expected stability > 0.80, got ${stabilitySignal!.value}`);

    // Hot backlog signal is still high internally
    const hotSignal = advisory.signals.find((s) => s.name === 'hot_backlog');
    assert.ok(hotSignal, 'hot_backlog signal must be present');
    assert.equal(hotSignal!.urgency, 'high');

    // But overall urgency is clamped to low
    assert.equal(advisory.urgency, 'low', 'stability ceiling must clamp overall urgency to low');
  });
});

// ─── 7. Custom thresholds via config ─────────────────────────────────────────

describe('sleep advisory — custom thresholds override defaults', () => {
  // Lower hotBacklogHigh to 50 so that 60 rows trigger high
  const manager = makeManager({
    sleepAdvisoryThresholds: { hotBacklogHigh: 50 },
  });

  before(async () => {
    await cleanup();
    await ensureAgent();
    await insertHotRows(60);
  });
  after(cleanup);

  it('returns urgency=high when hot rows exceed the custom hotBacklogHigh threshold', async () => {
    const advisory = await manager.sleepAdvisory(AGENT);

    assert.equal(advisory.urgency, 'high');
    assert.equal(advisory.recommended, true);

    const signal = advisory.signals.find((s) => s.name === 'hot_backlog');
    assert.ok(signal, 'hot_backlog signal must be present');
    assert.equal(signal!.value, 60);
    assert.equal(signal!.urgency, 'high');
    assert.equal(signal!.threshold, 50);
  });
});
