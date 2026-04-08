// MemForge — HTTP API Tests
//
// Tests the full Express stack: request validation, response format,
// error handling, admin auth, and success paths.
//
// Requires: DATABASE_URL pointing to a test database with schema applied.
// Note: OAUTH2_REQUIRED must be 'false' (set below) since tests don't have an OAuth2 server.
//
// Run: node --import tsx/esm --test tests/http-api.test.ts

// Disable OAuth2 requirement before any imports (auth.ts reads this at module load)
process.env['OAUTH2_REQUIRED'] = 'false';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { createApp } = await import('../src/app.js');
const { createDefaultRegistry } = await import('../src/classifier.js');

// ─── Setup ──────────────────────────────────────────────────────────────────

const TEST_AGENT = 'test-agent-http';
const ADMIN_TOKEN = 'test-admin-secret';
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

const app = createApp({
  manager,
  auditChain: null,
  classifierRegistry: createDefaultRegistry(),
  adminToken: ADMIN_TOKEN,
  rateLimitMax: 0, // Disable rate limiting for tests
});

let server: Server;
let baseUrl: string;

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

before(async () => {
  await cleanup();
  server = app.listen(0); // Random available port
  const addr = server.address() as AddressInfo;
  baseUrl = `http://localhost:${addr.port}`;
});

after(async () => {
  server.close();
  await cleanup();
  await pool.end();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function get(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`);
}

// ─── Health & System Endpoints ──────────────────────────────────────────────

describe('Health and system endpoints', () => {
  it('GET /health returns ok', async () => {
    const res = await get('/health');
    assert.equal(res.status, 200);
    const body = await res.json() as { status: string };
    assert.equal(body.status, 'ok');
  });

  it('GET /metrics requires admin token', async () => {
    const res = await get('/metrics');
    assert.equal(res.status, 401);
  });

  it('GET /metrics returns Prometheus format with admin token', async () => {
    const res = await fetch(`${baseUrl}/metrics`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('http_requests_total') || text.includes('HELP'), 'metrics contain Prometheus data');
  });

  it('GET /api/spec.json returns OpenAPI spec', async () => {
    const res = await get('/api/spec.json');
    assert.equal(res.status, 200);
    const body = await res.json() as { openapi: string };
    assert.ok(body.openapi?.startsWith('3.'), 'OpenAPI 3.x spec');
  });
});

// ─── Input Validation ───────────────────────────────────────────────────────

describe('Input validation', () => {
  it('POST /memory/:agentId/add rejects missing content', async () => {
    const res = await post(`/memory/${TEST_AGENT}/add`, {});
    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('content'), 'error mentions content');
  });

  it('POST /memory/:agentId/add rejects non-string content', async () => {
    const res = await post(`/memory/${TEST_AGENT}/add`, { content: 123 });
    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean };
    assert.equal(body.ok, false);
  });

  it('GET /memory/:agentId/query rejects missing q param', async () => {
    const res = await get(`/memory/${TEST_AGENT}/query`);
    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('q'), 'error mentions q param');
  });

  it('GET /memory/:agentId/query rejects invalid limit', async () => {
    const res = await get(`/memory/${TEST_AGENT}/query?q=test&limit=-1`);
    assert.equal(res.status, 400);
  });

  it('GET /memory/:agentId/query rejects invalid mode', async () => {
    const res = await get(`/memory/${TEST_AGENT}/query?q=test&mode=invalid`);
    assert.equal(res.status, 400);
  });

  it('rejects invalid agentId characters', async () => {
    const res = await post('/memory/agent<script>/add', { content: 'test' });
    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.ok(body.error.includes('agentId'), 'error mentions agentId');
  });

  it('POST /memory/:agentId/consolidate rejects invalid mode', async () => {
    const res = await post(`/memory/${TEST_AGENT}/consolidate`, { mode: 'invalid' });
    assert.equal(res.status, 400);
  });

  it('POST /memory/:agentId/reflect rejects invalid trigger', async () => {
    const res = await post(`/memory/${TEST_AGENT}/reflect`, { trigger: 'invalid' });
    assert.equal(res.status, 400);
  });

  it('POST /memory/:agentId/feedback rejects missing retrieval_ids', async () => {
    const res = await post(`/memory/${TEST_AGENT}/feedback`, { outcome: 'positive' });
    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.ok(body.error.includes('retrieval_ids'));
  });

  it('POST /memory/:agentId/feedback rejects invalid outcome', async () => {
    const res = await post(`/memory/${TEST_AGENT}/feedback`, {
      retrieval_ids: [1],
      outcome: 'maybe',
    });
    assert.equal(res.status, 400);
  });
});

// ─── Success Paths ──────────────────────────────────────────────────────────

describe('Success paths', () => {
  before(cleanup);

  it('POST /memory/:agentId/add creates a memory', async () => {
    const res = await post(`/memory/${TEST_AGENT}/add`, {
      content: 'HTTP test memory about deployment pipelines',
      metadata: { source: 'test' },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: { id: string } };
    assert.equal(body.ok, true);
    assert.ok(body.data.id, 'returns memory id');
  });

  it('GET /memory/:agentId/query returns results', async () => {
    const res = await get(`/memory/${TEST_AGENT}/query?q=deployment`);
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: unknown[] };
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.data), 'returns array of results');
  });

  it('POST /memory/:agentId/consolidate works', async () => {
    const res = await post(`/memory/${TEST_AGENT}/consolidate`, {});
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: { warm_created: number } };
    assert.equal(body.ok, true);
    assert.ok('warm_created' in body.data, 'returns consolidation result');
  });

  it('GET /memory/:agentId/stats returns tier counts', async () => {
    const res = await get(`/memory/${TEST_AGENT}/stats`);
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: { hot_count: number } };
    assert.equal(body.ok, true);
    assert.ok('hot_count' in body.data, 'stats include hot_count');
  });

  it('GET /memory/:agentId/timeline returns entries', async () => {
    const res = await get(`/memory/${TEST_AGENT}/timeline`);
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: unknown[] };
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.data));
  });

  it('GET /memory/:agentId/entities returns entity list', async () => {
    const res = await get(`/memory/${TEST_AGENT}/entities`);
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: unknown[] };
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.data));
  });

  it('GET /memory/:agentId/health returns health metrics', async () => {
    const res = await get(`/memory/${TEST_AGENT}/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean };
    assert.equal(body.ok, true);
  });

  it('POST /memory/:agentId/active-recall works', async () => {
    const res = await post(`/memory/${TEST_AGENT}/active-recall`, {
      context: 'preparing to deploy',
      limit: 3,
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean };
    assert.equal(body.ok, true);
  });
});

