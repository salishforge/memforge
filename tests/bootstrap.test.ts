// MemForge — Cross-Agent Transfer Learning tests (Phase 5 Feature 7, v3.12)
//
// Three layers:
//   Integration — bootstrapAgent() against real DB (transfer semantics,
//                 discounts, dedup/idempotency, scoping)
//   E2E         — POST /memory/:id/bootstrap via HTTP
//
// No migration layer — bootstrap writes into existing tables.
//
// Run: node --import tsx/esm --test tests/bootstrap.test.ts
// Requires: DATABASE_URL (with migration-v3.11.sql applied)

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

const SOURCE = 'test-agent-bootstrap-source';
const TARGET = 'test-agent-bootstrap-target';
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

// ─── Cleanup / seed helpers ──────────────────────────────────────────────────

async function cleanupAgent(agentId: string): Promise<void> {
  await pool.query(`DELETE FROM abstractions WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM procedures WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM knowledge_gaps WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM reflections WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM causal_edges WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM memory_sequences WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM sleep_phase_analytics WHERE agent_id = $1`, [agentId]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
}

async function cleanupBoth(): Promise<void> {
  await cleanupAgent(SOURCE);
  await cleanupAgent(TARGET);
}

async function ensureAgent(agentId: string): Promise<void> {
  await pool.query(`INSERT INTO agents (id) VALUES ($1) ON CONFLICT DO NOTHING`, [agentId]);
}

async function seedSourceMemory(
  content: string,
  hash: string,
  opts: { epistemic?: string; importance?: number; confidence?: number; namespace?: string } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO warm_tier (agent_id, content, content_hash, epistemic_status, importance, confidence, namespace)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [SOURCE, content, hash, opts.epistemic ?? 'established', opts.importance ?? 0.8, opts.confidence ?? 0.8, opts.namespace ?? 'default'],
  );
}

async function seedSourceProcedure(condition: string, action: string, opts: { active?: boolean; confidence?: number } = {}): Promise<void> {
  await pool.query(
    `INSERT INTO procedures (agent_id, condition, action, confidence, active)
     VALUES ($1, $2, $3, $4, $5)`,
    [SOURCE, condition, action, opts.confidence ?? 0.8, opts.active ?? true],
  );
}

async function seedSourcePrinciple(content: string, opts: { active?: boolean; confidence?: number } = {}): Promise<void> {
  await pool.query(
    `INSERT INTO abstractions (agent_id, level, content, confidence, active)
     VALUES ($1, 'principle', $2, $3, $4)`,
    [SOURCE, content, opts.confidence ?? 0.8, opts.active ?? true],
  );
}

// ─── Integration tests — bootstrapAgent() ────────────────────────────────────

