// MemForge Standalone — Express REST API server
//
// Routes:
//   POST   /memory/:agentId/add
//   GET    /memory/:agentId/query?q=<text>[&limit=<n>]
//   POST   /memory/:agentId/consolidate
//   GET    /memory/:agentId/stats
//   GET    /health
//   GET    /metrics              (Prometheus)
//   GET    /api/spec.json        (OpenAPI 3.0)
//   GET    /api/docs             (Swagger UI)
//   GET    /admin/cache/stats    (admin — cache statistics)
//   POST   /admin/cache/clear   (admin — flush cache)
//   GET    /admin/cache/dashboard (admin — monitoring UI)

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { MemoryManager } from './memory-manager.js';
import { closePool } from './db.js';
import {
  registry,
  httpRequestsTotal,
  httpRequestDurationSeconds,
} from './metrics.js';
import { bearerAuth, requireScope } from './auth.js';
import {
  cacheGet,
  cacheSet,
  invalidateAgent,
  flushCache,
  statsKey,
  searchKey,
  getLocalStats,
  getRedisStats,
  closeRedis,
} from './cache.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3333', 10);

// Simple shared secret for admin endpoints (optional — set ADMIN_TOKEN env var)
const ADMIN_TOKEN = process.env['ADMIN_TOKEN'] ?? '';

const manager = new MemoryManager({
  databaseUrl: process.env['DATABASE_URL'],
  consolidationBatchSize: parseInt(process.env['CONSOLIDATION_BATCH_SIZE'] ?? '500', 10),
  consolidationThreshold: parseInt(process.env['CONSOLIDATION_THRESHOLD'] ?? '50', 10),
  autoRegisterAgents: process.env['AUTO_REGISTER_AGENTS'] !== 'false',
});

const app = express();
app.use(express.json());

// ─── Request metrics middleware ───────────────────────────────────────────────

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const route = (req.route?.path as string | undefined) ?? req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, (Date.now() - start) / 1000);
  });
  next();
});

