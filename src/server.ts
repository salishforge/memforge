// MemForge Standalone — Express REST API server
//
// Routes:
//   POST   /memory/:agentId/add
//   GET    /memory/:agentId/query?q=<text>[&limit=<n>][&mode=keyword|semantic|hybrid][&after=<iso>][&before=<iso>][&decay=<rate>]
//   POST   /memory/:agentId/consolidate
//   GET    /memory/:agentId/stats
//   GET    /memory/:agentId/timeline?[from=<iso>][&to=<iso>][&limit=<n>]
//   GET    /memory/:agentId/entities?[q=<text>][&type=<entityType>][&limit=<n>]
//   GET    /memory/:agentId/graph?entity=<name>[&depth=<n>]
//   POST   /memory/:agentId/reflect
//   GET    /memory/:agentId/reflections?[limit=<n>]
//   POST   /memory/:agentId/feedback
//   POST   /memory/:agentId/meta-reflect
//   POST   /memory/:agentId/dedup-entities
//   POST   /memory/:agentId/active-recall
//   GET    /health
//   GET    /metrics              (Prometheus)
//   GET    /api/spec.json        (OpenAPI 3.0)
//   GET    /api/docs             (Swagger UI)
//   GET    /admin/cache/stats    (admin — cache statistics)
//   POST   /admin/cache/clear   (admin — flush cache)
//   GET    /admin/cache/dashboard (admin — monitoring UI)

import crypto from 'crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { MemoryManager } from './memory-manager.js';
import { createEmbeddingProvider } from './embedding.js';
import { createLLMProvider } from './llm.js';
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
  timelineKey,
  getLocalStats,
  getRedisStats,
  closeRedis,
} from './cache.js';
import { buildOpenApiSpec } from './openapi.js';
import { cacheDashboardHtml } from './dashboard.js';
import { createDefaultRegistry } from './classifier.js';
import { wrapLLMProvider } from './llm-safety.js';
import { AuditChain } from './audit.js';
import { getPool } from './db.js';
import type { QueryMode, ConsolidationMode, FeedbackOutcome } from './types.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3333', 10);

// Simple shared secret for admin endpoints (optional — set ADMIN_TOKEN env var)
const ADMIN_TOKEN = process.env['ADMIN_TOKEN'] ?? '';

// Content classifier registry — runs on ingest and before LLM calls
const classifierRegistry = createDefaultRegistry();

const embeddingProvider = createEmbeddingProvider();

// LLM providers wrapped with safety controls:
//   - Pre-LLM content sanitization (classify + redact)
//   - Remote providers blocked by default (set ALLOW_REMOTE_LLM=true to override)
//   - Warning logged when content is sent to external LLM
const llmProviderType = process.env['LLM_PROVIDER'] ?? 'none';
const allowRemoteLLM = process.env['ALLOW_REMOTE_LLM'] === 'true';
const rawLlmProvider = createLLMProvider();
const llmProvider = wrapLLMProvider(rawLlmProvider, llmProviderType, classifierRegistry, allowRemoteLLM);

const revisionProviderType = process.env['REVISION_LLM_PROVIDER'] ?? llmProviderType;
const rawRevisionLlmProvider = process.env['REVISION_LLM_PROVIDER']
  ? createLLMProvider(process.env['REVISION_LLM_PROVIDER'] as 'anthropic' | 'openai' | 'ollama')
  : null;
const revisionLlmProvider = wrapLLMProvider(rawRevisionLlmProvider, revisionProviderType, classifierRegistry, allowRemoteLLM);

const auditChain = new AuditChain(getPool(process.env['DATABASE_URL'] || undefined), {
  hmacKey: process.env['AUDIT_HMAC_KEY'],
  retentionDays: parseInt(process.env['AUDIT_RETENTION_DAYS'] ?? '90', 10),
  archiveOnExpiry: process.env['AUDIT_ARCHIVE_ON_EXPIRY'] !== 'false',
});

