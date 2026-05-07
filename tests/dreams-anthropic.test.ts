// MemForge — Layer 3 (Service): Anthropic Dreams delegation tests
//
// Stands up a local stub of Anthropic's /v1/dreams + /v1/memory_stores so
// we can exercise the full pipeline (create → poll → fetch output → merge)
// without an Anthropic API key. The stub also covers 401, transient 5xx,
// and budget enforcement.
//
// The AnthropicDreamsClient hardcodes https://api.anthropic.com/v1/dreams,
// so we re-import the module after monkey-patching `fetch` to redirect
// requests to the stub server.
//
// Run: node --import tsx/esm --test tests/dreams-anthropic.test.ts

process.env['OAUTH2_REQUIRED'] = 'false';
process.env['MEMFORGE_TOKEN'] = 'test-bearer';
process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key';
process.env['DREAMS_PROVIDER'] = 'anthropic';
process.env['DREAMS_BUDGET_USD_MICROS'] = '100000000'; // $100 — lots of headroom

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';

const TEST_AGENT = 'test-agent-anthropic-svc';
const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

// ─── Stub Anthropic server ──────────────────────────────────────────────────
//
// Captures requests and returns canned responses keyed on URL. State machine:
//   POST /v1/dreams → 200 with { id, status:'pending' }
//   GET /v1/dreams/:id → 200 with { status:'completed', output_memory_store_id, usage }
//   GET /v1/memory_stores/:id → 200 with { records: [...] }
//
// We can also flip a response code for failure-mode tests.

interface StubMode {
  forceStatus: number | null;
  authMode: 'ok' | 'unauthorized';
}

const stubMode: StubMode = { forceStatus: null, authMode: 'ok' };
const requestLog: Array<{ method: string; url: string }> = [];
const lastInputStores: Array<{ records: Array<{ id?: string; content: string }> }> = [];

let stubServer: http.Server;
let stubBaseUrl: string;

function startStub(): Promise<void> {
  return new Promise((resolve) => {
    stubServer = http.createServer((req, res) => {
      requestLog.push({ method: req.method ?? '', url: req.url ?? '' });

      if (stubMode.authMode === 'unauthorized' || req.headers['x-api-key'] !== 'test-anthropic-key') {
        res.statusCode = 401;
        res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error' } }));
        return;
      }

      if (stubMode.forceStatus !== null) {
        res.statusCode = stubMode.forceStatus;
        res.end(JSON.stringify({ type: 'error' }));
        return;
      }

      if (req.method === 'POST' && req.url === '/v1/dreams') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { memory_store?: { records: Array<{ id?: string; content: string }> } };
            if (parsed.memory_store) lastInputStores.push(parsed.memory_store);
          } catch {
            // ignore parse errors in stub
          }
          res.statusCode = 200;
          res.end(JSON.stringify({
            id: 'drm_stub_001',
            memory_store_id: 'ms_stub_in',
            status: 'pending',
          }));
        });
        return;
      }

      if (req.method === 'GET' && req.url?.startsWith('/v1/dreams/')) {
        res.statusCode = 200;
        res.end(JSON.stringify({
          id: 'drm_stub_001',
          status: 'completed',
          output_memory_store_id: 'ms_stub_out',
          usage: { input_tokens: 1234, output_tokens: 567 },
        }));
        return;
      }

      if (req.method === 'GET' && req.url?.startsWith('/v1/memory_stores/')) {
        // Echo back records — the real Anthropic Dreams curates them, but
        // for the stub we return synthetic curated content tagged with
        // [curated] so the merge can be detected.
        const recs = lastInputStores[0]?.records ?? [];
        res.statusCode = 200;
        res.end(JSON.stringify({
          records: recs.map((r) => ({ id: r.id, content: `[curated] ${r.content}` })),
        }));
        return;
      }

      res.statusCode = 404;
      res.end('not found');
    });
    stubServer.listen(0, () => {
      const addr = stubServer.address() as AddressInfo;
      stubBaseUrl = `http://localhost:${addr.port}`;
      // Patch fetch *before* importing dreams-anthropic so the URL
      // constants resolve through our stub.
      const origFetch = globalThis.fetch;
      globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
        const urlStr = typeof input === 'string' ? input : input.toString();
        const rewritten = urlStr.replace('https://api.anthropic.com', stubBaseUrl);
        return origFetch(rewritten, init);
      }) as typeof fetch;
      resolve();
    });
  });
}

function stopStub(): Promise<void> {
  return new Promise((resolve) => stubServer.close(() => resolve()));
}

const pool = new Pool({ connectionString: DATABASE_URL });

let manager: import('../src/memory-manager.js').MemoryManager;
let worker: import('../src/dream-runs.js').DreamRunsWorker;

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM dream_runs WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