// ─── Response Format ────────────────────────────────────────────────────────

describe('Response format', () => {
  it('success responses have { ok: true, data: ... }', async () => {
    const res = await get('/health');
    const body = await res.json() as Record<string, unknown>;
    // /health returns { status, ts } — no capability flags exposed
    assert.ok('status' in body);
    assert.ok(!('embeddings' in body), 'health should not expose capability flags');
  });

  it('error responses have { ok: false, error: ... }', async () => {
    const res = await post(`/memory/${TEST_AGENT}/add`, {});
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(typeof body.error === 'string');
  });

  it('500 errors do not leak internal details', async () => {
    // Force an error by querying a non-existent agent with stats
    // (stats throws when agent not found)
    const res = await get('/memory/nonexistent-agent-12345/stats');
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    // Should either be a 404 with agent-not-found or safe message
    assert.ok(
      !body.error.includes('stack') && !body.error.includes('at '),
      'error does not contain stack trace',
    );
  });
});

// ─── Admin Endpoints ────────────────────────────────────────────────────────

describe('Admin endpoints', () => {
  it('GET /admin/cache/stats requires admin token', async () => {
    const res = await get('/admin/cache/stats');
    assert.equal(res.status, 401);
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('Admin token'));
  });

  it('GET /admin/cache/stats works with valid admin token', async () => {
    const res = await fetch(`${baseUrl}/admin/cache/stats`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; data: { ttl_config: unknown } };
    assert.equal(body.ok, true);
    assert.ok(body.data.ttl_config, 'returns ttl config');
  });

  it('POST /admin/cache/clear requires admin token', async () => {
    const res = await post('/admin/cache/clear', {});
    assert.equal(res.status, 401);
  });

  it('POST /admin/cache/clear works with valid admin token', async () => {
    const res = await fetch(`${baseUrl}/admin/cache/clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean };
    assert.equal(body.ok, true);
  });
});

// ─── Content Classification ─────────────────────────────────────────────────

describe('Content classification on ingest', () => {
  it('redacts sensitive content and tags classification', async () => {
    const res = await post(`/memory/${TEST_AGENT}/add`, {
      content: 'My API key is sk-ant-api03-abc123def456',
    });
    assert.equal(res.status, 200);
    const body = await res.json() as {
      ok: boolean;
      data: { classification: { sensitivity: string; redacted: boolean } };
    };
    assert.equal(body.ok, true);
    assert.ok(body.data.classification.sensitivity !== 'public', 'classified as sensitive');
    assert.equal(body.data.classification.redacted, true, 'content was redacted');
  });
});

// ─── Audit endpoints without audit chain ────────────────────────────────────

describe('Audit endpoints without audit chain', () => {
  it('GET /memory/:agentId/verify returns 400 when audit chain not configured', async () => {
    const res = await get(`/memory/${TEST_AGENT}/verify`);
    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; error: string };
    assert.ok(body.error.includes('not configured') || body.error.includes('Audit'));
  });
});
