// MemForge — Structured logging with pino
//
// Provides component-scoped loggers and request correlation IDs.
// JSON output in production, pretty-print in development.

import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// ─── Request context for correlation IDs ────────────────────────────────────

interface RequestContext {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

// ─── Root logger ────────���───────────────────────────────────────────────────

const level = process.env['LOG_LEVEL'] ?? (process.env['NODE_ENV'] === 'test' ? 'silent' : 'info');

const rootLogger = pino({
  level,
  name: 'memforge',
  mixin() {
    const ctx = requestContext.getStore();
    return ctx ? { requestId: ctx.requestId } : {};
  },
});

// ─── Component loggers ──��───────────────────────────────────────────────────

export function getLogger(component: string): pino.Logger {
  return rootLogger.child({ component });
}

// ─── Express middleware — attach request correlation ID ─────────────────────

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  requestContext.run({ requestId }, () => next());
}

// ─── Request logging middleware ───���─────────────────────────────────────────

const httpLog = getLogger('http');

export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      agentId: req.params?.['agentId'],
    };
    if (res.statusCode >= 500) {
      httpLog.error(logData, 'request failed');
    } else if (res.statusCode >= 400) {
      httpLog.warn(logData, 'request rejected');
    } else {
      httpLog.info(logData, 'request completed');
    }
  });
  next();
}

export { rootLogger };
