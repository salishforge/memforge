// MemForge — Layer 4 (Bridge): Anthropic Memory Store sync tests
//
// Covers push/pull/sync-state against a stub Anthropic memory_stores API.
//
// Run: node --import tsx/esm --test tests/dreams-bridge.test.ts

process.env['OAUTH2_REQUIRED'] = 'false';
process.env['MEMFORGE_TOKEN'] = 'test-bearer';
process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key';
process.env['DREAMS_PROVIDER'] = 'anthropic';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';

const TEST_AGENT = 'test-agent-bridge';
const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required');
  process.exit(1);
}

const externalStore: { records: Array<{ id?: string; content: string }> } = { records: [] };
let stubServer: http.Server;
let stubBaseUrl: string;
let originalFetch: typeof fetch;

function startStub(): Promise<void> {
  return new Promise((resolve) => {
    stubServer = http.createServer((req, res) => {
      if (req.headers['x-api-key'] !== 'test-anthropic-key') {
        res.statusCode = 401;
        res.end('{"type":"error"}');
        return;
      }
      if (req.method === 'POST' && req.url === '/v1/memory_stores') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { records: Array<{ id?: string; content: string }> };
            externalStore.records = parsed.records ?? [];
          } catch { /* ignore */ }
          res.statusCode = 200;
          res.end(JSON.stringify({ id: 'ms_bridge_001' }));
        });
        return;
      }
      if (req.method === 'GET' && req.url?.startsWith('/v1/memory_stores/')) {
        res.statusCode = 200;
        res.end(JSON.stringify(externalStore));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });
    stubServer.listen(0, () => {
      const addr = stubServer.address() as AddressInfo;
      stubBaseUrl = `http://localhost:${addr.port}`;
      originalFetch = globalThis.fetch;
      globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
        const urlStr = typeof input === 'string' ? input : input.toString();
        return originalFetch(urlStr.replace('https://api.anthropic.com', stubBaseUrl), init);
      }) as typeof fetch;
      resolve();
    });
  });
}

function stopStub(): Promise<void> {
  if (originalFetch) globalThis.fetch = originalFetch;
  return new Promise((resolve) => stubServer.close(() => resolve()));
}

const pool = new Pool({ connectionString: DATABASE_URL });
let manager: import('../src/memory-manager.js').MemoryManager;

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM dream_runs WHERE status IN ('pending', 'running') AND agent_id LIKE 'test-%'`);
  await pool.query(`DELETE FROM anthropic_memory_stores WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

before(async () => {
  await startStub();
  const { MemoryManager } = await import('../src/memory-manager.js');
  const { MockEmbeddingProvider } = await import('./mocks/mock-embedding-provider.js');
  manager = new MemoryManager({
    databaseUrl: DATABASE_URL,
    consolidationBatchSize: 500,
    consolidationThreshold: 1,
    autoRegisterAgents: true,
    consolidationMode: 'concat',
    temporalDecayRate: 0,
    embeddingProvider: new MockEmbeddingProvider(),
    llmProvider: null,
    sleepCycle: {
      tokenBudget: 100_000,
      evictionThreshold: 0.1,
      revisionThreshold: 0.4,
      includeReflection: false,
      weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
    },
  });
  await cleanup();
});

after(async () => {
  await cleanup();
  await pool.end();
  const { closePool } = await import('../src/db.js');
  await closePool();
  await stopStub();
});

describe('Layer 4 — Anthropic Memory Store Bridge', () => {
  it('pushToAnthropic creates a memory store and records the link', async () => {
    await pool.query(
      `INSERT INTO agents (id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [TEST_AGENT],
    );
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, source_hot_ids, metadata, namespace, importance, confidence)
       VALUES ($1, 'bridge-row-1', '{}'::bigint[], '{}'::jsonb, 'default', 0.9, 0.9),
              ($1, 'bridge-row-2', '{}'::bigint[], '{}'::jsonb, 'default', 0.8, 0.8)`,
      [TEST_AGENT],
    );

    const link = await manager.pushToAnthropic(TEST_AGENT);
    assert.equal(link.external_store_id, 'ms_bridge_001');
    assert.equal(link.direction, 'push');
    assert.equal(link.warm_row_count, 2);
    assert.ok(link.last_pushed_at);

    // External store now has both rows.
    assert.equal(externalStore.records.length, 2);
    assert.ok(externalStore.records.find((r) => r.content === 'bridge-row-1'));
  });

  it('pullFromAnthropic with anthropic-wins overwrites local content', async () => {
    // Tweak the stub: pretend Anthropic curated the first row.
    const firstId = externalStore.records[0]?.id;
    assert.ok(firstId);
    externalStore.records = [{ id: firstId, content: '[curated] bridge-row-1' }];

    const link = await manager.pullFromAnthropic(TEST_AGENT, {
      externalStoreId: 'ms_bridge_001',
      strategy: 'anthropic-wins',
    });
    // Push happened first in the previous test, so this row's direction
    // promoted to 'bidirectional' on the second sync (matches the
    // ON CONFLICT branch in pullFromAnthropic).
    assert.equal(link.direction, 'bidirectional');
    assert.ok(link.last_pulled_at);

    const { rows } = await pool.query<{ content: string }>(
      `SELECT content FROM warm_tier WHERE agent_id = $1 AND id = $2`,
      [TEST_AGENT, firstId],
    );
    assert.equal(rows[0]?.content, '[curated] bridge-row-1');
  });

  it('getAnthropicSyncState reports links and drift', async () => {
    const state = await manager.getAnthropicSyncState(TEST_AGENT);
    assert.equal(state.agent_id, TEST_AGENT);
    assert.equal(state.namespace, 'default');
    assert.equal(state.links.length, 1);
    assert.equal(state.links[0]?.external_store_id, 'ms_bridge_001');

    // Add a new warm row → drift should now be true.
    await pool.query(
      `INSERT INTO warm_tier (agent_id, content, source_hot_ids, metadata, namespace, importance, confidence)
       VALUES ($1, 'drift-row', '{}'::bigint[], '{}'::jsonb, 'default', 0.9, 0.9)`,
      [TEST_AGENT],
    );
    const after = await manager.getAnthropicSyncState(TEST_AGENT);
    assert.equal(after.drift_detected, true);
  });
});
