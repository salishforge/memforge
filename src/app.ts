// MemForge — Express app factory
//
// Extracted from server.ts to allow HTTP-level testing without side effects.
// Tests call createApp() with mock dependencies; server.ts calls it with real ones.

import crypto from 'crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import type { MemoryManager } from './memory-manager.js';
import type { AuditChain } from './audit.js';
import type { ClassifierRegistry } from './classifier.js';
import type { QueryMode, ConsolidationMode, FeedbackOutcome } from './types.js';
import { getLogger, requestIdMiddleware, requestLogMiddleware } from './logger.js';
import {
  registry,
  httpRequestsTotal,
  httpRequestDurationSeconds,
} from './metrics.js';
import { bearerAuth, requireScope } from './auth.js';
import { NamespaceSchema, AddMemorySchema, ConsolidateSchema, SleepSchema, ColdTierSearchSchema, ColdTierRestoreSchema } from './schemas.js';
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
} from './cache.js';
import { buildOpenApiSpec } from './openapi.js';
import { cacheDashboardHtml } from './dashboard.js';

// ─── Request input helpers ──────────────────────────────────────────────────
//
// Express 5 types req.query values as string | ParsedQs | (string | ParsedQs)[] |
// undefined, and req.params values as string | string[]. These helpers narrow
// to the scalar shape each route expects and return undefined for anything
// else, so routes never silently act on arrays or nested objects.

