// OAuth2 Bearer token + scope authorization middleware for MemForge
// Calls the OAuth2 introspect endpoint, caches results 30s, enforces scopes.

import type { Request, Response, NextFunction } from 'express';

// Extend Express Request type with oauth2 context
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      oauth2?: { client_id: string; scope: string };
    }
  }
}

const INTROSPECT_URL =
  process.env['OAUTH2_INTROSPECT_URL'] ?? 'http://localhost:3005/oauth2/introspect';

const REQUIRED = process.env['OAUTH2_REQUIRED'] !== 'false';

interface TokenInfo {
  active: boolean;
  client_id: string;
  scope: string;
  cachedAt: number;
}

// 30-second in-process cache to avoid hammering the OAuth2 server.
// Capped at 10,000 entries to prevent memory exhaustion from token spray attacks.
const TOKEN_CACHE = new Map<string, TokenInfo>();
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_SIZE = 10_000;

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of TOKEN_CACHE) {
    if (now - entry.cachedAt > CACHE_TTL_MS) TOKEN_CACHE.delete(token);
  }
}, 60_000).unref();

/**
 * Express middleware: validate Bearer token and set req.oauth2.
 * If OAUTH2_REQUIRED=false, unauthenticated requests pass through.
 */
export async function bearerAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    if (!REQUIRED) {
      next();
      return;
    }
    res.status(401).json({ ok: false, error: 'Authorization: Bearer <token> header required' });
    return;
  }

  const token = authHeader.slice(7);

  // Cache hit
  const cached = TOKEN_CACHE.get(token);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    if (!cached.active) {
      res.status(401).json({ ok: false, error: 'Token expired or revoked' });
      return;
    }
    req.oauth2 = { client_id: cached.client_id, scope: cached.scope };
    next();
    return;
  }

  // Introspect
  let data: { active: boolean; client_id: string; scope: string };
  try {
    const response = await fetch(INTROSPECT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`,
      signal: AbortSignal.timeout(5000),
    });
    data = (await response.json()) as typeof data;
  } catch (err) {
    console.error('[memforge:auth] introspect failed:', (err as Error).message);
    res.status(503).json({ ok: false, error: 'OAuth2 server unavailable' });
    return;
  }

  // Evict oldest entries if cache is full (prevents memory exhaustion from token spray)
  if (TOKEN_CACHE.size >= CACHE_MAX_SIZE) {
    const firstKey = TOKEN_CACHE.keys().next().value;
    if (firstKey !== undefined) TOKEN_CACHE.delete(firstKey);
  }

  TOKEN_CACHE.set(token, { ...data, cachedAt: Date.now() });

  if (!data.active) {
    res.status(401).json({ ok: false, error: 'Token expired or revoked' });
    return;
  }

  req.oauth2 = { client_id: data.client_id, scope: data.scope };
  next();
}

/**
 * Express middleware: require a specific scope.
 * Must run after bearerAuth (depends on req.oauth2 being set).
 */
export function requireScope(scope: string) {
  return function scopeGuard(req: Request, res: Response, next: NextFunction): void {
    const granted = req.oauth2?.scope?.split(/\s+/).filter(Boolean) ?? [];
    if (granted.includes(scope)) {
      next();
      return;
    }
    const clientId = req.oauth2?.client_id ?? 'unknown';
    console.warn(
      `[memforge:scope] DENIED client=${clientId} required=${scope} granted=${req.oauth2?.scope ?? 'none'} ${req.method} ${req.path}`,
    );
    res.status(403).json({
      ok: false,
      error: 'insufficient_scope',
      required_scope: scope,
    });
  };
}