describe('bootstrapAgent — memory transfer', () => {
  // One bootstrap runs in before(); the tests assert its observable outcome
  // independently. Only the idempotency test performs a second action.
  let firstRun: Awaited<ReturnType<typeof manager.bootstrapAgent>>;

  before(async () => {
    await cleanupBoth();
    await ensureAgent(SOURCE);
    await seedSourceMemory('Established fact worth inheriting', 'bs-mem-1', { importance: 0.9, confidence: 0.8 });
    await seedSourceMemory('Provisional guess not worth inheriting', 'bs-mem-2', { epistemic: 'provisional' });
    await seedSourceMemory('Contested claim not worth inheriting', 'bs-mem-3', { epistemic: 'contested' });
    await seedSourceMemory('Other-namespace fact', 'bs-mem-4', { namespace: 'sidechannel' });

    firstRun = await manager.bootstrapAgent({ sourceAgentId: SOURCE, targetAgentId: TARGET });
  });
  after(cleanupBoth);

  it('copies established memories at half importance/confidence as inferred, marked with provenance', async () => {
    const result = firstRun;

    assert.equal(result.memories_transferred, 1, 'only the default-namespace established memory qualifies');
    const { rows } = await pool.query<{
      content: string; importance: number; confidence: number;
      epistemic_status: string; metadata: Record<string, unknown>;
    }>(
      `SELECT content, importance, confidence, epistemic_status, metadata FROM warm_tier WHERE agent_id = $1`,
      [TARGET],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.content, 'Established fact worth inheriting');
    assert.ok(Math.abs((rows[0]?.importance ?? 0) - 0.45) < 1e-6, 'importance 0.9 × 0.5');
    assert.ok(Math.abs((rows[0]?.confidence ?? 0) - 0.4) < 1e-6, 'confidence 0.8 × 0.5');
    assert.equal(rows[0]?.epistemic_status, 'inferred', 'the target has not observed this itself');
    assert.equal(rows[0]?.metadata['_transferred_from'], SOURCE);
  });

  it('a second bootstrap transfers nothing (idempotent by content hash)', async () => {
    const result = await manager.bootstrapAgent({ sourceAgentId: SOURCE, targetAgentId: TARGET });

    assert.equal(result.memories_transferred, 0);
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM warm_tier WHERE agent_id = $1`, [TARGET],
    );
    assert.equal(rows[0]?.count, '1', 'no duplicate rows on re-run');
  });

  it('auto-registers the target agent', async () => {
    const { rows } = await pool.query(`SELECT 1 FROM agents WHERE id = $1`, [TARGET]);

    assert.equal(rows.length, 1, 'bootstrap must create the target agents row');
  });
});

describe('bootstrapAgent — organic-content dedup', () => {
  before(async () => {
    await cleanupBoth();
    await ensureAgent(SOURCE);
    await ensureAgent(TARGET);
    await seedSourceMemory('Insight the target already learned on its own', 'bs-organic-src');
    // The target owns the same text organically — its content_hash comes from
    // a different scheme (audit chain / default ''), never md5(content).
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, content_hash, epistemic_status)
       VALUES ($1, 'Insight the target already learned on its own', 'audit-chain-hash-xyz', 'established')`,
      [TARGET],
    );
  });
  after(cleanupBoth);

  it('skips memories whose exact content the target already owns, regardless of hash scheme', async () => {
    const result = await manager.bootstrapAgent({ sourceAgentId: SOURCE, targetAgentId: TARGET });

    assert.equal(result.memories_transferred, 0);
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM warm_tier WHERE agent_id = $1`, [TARGET],
    );
    assert.equal(rows[0]?.count, '1', 'the organic row must remain the only copy');
  });
});

describe('bootstrapAgent — caps and ordering', () => {
  before(async () => {
    await cleanupBoth();
    await ensureAgent(SOURCE);
    await seedSourceMemory('Most important source fact', 'bs-cap-1', { importance: 0.9 });
    await seedSourceMemory('Middling source fact', 'bs-cap-2', { importance: 0.6 });
    await seedSourceMemory('Least important source fact', 'bs-cap-3', { importance: 0.3 });
  });
  after(cleanupBoth);

  it('respects max_memories and takes the highest-importance rows first', async () => {
    const result = await manager.bootstrapAgent({ sourceAgentId: SOURCE, targetAgentId: TARGET, maxMemories: 2 });

    assert.equal(result.memories_transferred, 2);
    const { rows } = await pool.query<{ content: string }>(
      `SELECT content FROM warm_tier WHERE agent_id = $1 ORDER BY importance DESC`, [TARGET],
    );
    assert.deepEqual(
      rows.map((r) => r.content),
      ['Most important source fact', 'Middling source fact'],
    );
  });

  it('a zero cap skips the category entirely', async () => {
    await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TARGET]);

    const result = await manager.bootstrapAgent({ sourceAgentId: SOURCE, targetAgentId: TARGET, maxMemories: 0 });

    assert.equal(result.memories_transferred, 0);
  });
});

describe('bootstrapAgent — procedures and principles', () => {
  let firstRun: Awaited<ReturnType<typeof manager.bootstrapAgent>>;

  before(async () => {
    await cleanupBoth();
    await ensureAgent(SOURCE);
    await seedSourceProcedure('deploy fails with timeout', 'roll back and page on-call', { confidence: 0.8 });
    await seedSourceProcedure('retired condition', 'retired action', { active: false });
    await seedSourcePrinciple('Verify configuration in staging first', { confidence: 0.9 });
    await seedSourcePrinciple('Retired principle', { active: false });

    firstRun = await manager.bootstrapAgent({ sourceAgentId: SOURCE, targetAgentId: TARGET });
  });
  after(cleanupBoth);

  it('copies active procedures at half confidence and skips inactive ones', async () => {
    const result = firstRun;

    assert.equal(result.procedures_transferred, 1);
    const { rows } = await pool.query<{ condition: string; confidence: number; metadata: Record<string, unknown> }>(
      `SELECT condition, confidence, metadata FROM procedures WHERE agent_id = $1`, [TARGET],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.condition, 'deploy fails with timeout');
    assert.ok(Math.abs((rows[0]?.confidence ?? 0) - 0.4) < 1e-6, 'confidence 0.8 × 0.5');
    assert.equal(rows[0]?.metadata['_transferred_from'], SOURCE);
  });

  it('copies active principles at half confidence with cleared reflection provenance', async () => {
    const { rows } = await pool.query<{ content: string; confidence: number; source_reflection_ids: string[] }>(
      `SELECT content, confidence, source_reflection_ids FROM abstractions WHERE agent_id = $1`, [TARGET],
    );

    assert.equal(rows.length, 1, 'only the active principle transfers');
    assert.equal(rows[0]?.content, 'Verify configuration in staging first');
    assert.ok(Math.abs((rows[0]?.confidence ?? 0) - 0.45) < 1e-6, 'confidence 0.9 × 0.5');
    assert.deepEqual(rows[0]?.source_reflection_ids, [], "the source's reflection ids are meaningless in the target");
  });

  it('re-running transfers no duplicate procedures or principles', async () => {
    const result = await manager.bootstrapAgent({ sourceAgentId: SOURCE, targetAgentId: TARGET });

    assert.equal(result.procedures_transferred, 0);
    assert.equal(result.principles_transferred, 0);
  });
});

describe('bootstrapAgent — per-category caps', () => {
  before(async () => {
    await cleanupBoth();
    await ensureAgent(SOURCE);
    await ensureAgent(TARGET);
    await seedSourceProcedure('condition one', 'action one', { confidence: 0.9 });
    await seedSourceProcedure('condition two', 'action two', { confidence: 0.7 });
    await seedSourceProcedure('condition three', 'action three', { confidence: 0.5 });
    await seedSourcePrinciple('Top principle by confidence', { confidence: 0.9 });
    await seedSourcePrinciple('Middle principle by confidence', { confidence: 0.7 });
    await seedSourcePrinciple('Bottom principle by confidence', { confidence: 0.5 });
    // The target already carries the top principle — its cap slot must go to
    // the next candidate, not be consumed by the skip.
    await pool.query(
      `INSERT INTO abstractions (agent_id, level, content, confidence)
       VALUES ($1, 'principle', 'Top principle by confidence', 0.45)`,
      [TARGET],
    );
  });
  after(cleanupBoth);

  it('respects max_procedures and takes the highest-confidence rules first', async () => {
    const result = await manager.bootstrapAgent({
      sourceAgentId: SOURCE, targetAgentId: TARGET,
      maxMemories: 0, maxProcedures: 2, maxPrinciples: 0,
    });

    assert.equal(result.procedures_transferred, 2);
    const { rows } = await pool.query<{ condition: string }>(
      `SELECT condition FROM procedures WHERE agent_id = $1 ORDER BY confidence DESC`, [TARGET],
    );
    assert.deepEqual(rows.map((r) => r.condition), ['condition one', 'condition two']);
  });

  it('already-carried principles do not consume max_principles slots', async () => {
    const result = await manager.bootstrapAgent({
      sourceAgentId: SOURCE, targetAgentId: TARGET,
      maxMemories: 0, maxProcedures: 0, maxPrinciples: 1,
    });

    assert.equal(result.principles_transferred, 1, 'the single slot must go to a transferable principle');
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM abstractions WHERE agent_id = $1 AND content = 'Middle principle by confidence'`,
      [TARGET],
    );
    assert.equal(rows[0]?.count, '1', 'the carried top principle is skipped, not slot-consumed');
  });
});

