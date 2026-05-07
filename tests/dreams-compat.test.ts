// MemForge — Drop-in /v1/dreams (Anthropic Dreams compat) tests
//
// Verifies Layer 2: the /v1/dreams routes that mirror Anthropic's
// Managed Agents Dreams API shape. Tests the wire compatibility, the
// x-api-key auth shim, and the translation between Anthropic field
// names and MemForge's native dream_runs columns.
//
// Run: node --import tsx/esm --test tests/dreams-compat.test.ts

// auth.ts reads these at module load — must be set before any imports.
process.env['OAUTH2_REQUIRED'] = 'false';
process.env['MEMFORGE_TOKEN'] = 'test-bearer-token';
process.env['ANTHROPIC_COMPAT_ALLOW_ANY_TOKEN'] = 'true';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { createApp } = await import('../src/app.js');
const { createDefaultRegistry } = await import('../src/classifier.js');
const { closePool } = await import('../src/db.js');

const TEST_AGENT = 'test-agent-compat';
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
    includeReflection: false,
    weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
  },
});

const app = createApp({
  manager,
  auditChain: null,
  classifierRegistry: createDefaultRegistry(),
  rateLimitMax: 0,
});

let server: Server;
let baseUrl: string;

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM dream_runs WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

before(async () => {
  await cleanup();
  server = app.listen(0);
  const addr = server.address() as AddressInfo;
  baseUrl = `http://localhost:${addr.port}`;
});

after(async () => {
  server.close();
  await cleanup();
  await pool.end();
  await closePool();
});

describe('Drop-in /v1/dreams (Layer 2)', () => {
  it('POST /v1/dreams accepts x-api-key when ANTHROPIC_COMPAT_ALLOW_ANY_TOKEN=true', async () => {
    const res = await fetch(`${baseUrl}/v1/dreams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-bearer-token' },
      body: JSON.stringify({
        memory_store_id: TEST_AGENT,
        model: 'claude-sonnet-4-6',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assert.equal(body['object'], 'dream');
    assert.equal(body['memory_store_id'], TEST_AGENT);
    assert.equal(body['model'], 'claude-sonnet-4-6');
    assert.equal(body['status'], 'pending');
    assert.match(body['id'] as string, /^[0-9a-f-]{36}$/);
    assert.deepEqual(body['usage'], { input_tokens: 0, output_tokens: 0 });
  });

  it('POST /v1/dreams also accepts Authorization: Bearer', async () => {
    const res = await fetch(`${baseUrl}/v1/dreams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer test-bearer-token' },
      body: JSON.stringify({
        memory_store_id: TEST_AGENT,
        model: 'claude-opus-4-7',
        instructions: 'focus on factual accuracy',
        session_ids: ['default', 'second-device'],
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assert.equal(body['model'], 'claude-opus-4-7');
    assert.equal(body['instructions'], 'focus on factual accuracy');
    assert.deepEqual(body['session_ids'], ['default', 'second-device']);
  });

  it('rejects unknown fields with 400 + Anthropic error envelope (strict zod)', async () => {
    const res = await fetch(`${baseUrl}/v1/dreams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-bearer-token' },
      body: JSON.stringify({
        memory_store_id: TEST_AGENT,
        model: 'claude-sonnet-4-6',
        unknown_field: 'should be rejected',
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as Record<string, Record<string, string>>;
    assert.equal(body['type'], 'error');
    assert.equal(body['error']?.['type'], 'invalid_request_error');
  });

  it('rejects session_ids over Anthropic cap of 100 with 400', async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `s-${i}`);
    const res = await fetch(`${baseUrl}/v1/dreams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-bearer-token' },
      body: JSON.stringify({
        memory_store_id: TEST_AGENT,
        model: 'claude-sonnet-4-6',
        session_ids: tooMany,
      }),
    });
    assert.equal(res.status, 400);
  });

  it('GET /v1/dreams/:id returns the dream in Anthropic shape', async () => {
    const create = await fetch(`${baseUrl}/v1/dreams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-bearer-token' },
      body: JSON.stringify({ memory_store_id: TEST_AGENT, model: 'claude-sonnet-4-6' }),
    });
    const created = await create.json() as Record<string, unknown>;
    const dreamId = created['id'] as string;

    const get = await fetch(`${baseUrl}/v1/dreams/${dreamId}`, {
      headers: { 'x-api-key': 'test-bearer-token' },
    });
    assert.equal(get.status, 200);
    const fetched = await get.json() as Record<string, unknown>;
    assert.equal(fetched['id'], dreamId);
    assert.equal(fetched['memory_store_id'], TEST_AGENT);
  });

  it('GET /v1/dreams/:id returns 404 in Anthropic envelope when missing', async () => {
    const res = await fetch(`${baseUrl}/v1/dreams/00000000-0000-0000-0000-000000000000`, {
      headers: { 'x-api-key': 'test-bearer-token' },
    });
    assert.equal(res.status, 404);
    const body = await res.json() as Record<string, Record<string, string>>;
    assert.equal(body['type'], 'error');
    assert.equal(body['error']?.['type'], 'not_found_error');
  });

  it('POST /v1/dreams/:id/cancel transitions to canceled', async () => {
    const create = await fetch(`${baseUrl}/v1/dreams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-bearer-token' },
      body: JSON.stringify({ memory_store_id: TEST_AGENT, model: 'claude-sonnet-4-6' }),
    });
    const dreamId = (await create.json() as Record<string, string>)['id'];
    assert.ok(dreamId);

    const cancel = await fetch(`${baseUrl}/v1/dreams/${dreamId}/cancel`, {
      method: 'POST',
      headers: { 'x-api-key': 'test-bearer-token' },
    });
    assert.equal(cancel.status, 200);
    const body = await cancel.json() as Record<string, unknown>;
    assert.equal(body['status'], 'canceled');
  });

  it('rejects request with wrong x-api-key (401)', async () => {
    const res = await fetch(`${baseUrl}/v1/dreams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'wrong-key' },
      body: JSON.stringify({ memory_store_id: TEST_AGENT, model: 'claude-sonnet-4-6' }),
    });
    assert.equal(res.status, 401);
  });

  it('rejects request with no auth header (401)', async () => {
    const res = await fetch(`${baseUrl}/v1/dreams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory_store_id: TEST_AGENT, model: 'claude-sonnet-4-6' }),
    });
    assert.equal(res.status, 401);
  });
});