const manager = new MemoryManager({
  databaseUrl: process.env['DATABASE_URL'],
  consolidationBatchSize: parseInt(process.env['CONSOLIDATION_BATCH_SIZE'] ?? '500', 10),
  consolidationThreshold: parseInt(process.env['CONSOLIDATION_THRESHOLD'] ?? '50', 10),
  autoRegisterAgents: process.env['AUTO_REGISTER_AGENTS'] !== 'false',
  embeddingProvider,
  llmProvider,
  revisionLlmProvider,
  consolidationMode: (process.env['CONSOLIDATION_MODE'] as ConsolidationMode) ?? 'concat',
  temporalDecayRate: parseFloat(process.env['TEMPORAL_DECAY_RATE'] ?? '0'),
  sleepCycle: {
    tokenBudget: parseInt(process.env['SLEEP_CYCLE_TOKEN_BUDGET'] ?? '100000', 10),
    evictionThreshold: parseFloat(process.env['SLEEP_CYCLE_EVICTION_THRESHOLD'] ?? '0.1'),
    revisionThreshold: parseFloat(process.env['SLEEP_CYCLE_REVISION_THRESHOLD'] ?? '0.4'),
    includeReflection: process.env['SLEEP_CYCLE_INCLUDE_REFLECTION'] !== 'false',
    weights: {
      recency: 0.25,
      frequency: 0.20,
      centrality: 0.20,
      reflection: 0.15,
      stability: 0.20,
    },
  },
  auditChain,
});

const app = express();
app.use(express.json());

// ─── Rate limiting ───────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10);
const RATE_LIMIT_MAX = parseInt(process.env['RATE_LIMIT_MAX'] ?? '100', 10);

if (RATE_LIMIT_MAX > 0) {
  app.use('/memory', rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests — try again later' },
  }));
}

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

const openApiSpec = buildOpenApiSpec(PORT);

// ─── Swagger UI HTML helper ───────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeJsString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\x3c');
}

function swaggerUiHtml(specUrl: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${escapeJsString(specUrl)}',
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
  if (!ADMIN_TOKEN) {
    next();
    return;
  }

  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    const provided = Buffer.from(auth.slice(7));
    const expected = Buffer.from(ADMIN_TOKEN);
    if (provided.length === expected.length &&
        crypto.timingSafeEqual(provided, expected)) {
      next();
      return;
    }
  }

  res.status(401).json({ ok: false, error: 'Admin token required' });
}

// ─── Admin routes ─────────────────────────────────────────────────────────────

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

app.get('/admin/cache/dashboard', adminAuth, (_req, res) => {
  res.type('html').send(cacheDashboardHtml());
});

// ─── Auth — all /memory routes require a valid Bearer token ──────────────────

app.use('/memory', bearerAuth);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
    embeddings: manager.embeddingsEnabled,
    summarization: manager.summarizationEnabled,
  });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});

app.get('/api/spec.json', (_req, res) => {
  res.json(openApiSpec);
});

app.get('/api/docs', (_req, res) => {
  res.type('html').send(swaggerUiHtml('/api/spec.json', 'MemForge API Docs'));
});

/**
 * POST /memory/:agentId/add
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

  // Classify and optionally redact content before storage
  const classification = classifierRegistry.classify(content);
  const storeContent = classification.wasRedacted ? classification.redactedContent : content;

  // Enrich metadata with classification results
  const enrichedMetadata: Record<string, unknown> = {
    ...(metadata ?? {}),
    ...(classification.sensitivity !== 'public' ? {
      _sensitivity: classification.sensitivity,
      _classified_types: classification.findings.map((f) => f.type),
    } : {}),
  };

  try {
    const result = await manager.add(getAgentId(req), storeContent, enrichedMetadata);
    void invalidateAgent(getAgentId(req));
    ok(res, {
      ...result,
      classification: {
        sensitivity: classification.sensitivity,
        findings_count: classification.findings.length,
        redacted: classification.wasRedacted,
      },
    });
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
 * GET /memory/:agentId/query?q=<text>[&limit=<n>][&mode=keyword|semantic|hybrid][&after=<iso>][&before=<iso>][&decay=<rate>]
 */