function qstr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function qnum(v: unknown): number | undefined {
  const s = qstr(v);
  if (s === undefined) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

function pstr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

// ─── Public interface ───────────────────────────────────────────────────────

export interface AppDependencies {
  manager: MemoryManager;
  auditChain: AuditChain | null;
  classifierRegistry: ClassifierRegistry;
  adminToken?: string;
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
  port?: number;
  corsOrigin?: string;
  corsMethods?: string;
  corsHeaders?: string;
}

export function createApp(deps: AppDependencies): express.Express {
  const {
    manager,
    auditChain,
    classifierRegistry,
    adminToken = '',
    rateLimitWindowMs = 60_000,
    rateLimitMax = 100,
    port = 3333,
    corsOrigin,
    corsMethods,
    corsHeaders,
  } = deps;

  const log = getLogger('app');

  const app = express();
  app.use(express.json({ limit: '100kb' }));

  // Security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(requestIdMiddleware);
  app.use(requestLogMiddleware);

  // ─── CORS ───────────────────────────────────────────────────────────────

  if (corsOrigin) {
    if (corsOrigin === '*') {
      log.warn('CORS_ORIGIN=* allows all origins — restrict to specific origins in production');
    }
    // Support comma-separated allow-list: "https://a.com,https://b.com"
    const allowedOrigins = corsOrigin === '*' ? null : new Set(corsOrigin.split(',').map((o) => o.trim()));

    app.use((req: Request, res: Response, next: NextFunction) => {
      const requestOrigin = req.headers['origin'];
      const effectiveOrigin = allowedOrigins === null
        ? '*'
        : (requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : '');

      if (effectiveOrigin) {
        res.header('Access-Control-Allow-Origin', effectiveOrigin);
        res.header('Access-Control-Allow-Methods', corsMethods ?? 'GET,POST,OPTIONS');
        res.header('Access-Control-Allow-Headers', corsHeaders ?? 'Content-Type,Authorization');
        if (allowedOrigins !== null) res.header('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
      next();
    });
  }

  // ─── Rate limiting ──────────────────────────────────────────────────────

  if (rateLimitMax > 0) {
    // Global rate limit — covers all routes including admin, api docs, etc.
    app.use(rateLimit({
      windowMs: rateLimitWindowMs,
      max: rateLimitMax * 5,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { ok: false, error: 'Too many requests' },
      skip: (req) => req.path === '/health',
    }));

    app.use('/memory', rateLimit({
      windowMs: rateLimitWindowMs,
      max: rateLimitMax,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { ok: false, error: 'Too many requests — try again later' },
    }));
  }

  // ─── Request metrics middleware ─────────────────────────────────────────

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const route = (req.route?.path as string | undefined) ?? 'unmatched';
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

  const openApiSpec = buildOpenApiSpec(port);

  // Swagger UI removed — supply chain risk from loading JS via unpkg.com CDN.
  // The OpenAPI spec at /api/spec.json can be used with any OpenAPI viewer
  // (Swagger Editor, Postman, etc.) without external CDN dependencies.

  // ─── Admin middleware ───────────────────────────────────────────────────

  function adminAuth(req: Request, res: Response, next: NextFunction): void {
    if (!adminToken) {
      res.status(403).json({ ok: false, error: 'Admin endpoints disabled — set ADMIN_TOKEN to enable' });
      return;
    }

    const auth = req.headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) {
      const provided = Buffer.from(auth.slice(7));
      const expected = Buffer.from(adminToken);
      if (provided.length === expected.length &&
          crypto.timingSafeEqual(provided, expected)) {
        next();
        return;
      }
    }

    res.status(401).json({ ok: false, error: 'Admin token required' });
  }

  // ─── Admin routes ──────────────────────────────────────────────────────

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

  // ─── Auth — all /memory and /pool routes require a valid Bearer token ───

  app.use('/memory', bearerAuth);
  app.use('/pool', bearerAuth);

  // ─── Routes ────────────────────────────────────────────────────────────

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  app.get('/metrics', adminAuth, async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });

  app.get('/api/spec.json', (_req, res) => {
    res.json(openApiSpec);
  });

  app.get('/api/docs', (_req, res) => {
    res.redirect('/api/spec.json');
  });

  /**
   * POST /memory/:agentId/add
   */
  app.post('/memory/:agentId/add', requireScope('memforge:write'), async (req: Request, res: Response) => {
    const parsed = AddMemorySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const msg = parsed.error.issues[0];
      fail(res, 400, msg?.path[0] === 'namespace' ? `Invalid namespace: ${msg.message}` : `"content" (string) is required`);
      return;
    }
    const { content, metadata, outcome_type, hints, namespace } = parsed.data;

    if (!content || typeof content !== 'string') {
      fail(res, 400, '"content" (string) is required');
      return;
    }

    // Validate outcome_type if provided
    const VALID_OUTCOMES = ['error', 'success', 'decision', 'observation', 'neutral'];
    const resolvedOutcome = outcome_type ?? 'neutral';
    if (!VALID_OUTCOMES.includes(resolvedOutcome)) {
      fail(res, 400, '"outcome_type" must be one of: error, success, decision, observation, neutral');
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
      const result = await manager.add(getAgentId(req), storeContent, enrichedMetadata, resolvedOutcome as 'error' | 'success' | 'decision' | 'observation' | 'neutral', hints as import('./types.js').MemoryHints | undefined, namespace);
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
    const q = qstr(req.query['q']);
    const limit = qstr(req.query['limit']);
    const mode = qstr(req.query['mode']);
    const after = qstr(req.query['after']);
    const before = qstr(req.query['before']);
    const decay = qstr(req.query['decay']);
    const maxTokens = qstr(req.query['max_tokens']);
    const rawNamespace = qstr(req.query['namespace']);

    if (!q) {
      fail(res, 400, '"q" query param (string) is required');
      return;
    }

    const limitNum = limit !== undefined ? parseInt(limit, 10) : 10;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
      fail(res, 400, '"limit" must be an integer between 1 and 200');
      return;
    }

    if (mode && !['keyword', 'semantic', 'hybrid', 'code'].includes(mode)) {
      fail(res, 400, '"mode" must be one of: keyword, semantic, hybrid, code');
      return;
    }

    const afterDate = after ? new Date(after) : undefined;
    const beforeDate = before ? new Date(before) : undefined;
    if (afterDate && isNaN(afterDate.getTime())) {
      fail(res, 400, '"after" must be a valid ISO 8601 timestamp');
      return;
    }
    if (beforeDate && isNaN(beforeDate.getTime())) {
      fail(res, 400, '"before" must be a valid ISO 8601 timestamp');
      return;
    }

    const decayRate = decay !== undefined ? parseFloat(decay) : undefined;
    if (decayRate !== undefined && (isNaN(decayRate) || decayRate < 0)) {
      fail(res, 400, '"decay" must be a non-negative number');
      return;
    }

    const maxTokensNum = maxTokens !== undefined ? parseInt(maxTokens, 10) : undefined;
    if (maxTokensNum !== undefined && (isNaN(maxTokensNum) || maxTokensNum < 1)) {
      fail(res, 400, '"max_tokens" must be a positive integer');
      return;
    }

    let namespace: string | undefined;
    if (rawNamespace !== undefined) {
      const nsResult = NamespaceSchema.safeParse(rawNamespace);
      if (!nsResult.success) {
        fail(res, 400, `Invalid namespace: ${nsResult.error.issues[0]?.message ?? 'validation failed'}`);
        return;
      }
      namespace = nsResult.data;
    }

    let agentId: string;
    try {
      agentId = getAgentId(req);
    } catch (err) {
      fail(res, 400, (err as Error).message);
      return;
    }

    // Cache key includes all query parameters (including max_tokens to prevent budget mismatch)
    const cacheKeySuffix = `${mode ?? 'auto'}:${after ?? ''}:${before ?? ''}:${decay ?? ''}:${maxTokensNum ?? ''}:${namespace ?? ''}`;
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
        maxTokens: maxTokensNum,
        namespace,
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
    const from = qstr(req.query['from']);
    const to = qstr(req.query['to']);
    const limit = qstr(req.query['limit']);
    const rawNamespace = qstr(req.query['namespace']);

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    if (fromDate && isNaN(fromDate.getTime())) {
      fail(res, 400, '"from" must be a valid ISO 8601 timestamp');
      return;
    }
    if (toDate && isNaN(toDate.getTime())) {
      fail(res, 400, '"to" must be a valid ISO 8601 timestamp');
      return;
    }

    const limitNum = limit !== undefined ? parseInt(limit, 10) : 50;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 500) {
      fail(res, 400, '"limit" must be an integer between 1 and 500');
      return;
    }

    let namespace: string | undefined;
    if (rawNamespace !== undefined) {
      const nsResult = NamespaceSchema.safeParse(rawNamespace);
      if (!nsResult.success) {
        fail(res, 400, `Invalid namespace: ${nsResult.error.issues[0]?.message ?? 'validation failed'}`);
        return;
      }
      namespace = nsResult.data;
    }

    let agentId: string;
    try {
      agentId = getAgentId(req);
    } catch (err) {
      fail(res, 400, (err as Error).message);
      return;
    }

    // Check cache
    const key = timelineKey(agentId, from, to, limitNum) + (namespace ? `:${namespace}` : '');
    const cached = await cacheGet(key);
    if (cached !== null) {
      res.setHeader('X-Cache', 'HIT');
      ok(res, cached);
      return;
    }

    res.setHeader('X-Cache', 'MISS');

    try {
      const entries = await manager.timeline(agentId, fromDate, toDate, limitNum, namespace);
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
    const q = qstr(req.query['q']);
    const type = qstr(req.query['type']);
    const limit = qstr(req.query['limit']);

    const limitNum = limit !== undefined ? parseInt(limit, 10) : 20;
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
    const entity = qstr(req.query['entity']);
    const depth = qstr(req.query['depth']);

    if (!entity) {
      fail(res, 400, '"entity" query param (string) is required');
      return;
    }

    const depthNum = depth !== undefined ? parseInt(depth, 10) : 2;
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
    const limit = qstr(req.query['limit']);
    const limitNum = limit !== undefined ? parseInt(limit, 10) : 10;

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
    const parsed = ConsolidateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail(res, 400, issue?.path[0] === 'namespace'
        ? `Invalid namespace: ${issue.message}`
        : '"mode" must be one of: concat, summarize');
      return;
    }
    const { mode, namespace } = parsed.data;

    try {
      const result = await manager.consolidate(getAgentId(req), mode as ConsolidationMode | undefined, namespace ? { namespace } : undefined);
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
    const rawNamespace = qstr(req.query['namespace']);
    let namespace: string | undefined;
    if (rawNamespace !== undefined) {
      const nsResult = NamespaceSchema.safeParse(rawNamespace);
      if (!nsResult.success) {
        fail(res, 400, `Invalid namespace: ${nsResult.error.issues[0]?.message ?? 'validation failed'}`);
        return;
      }
      namespace = nsResult.data;
    }

    let agentId: string;
    try {
      agentId = getAgentId(req);
    } catch (err) {
      fail(res, 400, (err as Error).message);
      return;
    }

    const key = statsKey(agentId) + (namespace ? `:${namespace}` : '');
    const cached = await cacheGet(key);
    if (cached !== null) {
      res.setHeader('X-Cache', 'HIT');
      ok(res, cached);
      return;
    }

    res.setHeader('X-Cache', 'MISS');

    try {
      const stats = await manager.stats(agentId, namespace);
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
    const q = qstr(req.query['q']);
    const limit = qstr(req.query['limit']);

    const limitNum = limit !== undefined ? parseInt(limit, 10) : 20;
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
    const parsed = SleepSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail(res, 400, issue?.message ?? 'Invalid request body');
      return;
    }
    const { tokenBudget, evictionThreshold, revisionThreshold, includeReflection } = parsed.data;

    try {
      const result = await manager.sleep(getAgentId(req), {
        tokenBudget,
        evictionThreshold,
        revisionThreshold,
        includeReflection,
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
   * GET /memory/:agentId/sleep/advisory
   *
   * Returns a structured sleep-cycle recommendation for external orchestrators.
   * Advisory only — MemForge has no built-in scheduler.
   */
  app.get('/memory/:agentId/sleep/advisory', requireScope('memforge:read'), async (req: Request, res: Response) => {
    try {
      const advisory = await manager.sleepAdvisory(getAgentId(req));
      ok(res, advisory);
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
   * GET /memory/:agentId/resume?[limit=<n>]
   * Generate context-injection prompt for agent session resumption.
   */
  app.get('/memory/:agentId/resume', requireScope('memforge:read'), async (req: Request, res: Response) => {
    const limit = qstr(req.query['limit']);
    const rawNamespace = qstr(req.query['namespace']);
    const limitNum = limit !== undefined ? parseInt(limit, 10) : 5;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 20) {
      fail(res, 400, '"limit" must be an integer between 1 and 20');
      return;
    }

    let namespace: string | undefined;
    if (rawNamespace !== undefined) {
      const nsResult = NamespaceSchema.safeParse(rawNamespace);
      if (!nsResult.success) {
        fail(res, 400, `Invalid namespace: ${nsResult.error.issues[0]?.message ?? 'validation failed'}`);
        return;
      }
      namespace = nsResult.data;
    }

    try {
      const context = await manager.resume(getAgentId(req), limitNum, namespace);
      ok(res, context);
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
   * GET /memory/:agentId/export
   * Export agent's full memory as JSONL.
   */
  app.get('/memory/:agentId/export', requireScope('memforge:read'), async (req: Request, res: Response) => {
    const rawNamespace = qstr(req.query['namespace']);
    let namespace: string | undefined;
    if (rawNamespace !== undefined) {
      const nsResult = NamespaceSchema.safeParse(rawNamespace);
      if (!nsResult.success) {
        fail(res, 400, `Invalid namespace: ${nsResult.error.issues[0]?.message ?? 'validation failed'}`);
        return;
      }
      namespace = nsResult.data;
    }

    try {
      const lines = await manager.exportMemory(getAgentId(req), namespace);
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Content-Disposition', `attachment; filename="${getAgentId(req)}-memory.jsonl"`);
      res.send(lines.join('\n') + '\n');
    } catch (err) {
      fail(res, 500, (err as Error).message);
    }
  });

  /**
   * POST /memory/:agentId/import
   * Import JSONL into agent's memory.
   * Body: JSONL text (one JSON object per line)
   */
  app.post('/memory/:agentId/import', requireScope('memforge:write'), async (req: Request, res: Response) => {
    const body = req.body as { lines?: string[]; namespace?: string } | string;
    let lines: string[];
    let bodyNamespace: string | undefined;

    if (typeof body === 'string') {
      lines = body.split('\n').filter((l) => l.trim());
    } else if (Array.isArray(body.lines)) {
      lines = body.lines;
      if (body.namespace !== undefined) {
        const nsResult = NamespaceSchema.safeParse(body.namespace);
        if (!nsResult.success) {
          fail(res, 400, `Invalid namespace: ${nsResult.error.issues[0]?.message ?? 'validation failed'}`);
          return;
        }
        bodyNamespace = nsResult.data;
      }
    } else {
      fail(res, 400, 'Body must be { "lines": [...] } or raw JSONL text');
      return;
    }

    // For each record that doesn't carry its own namespace, inject the body-level fallback.
    const enrichedLines = bodyNamespace
      ? lines.map((line) => {
          try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            if (!obj['namespace']) obj['namespace'] = bodyNamespace;
            return JSON.stringify(obj);
          } catch {
            return line;
          }
        })
      : lines;

    try {
      const result = await manager.importMemory(getAgentId(req), enrichedLines);
      void invalidateAgent(getAgentId(req));
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
    if (!auditChain) {
      fail(res, 400, 'Audit chain not configured');
      return;
    }
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
    if (!auditChain) {
      fail(res, 400, 'Audit chain not configured');
      return;
    }
    const targetTable = pstr(req.params['targetTable']);
    const targetId = pstr(req.params['targetId']);

    if (!['warm_tier', 'entities', 'relationships', 'reflections', 'procedures'].includes(targetTable)) {
      fail(res, 400, '"targetTable" must be one of: warm_tier, entities, relationships, reflections, procedures');
      return;
    }
    if (!/^\d+$/.test(targetId)) {
      fail(res, 400, '"targetId" must be a numeric ID');
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
    if (!auditChain) {
      fail(res, 400, 'Audit chain not configured');
      return;
    }
    const targetTable = pstr(req.params['targetTable']);
    const targetId = pstr(req.params['targetId']);
    const t = qstr(req.query['t']);

    if (!/^\d+$/.test(targetId)) {
      fail(res, 400, '"targetId" must be a numeric ID');
      return;
    }
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

  /**
   * GET /memory/:agentId/cold
   * Query params: q?, namespace?, from?, to?, source_table?, limit?, offset?
   */
  app.get('/memory/:agentId/cold', requireScope('memforge:read'), async (req: Request, res: Response) => {
    const parsed = ColdTierSearchSchema.safeParse({
      q: req.query['q'],
      namespace: req.query['namespace'],
      from: req.query['from'],
      to: req.query['to'],
      source_table: req.query['source_table'],
      limit: req.query['limit'],
      offset: req.query['offset'],
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail(res, 400, issue?.message ?? 'Invalid query parameters');
      return;
    }

    const { q, namespace, from, to, source_table, limit, offset } = parsed.data;

    let agentId: string;
    try {
      agentId = getAgentId(req);
    } catch (err) {
      fail(res, 400, (err as Error).message);
      return;
    }

    try {
      const result = await manager.searchColdTier(agentId, {
        q,
        namespace,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        sourceTable: source_table,
        limit,
        offset,
      });
      ok(res, result);
    } catch (err) {
      fail(res, 500, (err as Error).message);
    }
  });

  /**
   * POST /memory/:agentId/restore
   * Body: { cold_id: string|number, namespace?: string }
   */
  app.post('/memory/:agentId/restore', requireScope('memforge:write'), async (req: Request, res: Response) => {
    const parsed = ColdTierRestoreSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail(res, 400, issue?.message ?? 'Invalid request body');
      return;
    }

    const { cold_id, namespace } = parsed.data;

    let agentId: string;
    try {
      agentId = getAgentId(req);
    } catch (err) {
      fail(res, 400, (err as Error).message);
      return;
    }

    try {
      const result = await manager.restoreColdTier(agentId, BigInt(cold_id), namespace ? { namespace } : {});
      void invalidateAgent(agentId);
      ok(res, result);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'NOT_FOUND') {
        fail(res, 404, e.message);
      } else {
        fail(res, 500, e.message);
      }
    }
  });

  // ─── Helpers ──────────────────────────────────────────────────────────

  const AGENT_ID_PATTERN = /^[\w.@:=-]{1,256}$/;

  function getAgentId(req: Request): string {
    const id = pstr(req.params['agentId']);
    if (!AGENT_ID_PATTERN.test(id)) {
      throw new TypeError('agentId must be 1-256 characters of [a-zA-Z0-9_.@:=-]');
    }
    return id;
  }

  function ok(res: Response, data: unknown): void {
    res.json({ ok: true, data });
  }

  function fail(res: Response, status: number, message: string): void {
    const safeMessage = status >= 500
      ? 'Internal server error'
      : message;
    if (status >= 500) {
      log.error({ status, message }, 'request error');
    }
    res.status(status).json({ ok: false, error: safeMessage });
  }

  // ─── Shared Pool Routes ─────────────────────────────────────────────────

  // Pool routes use adminAuth for creation, agentId-scoped auth for member operations.
  // agent_id is always derived from the authenticated route param, not the request body (prevents impersonation).

  app.post('/pool', adminAuth, async (req: Request, res: Response) => {
    const { id, name, pool_type, description } = req.body as { id?: string; name?: string; pool_type?: string; description?: string };
    if (!id || !name) { fail(res, 400, '"id" and "name" are required'); return; }
    if (pool_type && !['team', 'global'].includes(pool_type)) {
      fail(res, 400, '"pool_type" must be "team" or "global"'); return;
    }
    try {
      await manager.createPool(id, name, (pool_type as 'team' | 'global') ?? 'team', description);
      ok(res, { id, name, pool_type: pool_type ?? 'team' });
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.post('/pool/:poolId/join/:agentId', requireScope('memforge:write'), async (req: Request, res: Response) => {
    try {
      const agentId = getAgentId(req);
      await manager.joinPool(agentId, pstr(req.params['poolId']));
      ok(res, { agent_id: agentId, pool_id: pstr(req.params['poolId']) });
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.delete('/pool/:poolId/leave/:agentId', requireScope('memforge:write'), async (req: Request, res: Response) => {
    try {
      const agentId = getAgentId(req);
      await manager.leavePool(agentId, pstr(req.params['poolId']));
      ok(res, { removed: true });
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.get('/pool/:poolId/members', requireScope('memforge:read'), async (req: Request, res: Response) => {
    try {
      const members = await manager.getPoolMembers(pstr(req.params['poolId']));
      ok(res, members);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.post('/pool/:poolId/publish/:agentId', requireScope('memforge:write'), async (req: Request, res: Response) => {
    const { memory_ids } = req.body as { memory_ids?: unknown[] };
    if (!Array.isArray(memory_ids) || memory_ids.length === 0) {
      fail(res, 400, '"memory_ids" (non-empty array) is required'); return;
    }
    if (memory_ids.length > 100) {
      fail(res, 400, '"memory_ids" cannot exceed 100 items per request'); return;
    }
    if (!memory_ids.every((id) => typeof id === 'number' || typeof id === 'string')) {
      fail(res, 400, '"memory_ids" must contain numeric IDs'); return;
    }
    try {
      const agentId = getAgentId(req);
      const result = await manager.publish(agentId, pstr(req.params['poolId']), memory_ids as unknown as bigint[]);
      ok(res, result);
    } catch (err) {
      const e = err as Error;
      if (e.message.includes('not a member')) { fail(res, 403, e.message); }
      else { fail(res, 500, e.message); }
    }
  });

  app.delete('/pool/:poolId', adminAuth, async (req: Request, res: Response) => {
    try {
      const result = await manager.deletePool(pstr(req.params['poolId']));
      ok(res, result);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.post('/pool/:poolId/sleep', adminAuth, async (req: Request, res: Response) => {
    try {
      const { SharedPoolSleepCycle } = await import('./sleep-cycle.js');
      const { getPool } = await import('./db.js');
      const cycle = new SharedPoolSleepCycle(getPool());
      const result = await cycle.run(pstr(req.params['poolId']));
      ok(res, result);
    } catch (err) {
      fail(res, 500, (err as Error).message);
    }
  });

  app.get('/pool/:poolId/reputation/:agentId', requireScope('memforge:read'), async (req: Request, res: Response) => {
    const domain = qstr(req.query['domain']);
    try {
      const rep = await manager.getReputation(pstr(req.params['agentId']), domain);
      ok(res, rep);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  // ─── Procedure Sharing Routes ─────────────────────────────────────────

  app.post('/pool/:poolId/procedures/publish/:agentId', requireScope('memforge:write'), async (req: Request, res: Response) => {
    const { PublishProceduresSchema } = await import('./schemas.js');
    const parse = PublishProceduresSchema.safeParse(req.body);
    if (!parse.success) { fail(res, 400, parse.error.issues[0]?.message ?? 'invalid request'); return; }
    try {
      const agentId = getAgentId(req);
      const result = await manager.publishProcedures(agentId, pstr(req.params['poolId']), {
        minConfidence: parse.data.min_confidence,
        namespace: parse.data.namespace,
      });
      ok(res, result);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'NOT_MEMBER') { fail(res, 403, e.message); }
      else { fail(res, 500, e.message); }
    }
  });

  app.get('/pool/:poolId/procedures', requireScope('memforge:read'), async (req: Request, res: Response) => {
    const q = qstr(req.query['q']);
    const limit = qnum(req.query['limit']);
    const offset = qnum(req.query['offset']);
    try {
      const procs = await manager.getSharedProcedures(pstr(req.params['poolId']), { q, limit, offset });
      ok(res, procs);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  // ─── Expertise Discovery Route ────────────────────────────────────────

  app.get('/pool/:poolId/expertise', requireScope('memforge:read'), async (req: Request, res: Response) => {
    const q = qstr(req.query['q']);
    const limit = qnum(req.query['limit']);
    if (!q) { fail(res, 400, '"q" query parameter is required'); return; }
    try {
      const results = await manager.expertiseDiscovery(pstr(req.params['poolId']), q, { limit });
      ok(res, results);
    } catch (err) {
      const e = err as Error;
      if (e instanceof TypeError) { fail(res, 400, e.message); }
      else { fail(res, 500, e.message); }
    }
  });

  // ─── Agent Roles Routes ───────────────────────────────────────────────

  app.post('/memory/:agentId/roles', requireScope('memforge:write'), async (req: Request, res: Response) => {
    const { DeclareRoleSchema } = await import('./schemas.js');
    const parse = DeclareRoleSchema.safeParse(req.body);
    if (!parse.success) { fail(res, 400, parse.error.issues[0]?.message ?? 'invalid request'); return; }
    let agentId: string;
    try { agentId = getAgentId(req); } catch (err) { fail(res, 400, (err as Error).message); return; }
    try {
      const role = await manager.declareRole(agentId, parse.data.domain, {
        confidence: parse.data.confidence,
        description: parse.data.description,
      });
      ok(res, role);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.get('/memory/:agentId/roles', requireScope('memforge:read'), async (req: Request, res: Response) => {
    let agentId: string;
    try { agentId = getAgentId(req); } catch (err) { fail(res, 400, (err as Error).message); return; }
    try {
      const roles = await manager.getRoles(agentId);
      ok(res, roles);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.delete('/memory/:agentId/roles/:domain', requireScope('memforge:write'), async (req: Request, res: Response) => {
    let agentId: string;
    try { agentId = getAgentId(req); } catch (err) { fail(res, 400, (err as Error).message); return; }
    const domain = pstr(req.params['domain']);
    if (!domain) { fail(res, 400, 'domain is required'); return; }
    try {
      const result = await manager.deleteRole(agentId, domain);
      if (!result.deleted) { fail(res, 404, `Role '${domain}' not found`); return; }
      ok(res, result);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.post('/memory/:agentId/roles/detect', requireScope('memforge:write'), async (req: Request, res: Response) => {
    let agentId: string;
    try { agentId = getAgentId(req); } catch (err) { fail(res, 400, (err as Error).message); return; }
    try {
      const roles = await manager.autoDetectRoles(agentId);
      ok(res, roles);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  // ─── Phase 4: Continuous Adaptation ──────────────────────────────────────

  app.post('/memory/:agentId/:warmId/validity', requireScope('memforge:write'), async (req: Request, res: Response) => {
    let agentId: string;
    try { agentId = getAgentId(req); } catch (err) { fail(res, 400, (err as Error).message); return; }
    const warmIdStr = pstr(req.params['warmId']);
    let warmId: bigint;
    try { warmId = BigInt(warmIdStr); } catch { fail(res, 400, 'invalid warm_tier id'); return; }
    const body = (req.body ?? {}) as { valid_until?: string | null };
    let validUntil: Date | null = null;
    if (body.valid_until !== undefined && body.valid_until !== null) {
      const parsed = new Date(body.valid_until);
      if (Number.isNaN(parsed.getTime())) { fail(res, 400, 'valid_until must be an ISO-8601 timestamp or null'); return; }
      validUntil = parsed;
    }
    try {
      const result = await manager.setMemoryValidity(agentId, warmId, validUntil);
      if (!result.updated) { fail(res, 404, 'memory not found'); return; }
      ok(res, result);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.post('/memory/:agentId/procedures/:procId/outcome', requireScope('memforge:write'), async (req: Request, res: Response) => {
    let agentId: string;
    try { agentId = getAgentId(req); } catch (err) { fail(res, 400, (err as Error).message); return; }
    const procIdStr = pstr(req.params['procId']);
    let procId: bigint;
    try { procId = BigInt(procIdStr); } catch { fail(res, 400, 'invalid procedure id'); return; }
    const body = (req.body ?? {}) as { outcome?: string };
    if (!body.outcome || !['positive', 'negative', 'neutral'].includes(body.outcome)) {
      fail(res, 400, "outcome must be one of 'positive', 'negative', 'neutral'");
      return;
    }
    try {
      const result = await manager.recordProcedureOutcome(agentId, procId, body.outcome as 'positive' | 'negative' | 'neutral');
      if (!result.updated) { fail(res, 404, 'procedure not found'); return; }
      ok(res, result);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.get('/memory/:agentId/drift', requireScope('memforge:read'), async (req: Request, res: Response) => {
    let agentId: string;
    try { agentId = getAgentId(req); } catch (err) { fail(res, 400, (err as Error).message); return; }
    try {
      const report = await manager.detectDrift(agentId);
      ok(res, report);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  // ─── Selective Forgetting — deprecated namespaces ─────────────────────

  app.post('/memory/:agentId/namespaces/:namespace/deprecate', requireScope('memforge:write'), async (req: Request, res: Response) => {
    let agentId: string;
    try { agentId = getAgentId(req); } catch (err) { fail(res, 400, (err as Error).message); return; }
    const namespace = pstr(req.params['namespace']);
    if (!namespace) { fail(res, 400, '"namespace" path param is required'); return; }
    const body = (req.body ?? {}) as { reason?: unknown };
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    try {
      const result = await manager.deprecateNamespace(agentId, namespace, reason);
      ok(res, result);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.delete('/memory/:agentId/namespaces/:namespace/deprecate', requireScope('memforge:write'), async (req: Request, res: Response) => {
    let agentId: string;
    try { agentId = getAgentId(req); } catch (err) { fail(res, 400, (err as Error).message); return; }
    const namespace = pstr(req.params['namespace']);
    if (!namespace) { fail(res, 400, '"namespace" path param is required'); return; }
    try {
      const result = await manager.undeprecateNamespace(agentId, namespace);
      ok(res, result);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  app.get('/memory/:agentId/namespaces/deprecated', requireScope('memforge:read'), async (req: Request, res: Response) => {
    let agentId: string;
    try { agentId = getAgentId(req); } catch (err) { fail(res, 400, (err as Error).message); return; }
    try {
      const list = await manager.listDeprecatedNamespaces(agentId);
      ok(res, list);
    } catch (err) { fail(res, 500, (err as Error).message); }
  });

  // ─── Global error handler ─────────────────────────────────────────────

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error({ err }, 'unhandled error');
    fail(res, 500, 'Internal server error');
  });

  return app;
}