describe('bootstrapAgent — namespace scoping', () => {
  before(async () => {
    await cleanupBoth();
    await ensureAgent(SOURCE);
    await ensureAgent(TARGET);
    await seedSourceMemory('Sidechannel operational fact', 'bs-ns-1', { namespace: 'sidechannel' });
    await pool.query(
      `INSERT INTO procedures (agent_id, condition, action, confidence, namespace)
       VALUES ($1, 'sidechannel condition', 'sidechannel action', 0.8, 'sidechannel')`,
      [SOURCE],
    );
    await seedSourceMemory('Default-namespace fact', 'bs-ns-2');
  });
  after(cleanupBoth);

  it('a namespaced bootstrap transfers only that namespace, into that namespace', async () => {
    const result = await manager.bootstrapAgent({ sourceAgentId: SOURCE, targetAgentId: TARGET, namespace: 'sidechannel' });

    assert.equal(result.memories_transferred, 1);
    assert.equal(result.procedures_transferred, 1);
    const { rows } = await pool.query<{ namespace: string; content: string }>(
      `SELECT namespace, content FROM warm_tier WHERE agent_id = $1`, [TARGET],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.namespace, 'sidechannel');
    assert.equal(rows[0]?.content, 'Sidechannel operational fact');
  });

  it('content held only in another target namespace does not suppress the transfer', async () => {
    // The target owns the default-namespace text — in 'default'. A bootstrap
    // scoped to 'sidechannel' where the source ALSO holds that text must
    // still transfer it there: queries in 'sidechannel' cannot see 'default'.
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, content_hash, epistemic_status)
       VALUES ($1, 'Default-namespace fact', 'bs-ns-organic', 'established')`,
      [TARGET],
    );
    await seedSourceMemory('Default-namespace fact', 'bs-ns-3', { namespace: 'sidechannel' });

    const result = await manager.bootstrapAgent({ sourceAgentId: SOURCE, targetAgentId: TARGET, namespace: 'sidechannel' });

    assert.equal(result.memories_transferred, 1, 'the sidechannel copy must transfer despite the default-namespace twin');
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM warm_tier WHERE agent_id = $1 AND namespace = 'sidechannel' AND content = 'Default-namespace fact'`,
      [TARGET],
    );
    assert.equal(rows[0]?.count, '1');
  });
});

