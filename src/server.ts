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

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { MemoryManager } from './memory-manager.js';
import { closePool } from './db.js';
import {
  registry,
  httpRequestsTotal,
  httpRequestDurationSeconds,
} from './metrics.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3333', 10);

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
    version: '1.0.0',
    description:
      'Tiered agent memory service with hot/warm/cold PostgreSQL storage and full-text search.',
  },
  servers: [{ url: `http://localhost:${PORT}`, description: 'Local' }],
  tags: [
    { name: 'Memory', description: 'Agent memory operations' },
    { name: 'System', description: 'Health and observability' },
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
        summary: 'Full-text search warm tier',
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
        summary: 'Trigger hot→warm memory consolidation',
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
        summary: 'Get memory tier statistics for an agent',
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
 * Body: { content: string, metadata?: object }
 */
app.post('/memory/:agentId/add', async (req: Request, res: Response) => {
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
 */
app.get('/memory/:agentId/query', async (req: Request, res: Response) => {
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

  try {
    const results = await manager.query(agentId(req), q, limitNum);
    ok(res, results);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * POST /memory/:agentId/consolidate
 * Body: {} (no params required)
 */
app.post('/memory/:agentId/consolidate', async (req: Request, res: Response) => {
  try {
    const result = await manager.consolidate(agentId(req));
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
 */
app.get('/memory/:agentId/stats', async (req: Request, res: Response) => {
  try {
    const stats = await manager.stats(agentId(req));
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
    await closePool();
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { app };