app.get('/memory/:agentId/query', requireScope('memforge:read'), async (req: Request, res: Response) => {
  const q = req.query['q'];
  const limit = req.query['limit'];
  const mode = req.query['mode'];
  const after = req.query['after'];
  const before = req.query['before'];
  const decay = req.query['decay'];

  if (!q || typeof q !== 'string') {
    fail(res, 400, '"q" query param (string) is required');
    return;
  }

  const limitNum = limit !== undefined ? parseInt(limit as string, 10) : 10;
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
    fail(res, 400, '"limit" must be an integer between 1 and 200');
    return;
  }

  if (mode && !['keyword', 'semantic', 'hybrid'].includes(mode as string)) {
    fail(res, 400, '"mode" must be one of: keyword, semantic, hybrid');
    return;
  }

  const afterDate = after ? new Date(after as string) : undefined;
  const beforeDate = before ? new Date(before as string) : undefined;
  if (afterDate && isNaN(afterDate.getTime())) {
    fail(res, 400, '"after" must be a valid ISO 8601 timestamp');
    return;
  }
  if (beforeDate && isNaN(beforeDate.getTime())) {
    fail(res, 400, '"before" must be a valid ISO 8601 timestamp');
    return;
  }

  const decayRate = decay !== undefined ? parseFloat(decay as string) : undefined;
  if (decayRate !== undefined && (isNaN(decayRate) || decayRate < 0)) {
    fail(res, 400, '"decay" must be a non-negative number');
    return;
  }

  let agentId: string;
  try {
    agentId = getAgentId(req);
  } catch (err) {
    fail(res, 400, (err as Error).message);
    return;
  }

  // Cache key includes all query parameters
  const cacheKeySuffix = `${mode ?? 'auto'}:${after ?? ''}:${before ?? ''}:${decay ?? ''}`;
  const key = searchKey(agentId, `${q}:${cacheKeySuffix}`, limitNum);
  const cached = await cacheGet(key);
  if (cached !== null) {
    res.setHeader('X-Cache', 'HIT');
    ok(res, cached);
    return;
  }

  res.setHeader('X-Cache', 'MISS');

  try {
    const results = await manager.query(agentId, {
      q,
      limit: limitNum,
      mode: mode as QueryMode | undefined,
      after: afterDate,
      before: beforeDate,
      decayRate,
    });
    void cacheSet(key, results, 'search');
    ok(res, results);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * GET /memory/:agentId/timeline?[from=<iso>][&to=<iso>][&limit=<n>]
 */
app.get('/memory/:agentId/timeline', requireScope('memforge:read'), async (req: Request, res: Response) => {
  const from = req.query['from'];
  const to = req.query['to'];
  const limit = req.query['limit'];

  const fromDate = from ? new Date(from as string) : undefined;
  const toDate = to ? new Date(to as string) : undefined;

  if (fromDate && isNaN(fromDate.getTime())) {
    fail(res, 400, '"from" must be a valid ISO 8601 timestamp');
    return;
  }
  if (toDate && isNaN(toDate.getTime())) {
    fail(res, 400, '"to" must be a valid ISO 8601 timestamp');
    return;
  }

  const limitNum = limit !== undefined ? parseInt(limit as string, 10) : 50;
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 500) {
    fail(res, 400, '"limit" must be an integer between 1 and 500');
    return;
  }

  let agentId: string;
  try {
    agentId = getAgentId(req);
  } catch (err) {
    fail(res, 400, (err as Error).message);
    return;
  }

  // Check cache
  const key = timelineKey(agentId, from as string | undefined, to as string | undefined, limitNum);
  const cached = await cacheGet(key);
  if (cached !== null) {
    res.setHeader('X-Cache', 'HIT');
    ok(res, cached);
    return;
  }

  res.setHeader('X-Cache', 'MISS');

  try {
    const entries = await manager.timeline(agentId, fromDate, toDate, limitNum);
    void cacheSet(key, entries, 'search');
    ok(res, entries);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * GET /memory/:agentId/entities?[q=<text>][&type=<entityType>][&limit=<n>]
 */
app.get('/memory/:agentId/entities', requireScope('memforge:read'), async (req: Request, res: Response) => {
  const q = req.query['q'] as string | undefined;
  const type = req.query['type'] as string | undefined;
  const limit = req.query['limit'];

  const limitNum = limit !== undefined ? parseInt(limit as string, 10) : 20;
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
    fail(res, 400, '"limit" must be an integer between 1 and 200');
    return;
  }

  try {
    const entities = await manager.searchEntities(getAgentId(req), q, type, limitNum);
    ok(res, entities);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * GET /memory/:agentId/graph?entity=<name>[&depth=<n>]
 */
app.get('/memory/:agentId/graph', requireScope('memforge:read'), async (req: Request, res: Response) => {
  const entity = req.query['entity'];
  const depth = req.query['depth'];

  if (!entity || typeof entity !== 'string') {
    fail(res, 400, '"entity" query param (string) is required');
    return;
  }

  const depthNum = depth !== undefined ? parseInt(depth as string, 10) : 2;
  if (isNaN(depthNum) || depthNum < 1 || depthNum > 5) {
    fail(res, 400, '"depth" must be an integer between 1 and 5');
    return;
  }

  try {
    const graph = await manager.graphTraverse(getAgentId(req), entity, depthNum);
    ok(res, graph);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * POST /memory/:agentId/reflect
 * Body: { trigger?: "manual" | "threshold" | "scheduled", limit?: number }
 */
app.post('/memory/:agentId/reflect', requireScope('memforge:write'), async (req: Request, res: Response) => {
  const { trigger, limit } = (req.body ?? {}) as { trigger?: string; limit?: number };

  if (trigger && !['manual', 'threshold', 'scheduled'].includes(trigger)) {
    fail(res, 400, '"trigger" must be one of: manual, threshold, scheduled');
    return;
  }

  const limitNum = limit ?? 20;
  if (typeof limitNum !== 'number' || limitNum < 1 || limitNum > 100) {
    fail(res, 400, '"limit" must be an integer between 1 and 100');
    return;
  }

  try {
    const result = await manager.reflect(getAgentId(req), (trigger as 'manual' | 'threshold' | 'scheduled') ?? 'manual', limitNum);
    void invalidateAgent(getAgentId(req));
    ok(res, result);
  } catch (err) {
    const e = err as Error;
    if (e.message.includes('No warm-tier') || e.message.includes('requires an LLM')) {
      fail(res, 400, e.message);
    } else {
      fail(res, 500, e.message);
    }
  }
});

/**
 * GET /memory/:agentId/reflections?[limit=<n>]
 */
app.get('/memory/:agentId/reflections', requireScope('memforge:read'), async (req: Request, res: Response) => {
  const limit = req.query['limit'];
  const limitNum = limit !== undefined ? parseInt(limit as string, 10) : 10;

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    fail(res, 400, '"limit" must be an integer between 1 and 100');
    return;
  }

  try {
    const reflections = await manager.getReflections(getAgentId(req), limitNum);
    ok(res, reflections);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * POST /memory/:agentId/clear
 * Archives all hot + warm memory to cold tier.
 */
app.post('/memory/:agentId/clear', requireScope('memforge:write'), async (req: Request, res: Response) => {
  try {
    const result = await manager.clear(getAgentId(req));
    void invalidateAgent(getAgentId(req));
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
 * POST /memory/:agentId/consolidate
 * Body: { mode?: "concat" | "summarize" }
 */
app.post('/memory/:agentId/consolidate', requireScope('memforge:write'), async (req: Request, res: Response) => {
  const { mode } = (req.body ?? {}) as { mode?: string };

  if (mode && mode !== 'concat' && mode !== 'summarize') {
    fail(res, 400, '"mode" must be one of: concat, summarize');
    return;
  }

  try {
    const result = await manager.consolidate(getAgentId(req), mode as ConsolidationMode | undefined);
    void invalidateAgent(getAgentId(req));
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
app.get('/memory/:agentId/stats', requireScope('memforge:read'), async (req: Request, res: Response) => {
  let agentId: string;
  try {
    agentId = getAgentId(req);
  } catch (err) {
    fail(res, 400, (err as Error).message);
    return;
  }

  const key = statsKey(agentId);
  const cached = await cacheGet(key);
  if (cached !== null) {
    res.setHeader('X-Cache', 'HIT');
    ok(res, cached);
    return;
  }

  res.setHeader('X-Cache', 'MISS');

  try {
    const stats = await manager.stats(agentId);
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

/**
 * GET /memory/:agentId/procedures?[q=<text>][&limit=<n>]
 */
app.get('/memory/:agentId/procedures', requireScope('memforge:read'), async (req: Request, res: Response) => {
  const q = req.query['q'] as string | undefined;
  const limit = req.query['limit'];

  const limitNum = limit !== undefined ? parseInt(limit as string, 10) : 20;
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    fail(res, 400, '"limit" must be an integer between 1 and 100');
    return;
  }

  try {
    const procedures = await manager.getProcedures(getAgentId(req), q, limitNum);
    ok(res, procedures);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * POST /memory/:agentId/sleep
 * Body: { tokenBudget?, evictionThreshold?, revisionThreshold?, includeReflection? }
 */
app.post('/memory/:agentId/sleep', requireScope('memforge:write'), async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  try {
    const result = await manager.sleep(getAgentId(req), {
      tokenBudget: typeof body['tokenBudget'] === 'number' ? body['tokenBudget'] : undefined,
      evictionThreshold: typeof body['evictionThreshold'] === 'number' ? body['evictionThreshold'] : undefined,
      revisionThreshold: typeof body['revisionThreshold'] === 'number' ? body['revisionThreshold'] : undefined,
      includeReflection: typeof body['includeReflection'] === 'boolean' ? body['includeReflection'] : undefined,
    });
    void invalidateAgent(getAgentId(req));
    ok(res, result);
  } catch (err) {
    const e = err as Error;
    if (e instanceof TypeError || e.message.includes('requires an LLM')) {
      fail(res, 400, e.message);
    } else {
      fail(res, 500, e.message);
    }
  }
});

/**
 * GET /memory/:agentId/health
 */
app.get('/memory/:agentId/health', requireScope('memforge:read'), async (req: Request, res: Response) => {
  try {
    const health = await manager.health(getAgentId(req));
    ok(res, health);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * POST /memory/:agentId/feedback
 * Body: { retrieval_ids: bigint[], outcome: "positive"|"negative"|"neutral", metadata?: object }
 */
app.post('/memory/:agentId/feedback', requireScope('memforge:write'), async (req: Request, res: Response) => {
  const { retrieval_ids, outcome, metadata } = req.body as {
    retrieval_ids?: unknown[];
    outcome?: string;
    metadata?: Record<string, unknown>;
  };

  if (!Array.isArray(retrieval_ids) || retrieval_ids.length === 0) {
    fail(res, 400, '"retrieval_ids" (non-empty array) is required');
    return;
  }
  if (!outcome || !['positive', 'negative', 'neutral'].includes(outcome)) {
    fail(res, 400, '"outcome" must be one of: positive, negative, neutral');
    return;
  }

  try {
    const result = await manager.feedback(
      getAgentId(req),
      retrieval_ids as bigint[],
      outcome as FeedbackOutcome,
      metadata ?? {},
    );
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
 * POST /memory/:agentId/meta-reflect
 * Body: { limit?: number }
 */
app.post('/memory/:agentId/meta-reflect', requireScope('memforge:write'), async (req: Request, res: Response) => {
  const { limit } = (req.body ?? {}) as { limit?: number };
  const limitNum = limit ?? 10;

  if (typeof limitNum !== 'number' || limitNum < 3 || limitNum > 50) {
    fail(res, 400, '"limit" must be an integer between 3 and 50');
    return;
  }

  try {
    const result = await manager.metaReflect(getAgentId(req), limitNum);
    void invalidateAgent(getAgentId(req));
    ok(res, result);
  } catch (err) {
    const e = err as Error;
    if (e.message.includes('Need at least') || e.message.includes('requires an LLM')) {
      fail(res, 400, e.message);
    } else {
      fail(res, 500, e.message);
    }
  }
});

/**
 * POST /memory/:agentId/dedup-entities
 * Body: { threshold?: number }
 */
app.post('/memory/:agentId/dedup-entities', requireScope('memforge:write'), async (req: Request, res: Response) => {
  const { threshold } = (req.body ?? {}) as { threshold?: number };
  const thresholdNum = threshold ?? 0.7;

  if (typeof thresholdNum !== 'number' || thresholdNum < 0.3 || thresholdNum > 1.0) {
    fail(res, 400, '"threshold" must be a number between 0.3 and 1.0');
    return;
  }

  try {
    const merged = await manager.deduplicateEntities(getAgentId(req), thresholdNum);
    void invalidateAgent(getAgentId(req));
    ok(res, { agent_id: getAgentId(req), entities_merged: merged, threshold: thresholdNum });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * POST /memory/:agentId/active-recall
 * Body: { context: string, limit?: number }
 */
app.post('/memory/:agentId/active-recall', requireScope('memforge:read'), async (req: Request, res: Response) => {
  const { context, limit } = req.body as { context?: string; limit?: number };

  if (!context || typeof context !== 'string') {
    fail(res, 400, '"context" (string) is required — describe what the agent is about to do');
    return;
  }

  const limitNum = limit ?? 5;
  if (typeof limitNum !== 'number' || limitNum < 1 || limitNum > 20) {
    fail(res, 400, '"limit" must be an integer between 1 and 20');
    return;
  }

  try {
    const result = await manager.activeRecall(getAgentId(req), context, limitNum);
    ok(res, result);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * GET /memory/:agentId/verify
 * Verify integrity of all audit chains for an agent.
 */
app.get('/memory/:agentId/verify', requireScope('memforge:read'), async (req: Request, res: Response) => {
  try {
    const result = await auditChain.verifyAgent(getAgentId(req));
    ok(res, result);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * GET /memory/:agentId/audit/:targetTable/:targetId
 * Get temporal history of a specific memory/entity.
 */
app.get('/memory/:agentId/audit/:targetTable/:targetId', requireScope('memforge:read'), async (req: Request, res: Response) => {
  const targetTable = req.params['targetTable'] ?? '';
  const targetId = req.params['targetId'] ?? '';

  if (!['warm_tier', 'entities', 'relationships', 'reflections', 'procedures'].includes(targetTable)) {
    fail(res, 400, '"targetTable" must be one of: warm_tier, entities, relationships, reflections, procedures');
    return;
  }

  try {
    const history = await auditChain.history(getAgentId(req), targetTable, BigInt(targetId));
    ok(res, history);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

/**
 * GET /memory/:agentId/audit/:targetTable/:targetId/at?t=<iso>
 * Get the state of a memory at a specific point in time.
 */
app.get('/memory/:agentId/audit/:targetTable/:targetId/at', requireScope('memforge:read'), async (req: Request, res: Response) => {
  const targetTable = req.params['targetTable'] ?? '';
  const targetId = req.params['targetId'] ?? '';
  const t = req.query['t'] as string | undefined;

  if (!t) {
    fail(res, 400, '"t" query param (ISO 8601 timestamp) is required');
    return;
  }

  const asOf = new Date(t);
  if (isNaN(asOf.getTime())) {
    fail(res, 400, '"t" must be a valid ISO 8601 timestamp');
    return;
  }

  try {
    const state = await auditChain.stateAt(getAgentId(req), targetTable, BigInt(targetId), asOf);
    ok(res, state);
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AGENT_ID_PATTERN = /^[\w.@:=-]{1,256}$/;

function getAgentId(req: Request): string {
  const id = req.params['agentId'] ?? '';
  if (!AGENT_ID_PATTERN.test(id)) {
    throw new TypeError('agentId must be 1-256 characters of [a-zA-Z0-9_.@:=-]');
  }
  return id;
}

function ok(res: Response, data: unknown): void {
  res.json({ ok: true, data });
}

function fail(res: Response, status: number, message: string): void {
  // Sanitize 500 errors — never expose internal details to clients
  const safeMessage = status >= 500
    ? 'Internal server error'
    : message;
  if (status >= 500) {
    console.error(`[memforge] ${status}:`, message);
  }
  res.status(status).json({ ok: false, error: safeMessage });
}

// ─── Global error handler ────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[memforge] unhandled error:', err);
  fail(res, 500, 'Internal server error');
});

// ─── Start ───────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[memforge] listening on port ${PORT}`);
  console.log(`[memforge] embeddings: ${manager.embeddingsEnabled ? 'enabled' : 'disabled'}`);
  console.log(`[memforge] summarization: ${manager.summarizationEnabled ? 'enabled' : 'disabled'}`);
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`[memforge] received ${signal}, shutting down…`);
  server.close(async () => {
    await Promise.all([closePool(), closeRedis()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { app };