describe('bootstrapAgent — transaction atomicity', () => {
  const FAIL_TRIGGER = 'bootstrap_test_fail_abstractions';

  before(async () => {
    await cleanupBoth();
    await ensureAgent(SOURCE);
    await ensureAgent(TARGET);
    await seedSourceMemory('Memory that must roll back', 'bs-atomic-1');
    await seedSourceProcedure('atomic condition', 'atomic action');
    await seedSourcePrinciple('Principle whose insert is sabotaged');
    // Sabotage the third statement so the first two must roll back.
    await pool.query(`
      CREATE OR REPLACE FUNCTION bootstrap_test_fail() RETURNS trigger AS $$
      BEGIN
        IF NEW.agent_id = '${TARGET}' THEN
          RAISE EXCEPTION 'bootstrap-test sabotage';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER ${FAIL_TRIGGER} BEFORE INSERT ON abstractions FOR EACH ROW EXECUTE FUNCTION bootstrap_test_fail()`);
  });
  after(async () => {
    await pool.query(`DROP TRIGGER IF EXISTS ${FAIL_TRIGGER} ON abstractions`);
    await pool.query(`DROP FUNCTION IF EXISTS bootstrap_test_fail()`);
    await cleanupBoth();
  });

  it('a failure in the principles statement rolls back the memories and procedures', async () => {
    await assert.rejects(
      manager.bootstrapAgent({ sourceAgentId: SOURCE, targetAgentId: TARGET }),
      /bootstrap-test sabotage/,
    );

    const { rows: warm } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM warm_tier WHERE agent_id = $1`, [TARGET],
    );
    const { rows: procs } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM procedures WHERE agent_id = $1`, [TARGET],
    );
    assert.equal(warm[0]?.count, '0', 'memories must roll back');
    assert.equal(procs[0]?.count, '0', 'procedures must roll back');
  });
});