// ─── OpenAPI spec ─────────────────────────────────────────────────────────────

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'MemForge Memory API',
    version: '1.1.0',
    description:
      'Tiered agent memory service with hot/warm/cold PostgreSQL storage, full-text search, and Redis caching.',
  },
  servers: [{ url: `http://localhost:${PORT}`, description: 'Local' }],
  tags: [
    { name: 'Memory', description: 'Agent memory operations' },
    { name: 'System', description: 'Health and observability' },
    { name: 'Admin', description: 'Administrative endpoints' },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        tags: ['System'],
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    ts: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/metrics': {
      get: {
        summary: 'Prometheus metrics',
        tags: ['System'],
        responses: {
          '200': {
            description: 'Prometheus text format metrics',
            content: { 'text/plain': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/memory/{agentId}/add': {
      post: {
        summary: 'Add memory event to hot tier',
        tags: ['Memory'],
        parameters: [
          { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  content: { type: 'string', description: 'Memory content to store' },
                  metadata: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Memory added', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
          '400': { '$ref': '#/components/responses/BadRequest' },
          '500': { '$ref': '#/components/responses/InternalError' },
        },
      },
    },
    '/memory/{agentId}/query': {
      get: {
        summary: 'Full-text search warm tier (cached 10 min)',
        tags: ['Memory'],
        parameters: [
          { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Search query' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 10 } },
        ],
        responses: {
          '200': { description: 'Search results', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
          '400': { '$ref': '#/components/responses/BadRequest' },
          '500': { '$ref': '#/components/responses/InternalError' },
        },
      },
    },
    '/memory/{agentId}/consolidate': {
      post: {
        summary: 'Trigger hot→warm memory consolidation (invalidates cache)',
        tags: ['Memory'],
        parameters: [
          { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Consolidation result', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
          '400': { '$ref': '#/components/responses/BadRequest' },
          '500': { '$ref': '#/components/responses/InternalError' },
        },
      },
    },
    '/memory/{agentId}/stats': {
      get: {
        summary: 'Get memory tier statistics for an agent (cached 5 min)',
        tags: ['Memory'],
        parameters: [
          { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Memory stats', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
          '404': { '$ref': '#/components/responses/NotFound' },
          '500': { '$ref': '#/components/responses/InternalError' },
        },
      },
    },
    '/admin/cache/stats': {
      get: {
        summary: 'Cache statistics (admin)',
        tags: ['Admin'],
        responses: {
          '200': { description: 'Cache hit/miss stats + Redis info' },
        },
      },
    },
    '/admin/cache/clear': {
      post: {
        summary: 'Flush cache (admin)',
        tags: ['Admin'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  agentId: { type: 'string', description: 'Flush only this agent (omit to flush all)' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Flush result' },
        },
      },
    },
  },
  components: {
    schemas: {
      OkResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          data: { description: 'Response payload' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: { type: 'string' },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad request',
        content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' } } },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' } } },
      },
      InternalError: {
        description: 'Internal server error',
        content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' } } },
      },
    },
  },
};

// ─── Swagger UI HTML helper ───────────────────────────────────────────────────

function swaggerUiHtml(specUrl: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${specUrl}',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      deepLinking: true,
    });
  </script>
</body>
</html>`;
}

// ─── Admin middleware ─────────────────────────────────────────────────────────

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  // If no ADMIN_TOKEN is configured, allow all (dev mode)
  if (!ADMIN_TOKEN) {
    next();
    return;
  }

  const auth = req.headers['authorization'];
  if (auth === `Bearer ${ADMIN_TOKEN}`) {
    next();
    return;
  }

  res.status(401).json({ ok: false, error: 'Admin token required' });
}

// ─── Admin routes ─────────────────────────────────────────────────────────────

/**
 * GET /admin/cache/stats
 * Returns cache hit/miss counters + Redis server info.
 */
app.get('/admin/cache/stats', adminAuth, async (_req, res) => {
  const [local, redis] = await Promise.all([getLocalStats(), getRedisStats()]);
  res.json({
    ok: true,
    data: {
      application: local,
      redis,
      ttl_config: {
        hot_seconds: 5 * 60,
        search_seconds: 10 * 60,
        consolidation_seconds: 30 * 60,
      },
    },
  });
});

/**
 * POST /admin/cache/clear
 * Body: { agentId?: string } — omit to flush all MemForge keys.
 */
app.post('/admin/cache/clear', adminAuth, async (req, res) => {
  const { agentId } = req.body as { agentId?: string };

  const deleted = await flushCache(agentId);
  res.json({
    ok: true,
    data: {
      deleted,
      scope: agentId ?? 'all',
    },
  });
});

/**
 * GET /admin/cache/dashboard
 * Simple HTML monitoring dashboard.
 */
app.get('/admin/cache/dashboard', adminAuth, (_req, res) => {
  res.type('html').send(cacheDashboardHtml());
});

// ─── Auth — all /memory routes require a valid Bearer token ──────────────────

app.use('/memory', bearerAuth);

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Returns 200 when the server is up.
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

/**
 * GET /metrics
 * Prometheus text-format metrics.
 */
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});

/**
 * GET /api/spec.json
 * OpenAPI 3.0 specification.
 */
app.get('/api/spec.json', (_req, res) => {
  res.json(openApiSpec);
});

/**
 * GET /api/docs
 * Interactive Swagger UI.
 */
app.get('/api/docs', (_req, res) => {
  res.type('html').send(swaggerUiHtml('/api/spec.json', 'MemForge API Docs'));
});

/**
 * POST /memory/:agentId/add
 * Requires scope: memforge:write
 * Body: { content: string, metadata?: object }
 * Side-effect: invalidates all cache entries for this agent.
 */
app.post('/memory/:agentId/add', requireScope('memforge:write'), async (req: Request, res: Response) => {
  const { content, metadata } = req.body as {
    content?: string;
    metadata?: Record<string, unknown>;
  };

  if (!content || typeof content !== 'string') {
    fail(res, 400, '"content" (string) is required');
    return;
  }

  try {
    const result = await manager.add(agentId(req), content, metadata ?? {});
    // Invalidate cache for this agent — data has changed
    void invalidateAgent(agentId(req));
    ok(res, result);
  } catch (err) {
    const e = err as Error;
    if (e.message.includes('not found') || e instanceof TypeError) {
      fail(res, 400, e.message);
    } else {
      fail(res, 500, e.message);
    }
  }
});

/**
 * GET /memory/:agentId/query?q=<text>[&limit=<n>]
 * Requires scope: memforge:read
 * Results cached in Redis for 10 minutes.
 */
app.get('/memory/:agentId/query', requireScope('memforge:read'), async (req: Request, res: Response) => {
  const q = req.query['q'];
  const limit = req.query['limit'];

  if (!q || typeof q !== 'string') {
    fail(res, 400, '"q" query param (string) is required');
    return;
  }

  const limitNum = limit !== undefined ? parseInt(limit as string, 10) : 10;
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
    fail(res, 400, '"limit" must be an integer between 1 and 200');
    return;
  }

  // Check cache
  const key = searchKey(agentId(req), q, limitNum);
  const cached = await cacheGet(key);
  if (cached !== null) {
    res.setHeader('X-Cache', 'HIT');
    ok(res, cached);
    return;
  }

  res.setHeader('X-Cache', 'MISS');

  try {
    const results = await manager.query(agentId(req), q, limitNum);
    void cacheSet(key, results, 'search');
    ok(res, results);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * POST /memory/:agentId/consolidate
 * Requires scope: memforge:write
 * Body: {} (no params required)
 * Side-effect: invalidates all cache entries for this agent.
 */
app.post('/memory/:agentId/consolidate', requireScope('memforge:write'), async (req: Request, res: Response) => {
  try {
    const result = await manager.consolidate(agentId(req));
    // Invalidate cache — warm tier changed, stats changed
    void invalidateAgent(agentId(req));
    ok(res, result);
  } catch (err) {
    const e = err as Error;
    if (e instanceof TypeError) {
      fail(res, 400, e.message);
    } else {
      fail(res, 500, e.message);
    }
  }
});

/**
 * GET /memory/:agentId/stats
 * Requires scope: memforge:read
 * Results cached in Redis for 5 minutes.
 */
app.get('/memory/:agentId/stats', requireScope('memforge:read'), async (req: Request, res: Response) => {
  // Check cache
  const key = statsKey(agentId(req));
  const cached = await cacheGet(key);
  if (cached !== null) {
    res.setHeader('X-Cache', 'HIT');
    ok(res, cached);
    return;
  }

  res.setHeader('X-Cache', 'MISS');

  try {
    const stats = await manager.stats(agentId(req));
    void cacheSet(key, stats, 'hot');
    ok(res, stats);
  } catch (err) {
    const e = err as Error;
    if (e.message.includes('not found')) {
      fail(res, 404, e.message);
    } else {
      fail(res, 500, e.message);
    }
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function agentId(req: Request): string {
  return req.params['agentId'] ?? '';
}

function ok(res: Response, data: unknown): void {
  res.json({ ok: true, data });
}

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ ok: false, error: message });
}

// ─── Cache monitoring dashboard ───────────────────────────────────────────────

function cacheDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MemForge Cache Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; color: #f1f5f9; }
    .subtitle { color: #64748b; font-size: 0.875rem; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.25rem; }
    .card-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.5rem; }
    .card-value { font-size: 2rem; font-weight: 700; color: #38bdf8; }
    .card-value.green { color: #4ade80; }
    .card-value.yellow { color: #facc15; }
    .card-value.red { color: #f87171; }
    .section { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.25rem; margin-bottom: 1rem; }
    .section h2 { font-size: 0.9rem; font-weight: 600; color: #94a3b8; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    td, th { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #1e293b; }
    th { color: #64748b; font-weight: 500; font-size: 0.75rem; text-transform: uppercase; }
    tr:last-child td { border-bottom: none; }
    .btn { background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.875rem; }
    .btn:hover { background: #1d4ed8; }
    .btn.red { background: #dc2626; }
    .btn.red:hover { background: #b91c1c; }
    .actions { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; }
    .refresh-indicator { font-size: 0.75rem; color: #475569; margin-left: auto; align-self: center; }
    .bar-container { background: #0f172a; border-radius: 9999px; height: 0.5rem; margin-top: 0.5rem; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 9999px; transition: width 0.3s; }
    .bar-fill.green { background: #4ade80; }
    .bar-fill.blue { background: #38bdf8; }
    .ttl-badge { display: inline-block; background: #1e3a5f; color: #7dd3fc; font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 9999px; margin-left: 0.5rem; }
  </style>
</head>
<body>
  <h1>MemForge Cache Dashboard</h1>
  <p class="subtitle">Redis caching layer — live statistics</p>

  <div class="actions">
    <button class="btn" onclick="refresh()">Refresh</button>
    <button class="btn red" onclick="clearCache()">Clear All Cache</button>
    <span class="refresh-indicator" id="last-updated">Loading…</span>
  </div>

  <div class="grid" id="stat-cards"></div>

  <div class="section">
    <h2>Hit Rate</h2>
    <div id="hit-rate-label" style="font-size:1.1rem;font-weight:600;color:#4ade80">—</div>
    <div class="bar-container"><div class="bar-fill green" id="hit-rate-bar" style="width:0%"></div></div>
  </div>

  <div class="section">
    <h2>Cache Tiers — TTL Configuration</h2>
    <table>
      <thead><tr><th>Tier</th><th>Routes</th><th>TTL</th></tr></thead>
      <tbody>
        <tr><td>Hot (stats)</td><td>/memory/:id/stats</td><td><span class="ttl-badge">5 min</span></td></tr>
        <tr><td>Search</td><td>/memory/:id/query</td><td><span class="ttl-badge">10 min</span></td></tr>
        <tr><td>Consolidation</td><td>—</td><td><span class="ttl-badge">30 min</span></td></tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Redis Server Info</h2>
    <table id="redis-table"><tbody><tr><td colspan="2">Loading…</td></tr></tbody></table>
  </div>

  <script>
    const BASE = '';

    function colorClass(hitRate) {
      if (hitRate >= 80) return 'green';
      if (hitRate >= 50) return 'yellow';
      return 'red';
    }

    async function refresh() {
      try {
        const r = await fetch(BASE + '/admin/cache/stats');
        const j = await r.json();
        const { application: app, redis } = j.data;

        // Stat cards
        const cards = [
          { label: 'Cache Hits', value: app.hits.toLocaleString(), cls: 'green' },
          { label: 'Cache Misses', value: app.misses.toLocaleString(), cls: '' },
          { label: 'Keys Written', value: app.sets.toLocaleString(), cls: '' },
          { label: 'Invalidations', value: app.invalidations.toLocaleString(), cls: 'yellow' },
          { label: 'Errors', value: app.errors.toLocaleString(), cls: app.errors > 0 ? 'red' : '' },
          { label: 'Redis Keys', value: (redis.total_keys ?? '—').toLocaleString(), cls: '' },
        ];
        document.getElementById('stat-cards').innerHTML = cards.map(c =>
          '<div class="card"><div class="card-label">' + c.label + '</div>' +
          '<div class="card-value ' + c.cls + '">' + c.value + '</div></div>'
        ).join('');

        // Hit rate bar
        const hitRate = app.hit_rate || 0;
        document.getElementById('hit-rate-label').textContent = hitRate.toFixed(1) + '%';
        document.getElementById('hit-rate-label').className = colorClass(hitRate);
        document.getElementById('hit-rate-bar').style.width = Math.min(hitRate, 100) + '%';

        // Redis info
        const redisRows = Object.entries(redis).map(([k, v]) =>
          '<tr><td style="color:#64748b">' + k + '</td><td>' + v + '</td></tr>'
        ).join('');
        document.getElementById('redis-table').querySelector('tbody').innerHTML = redisRows;

        document.getElementById('last-updated').textContent =
          'Updated ' + new Date().toLocaleTimeString();
      } catch (e) {
        console.error('Refresh failed:', e);
      }
    }

    async function clearCache() {
      if (!confirm('Clear all MemForge cache keys?')) return;
      try {
        const r = await fetch(BASE + '/admin/cache/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const j = await r.json();
        alert('Cleared ' + j.data.deleted + ' keys');
        refresh();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    refresh();
    setInterval(refresh, 15000);
  </script>
</body>
</html>`;
}

// ─── Global error handler ────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[memforge] unhandled error:', err);
  fail(res, 500, 'Internal server error');
});

// ─── Start ───────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[memforge] listening on port ${PORT}`);
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`[memforge] received ${signal}, shutting down…`);
  server.close(async () => {
    await Promise.all([closePool(), closeRedis()]);
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { app };