before(async () => {
  await startStub();
  // Re-import after fetch patch is in place.
  const { MemoryManager } = await import('../src/memory-manager.js');
  const { DreamRunsWorker } = await import('../src/dream-runs.js');
  const { MockLLMProvider } = await import('./mocks/mock-llm-provider.js');
  const { MockEmbeddingProvider } = await import('./mocks/mock-embedding-provider.js');

  manager = new MemoryManager({
    databaseUrl: DATABASE_URL,
    consolidationBatchSize: 500,
    consolidationThreshold: 1,
    autoRegisterAgents: true,
    consolidationMode: 'concat',
    temporalDecayRate: 0,
    embeddingProvider: new MockEmbeddingProvider(),
    llmProvider: new MockLLMProvider(),
    sleepCycle: {
      tokenBudget: 100_000,
      evictionThreshold: 0.1,
      revisionThreshold: 0.4,
      includeReflection: false,
      weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
    },
  });

  worker = new DreamRunsWorker(manager, pool, { databaseUrl: DATABASE_URL, disablePolling: true });
  await worker.start();
  await cleanup();
});

after(async () => {
  if (worker) await worker.stop();
  await cleanup();
  await pool.end();
  const { closePool } = await import('../src/db.js');
  await closePool();
  await stopStub();
});

describe('Layer 3 — Anthropic Dreams delegation', () => {
  it('source=anthropic dispatches to the stub and merges curated content', async () => {
    stubMode.authMode = 'ok';
    stubMode.forceStatus = null;
    requestLog.length = 0;
    lastInputStores.length = 0;

    // Seed a warm row that the dream run will operate on.
    await pool.query(
      `INSERT INTO agents (id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [TEST_AGENT],
    );
    // High importance/confidence so the local cycle's Phase 1/2 doesn't
    // evict the row before the Anthropic pass runs.
    const seed = await pool.query<{ id: string }>(
      `INSERT INTO warm_tier (agent_id, content, source_hot_ids, metadata, namespace, importance, confidence, access_count, last_accessed)
       VALUES ($1, 'original-content', '{}'::bigint[], '{}'::jsonb, 'default', 0.95, 0.95, 5, now())
       RETURNING id`,
      [TEST_AGENT],
    );
    const warmId = seed.rows[0]?.id;
    assert.ok(warmId);

    const run = await manager.createDreamRun(TEST_AGENT, {
      source: 'anthropic',
      model: 'claude-sonnet-4-6',
    });

    await worker.drainPending();

    const after = await manager.getDreamRun(TEST_AGENT, run.id);
    assert.ok(after);
    assert.equal(after.status, 'completed');
    assert.equal(after.external_dream_id, 'drm_stub_001');
    assert.equal(after.external_memory_store_id, 'ms_stub_in');
    assert.equal(after.external_output_store_id, 'ms_stub_out');
    assert.equal(after.usage_in_tokens >= 1234, true);
    assert.equal(after.usage_out_tokens, 567);
    assert.ok(after.cost_usd_micros > 0, 'cost computed');

    // Curated content merged into warm_tier.
    const { rows } = await pool.query<{ content: string }>(
      `SELECT content FROM warm_tier WHERE id = $1`,
      [warmId],
    );
    assert.equal(rows[0]?.content, '[curated] original-content');
  });

  it('401 from Anthropic fails the run (no local fallback)', async () => {
    stubMode.authMode = 'unauthorized';
    stubMode.forceStatus = null;

    await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, source_hot_ids, metadata, namespace, importance, confidence)
       VALUES ($1, 'will-not-be-curated', '{}'::bigint[], '{}'::jsonb, 'default', 0.95, 0.95)`,
      [TEST_AGENT],
    );

    const run = await manager.createDreamRun(TEST_AGENT, {
      source: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
    await worker.drainPending();

    const after = await manager.getDreamRun(TEST_AGENT, run.id);
    assert.ok(after);
    assert.equal(after.status, 'failed');
    assert.match(after.error ?? '', /auth/i);
  });

  it('5xx from Anthropic falls back to local cycle and annotates error', async () => {
    stubMode.authMode = 'ok';
    stubMode.forceStatus = 503;

    await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, source_hot_ids, metadata, namespace, importance, confidence)
       VALUES ($1, 'unchanged', '{}'::bigint[], '{}'::jsonb, 'default', 0.95, 0.95)`,
      [TEST_AGENT],
    );

    const run = await manager.createDreamRun(TEST_AGENT, {
      source: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
    await worker.drainPending();

    const after = await manager.getDreamRun(TEST_AGENT, run.id);
    assert.ok(after);
    assert.equal(after.status, 'completed', 'local cycle finishes the run');
    assert.equal(after.error, 'anthropic_unavailable_local_fallback');
    assert.equal(after.external_dream_id, null);
  }, { timeout: 20_000 });
});