describe('bootstrapAgent — epistemic promotion path for inferred rows', () => {
  const PROMO_TARGET = `${TARGET}-promo`;
  const engine = new SleepCycleEngine(
    pool,
    { chat: async () => '', summarize: async () => ({ summary: '', keyFacts: [], entities: [], relationships: [], sentiment: 'neutral' as const }) } as never,
    new NoOpEmbeddingProvider(),
    {
      tokenBudget: 100_000,
      evictionThreshold: 0.05,
      revisionThreshold: 0.4,
      includeReflection: false,
      weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
    },
    null,
  );

  before(async () => {
    await cleanupAgent(PROMO_TARGET);
    await ensureAgent(PROMO_TARGET);
  });
  after(() => cleanupAgent(PROMO_TARGET));

  it('a corroborated inferred (bootstrapped) memory is promoted to established by Phase 5.12', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO warm_tier (agent_id, content, content_hash, epistemic_status, evidence_count, importance)
       VALUES ($1, 'Transferred then independently corroborated', 'bs-promo-1', 'inferred', 3, 0.8)
       RETURNING id`,
      [PROMO_TARGET],
    );
    // Positive retrievals on two distinct days — Phase 5.12's corroboration
    // bar. (It previously required two distinct namespaces, which no real
    // retrieval could ever satisfy; see tests/epistemic-confidence.test.ts.)
    await pool.query(
      `INSERT INTO retrieval_log (agent_id, warm_tier_id, query_text, query_mode, rank_position, namespace, outcome, created_at)
       VALUES
         ($1, $2, 'probe', 'keyword', 1, 'default', 'positive', now() - interval '2 days'),
         ($1, $2, 'probe', 'keyword', 1, 'default', 'positive', now())`,
      [PROMO_TARGET, rows[0]!.id],
    );

    await engine.run(PROMO_TARGET);

    const { rows: after } = await pool.query<{ epistemic_status: string }>(
      `SELECT epistemic_status FROM warm_tier WHERE id = $1`, [rows[0]!.id],
    );
    assert.equal(after[0]?.epistemic_status, 'established', 'inferred rows earn promotion by the same evidence bar');
  });
});

describe('bootstrapAgent — input validation', () => {
  it('rejects a bootstrap from an agent onto itself', async () => {
    await assert.rejects(
      manager.bootstrapAgent({ sourceAgentId: SOURCE, targetAgentId: SOURCE }),
      (err: Error) => err instanceof TypeError && err.message.includes('different'),
    );
  });
});

// ─── E2E tests — HTTP via real server ────────────────────────────────────────

describe('Transfer Learning — E2E (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  const E2E_SOURCE = `${SOURCE}-e2e`;
  const E2E_TARGET = `${TARGET}-e2e`;

  before(async () => {
    await cleanupAgent(E2E_SOURCE);
    await cleanupAgent(E2E_TARGET);
    await ensureAgent(E2E_SOURCE);
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, content_hash, epistemic_status, importance)
       VALUES ($1, 'E2E established source memory', 'bs-e2e-1', 'established', 0.9)`,
      [E2E_SOURCE],
    );

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
    await cleanupAgent(E2E_SOURCE);
    await cleanupAgent(E2E_TARGET);
  });

  it('POST /memory/:id/bootstrap transfers and reports counts', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_TARGET}/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_agent_id: E2E_SOURCE }),
    });

    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: { memories_transferred: number; source_agent_id: string; target_agent_id: string } };
    assert.equal(body.ok, true);
    assert.equal(body.data.memories_transferred, 1);
    assert.equal(body.data.source_agent_id, E2E_SOURCE);
    assert.equal(body.data.target_agent_id, E2E_TARGET);
  });

  it('POST /memory/:id/bootstrap without source_agent_id returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_TARGET}/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('source_agent_id'), `error must mention source_agent_id: ${body.error}`);
  });

  it('POST /memory/:id/bootstrap with source == target returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_TARGET}/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_agent_id: E2E_TARGET }),
    });

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('different'), `error must explain the constraint: ${body.error}`);
  });

  it('POST /memory/:id/bootstrap with max_memories over the schema cap returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_TARGET}/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_agent_id: E2E_SOURCE, max_memories: 2000 }),
    });

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('max_memories'), `error must mention max_memories: ${body.error}`);
  });

  it('POST /memory/:id/bootstrap with a malformed source agent id returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/${E2E_TARGET}/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_agent_id: 'bad agent id' }),
    });

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean };
    assert.equal(body.ok, false);
  });

  it('POST /memory/:id/bootstrap with an invalid target agent id returns 400', async () => {
    const res = await fetch(`${baseUrl}/memory/bad%20agent/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_agent_id: E2E_SOURCE }),
    });

    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('agentId'), `error must mention agentId: ${body.error}`);
  });
});

// ─── Teardown ────────────────────────────────────────────────────────────────

after(async () => {
  await pool.end();
  await closePool();
});
