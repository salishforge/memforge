// MemForge — Redis cache layer
//
// Cache tiers:
//   hot          →  5 min TTL  (stats, recent items)
//   search       → 10 min TTL  (FTS query results)
//   consolidation→ 30 min TTL  (consolidation result records)
//
// Key format:
//   memforge:{agentId}:stats
//   memforge:{agentId}:q:{sha256(q+limit)[0:12]}

import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { getLogger } from './logger.js';
const log = getLogger('cache');

// Cached copy of the HMAC key so we read the env var once. An absent key
// degrades to a fixed fallback so dev environments still get tamper
// detection (without production-grade targeted-tamper resistance).
const CACHE_HMAC_KEY =
  process.env['CACHE_HMAC_KEY'] ??
  process.env['AUDIT_HMAC_KEY'] ??
  'memforge-cache-default-key';

function sign(payload: string): string {
  return createHmac('sha256', CACHE_HMAC_KEY).update(payload).digest('hex');
}

function verify(payload: string, sig: unknown): boolean {
  if (typeof sig !== 'string' || sig.length !== 64) return false;
  const expected = sign(payload);
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CacheTier = 'hot' | 'search' | 'consolidation';

const TTL_SECONDS: Record<CacheTier, number> = {
  hot: 5 * 60,            //  5 min
  search: 10 * 60,        // 10 min
  consolidation: 30 * 60, // 30 min
};

interface CacheCounters {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  errors: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

const counters: CacheCounters = { hits: 0, misses: 0, sets: 0, invalidations: 0, errors: 0 };

let redisClient: RedisClientType | null = null;
let connectionPromise: Promise<RedisClientType | null> | null = null;

// ─── Connection ───────────────────────────────────────────────────────────────

export async function getRedis(): Promise<RedisClientType | null> {
  if (redisClient?.isOpen) return redisClient;

  // Coalesce concurrent connection attempts
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async (): Promise<RedisClientType | null> => {
    const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    try {
      const client = createClient({
        url,
        socket: {
          connectTimeout: 5_000,
          reconnectStrategy: (retries: number) => {
            if (retries > 5) {
              log.error('Redis max reconnect attempts reached');
              return false;
            }
            return Math.min(retries * 500, 3_000);
          },
        },
      }) as RedisClientType;

      client.on('error', (err: Error) => {
        log.error({ err }, 'Redis error');
        counters.errors++;
      });
      client.on('reconnecting', () => {
        log.info('Redis reconnecting');
      });
      client.on('end', () => {
        log.info('Redis connection closed');
        redisClient = null;
      });

      await client.connect();
      const safeUrl = url.replace(/:\/\/[^@]*@/, '://*:*@');
      log.info({ url: safeUrl }, 'Redis connected');
      redisClient = client;
      return client;
    } catch (err) {
      log.error({ err }, 'Redis connection failed — operating without cache');
      return null;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

function queryHash(q: string, limit: number): string {
  return createHash('sha256')
    .update(`${q}::${limit}`)
    .digest('hex')
    .slice(0, 12);
}

export function statsKey(agentId: string): string {
  return `memforge:${agentId}:stats`;
}

export function searchKey(agentId: string, q: string, limit: number): string {
  return `memforge:${agentId}:q:${queryHash(q, limit)}`;
}

export function timelineKey(agentId: string, from?: string, to?: string, limit = 50): string {
  const hash = createHash('sha256')
    .update(`${from ?? ''}::${to ?? ''}::${limit}`)
    .digest('hex')
    .slice(0, 12);
  return `memforge:${agentId}:tl:${hash}`;
}

// ─── Core operations ──────────────────────────────────────────────────────────

export async function cacheGet(key: string): Promise<unknown> {
  const redis = await getRedis();
  if (!redis) {
    counters.misses++;
    return null;
  }

  try {
    const raw = await redis.get(key);
    if (raw === null) {
      counters.misses++;
      return null;
    }

    // Envelope is { p: <payload JSON string>, s: <hex sig> }. Unsigned
    // or tampered entries are treated as misses and dropped from Redis —
    // avoids serving corrupted data to the rest of the app.
    const envelope = JSON.parse(raw) as { p?: unknown; s?: unknown };
    if (
      typeof envelope !== 'object' || envelope === null ||
      typeof envelope.p !== 'string' || !verify(envelope.p, envelope.s)
    ) {
      log.warn({ key }, 'cache entry rejected: missing or invalid HMAC');
      counters.errors++;
      counters.misses++;
      void redis.del(key).catch(() => undefined);
      return null;
    }

    counters.hits++;
    return JSON.parse(envelope.p) as unknown;
  } catch (err) {
    log.error({ err }, 'cache GET failed');
    counters.errors++;
    counters.misses++;
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, tier: CacheTier): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;

  try {
    const payload = JSON.stringify(value);
    const envelope = JSON.stringify({ p: payload, s: sign(payload) });
    await redis.setEx(key, TTL_SECONDS[tier], envelope);
    counters.sets++;
  } catch (err) {
    log.error({ err }, 'cache SET failed');
    counters.errors++;
  }
}

/**
 * Delete all cache keys matching a glob pattern using SCAN (production-safe).
 */
export async function invalidatePattern(pattern: string): Promise<number> {
  const redis = await getRedis();
  if (!redis) return 0;

  const keys: string[] = [];
  try {
    for await (const batch of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      if (Array.isArray(batch)) {
        keys.push(...(batch as string[]));
      } else {
        keys.push(batch as unknown as string);
      }
    }
    if (keys.length === 0) return 0;

    // DEL supports multiple keys in a single call
    const deleted = await redis.del(keys);
    counters.invalidations += deleted;
    return deleted;
  } catch (err) {
    log.error({ err }, 'cache SCAN/DEL failed');
    counters.errors++;
    return 0;
  }
}

/**
 * Invalidate all cached entries for a specific agent.
 */
export async function invalidateAgent(agentId: string): Promise<number> {
  return invalidatePattern(`memforge:${agentId}:*`);
}

/**
 * Flush all MemForge cache keys (does NOT flush the entire Redis DB).
 */
export async function flushCache(agentId?: string): Promise<number> {
  if (agentId) return invalidateAgent(agentId);
  return invalidatePattern('memforge:*');
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export function getLocalStats(): CacheCounters & { hit_rate: number } {
  const total = counters.hits + counters.misses;
  return {
    ...counters,
    hit_rate: total > 0 ? Math.round((counters.hits / total) * 10000) / 100 : 0,
  };
}

interface RedisStats {
  connected: boolean;
  used_memory?: string;
  total_keys?: number;
  evictions?: number;
  keyspace_hits?: number;
  keyspace_misses?: number;
  error?: string;
}

export async function getRedisStats(): Promise<RedisStats> {
  const redis = await getRedis();
  if (!redis?.isOpen) return { connected: false };

  try {
    const [memInfo, statsInfo] = await Promise.all([
      redis.info('memory'),
      redis.info('stats'),
    ]);

    const usedMemory = memInfo.match(/used_memory_human:([^\r\n]+)/)?.[1]?.trim() ?? 'unknown';
    const evictions = parseInt(statsInfo.match(/evicted_keys:(\d+)/)?.[1] ?? '0', 10);
    const keyspaceHits = parseInt(statsInfo.match(/keyspace_hits:(\d+)/)?.[1] ?? '0', 10);
    const keyspaceMisses = parseInt(statsInfo.match(/keyspace_misses:(\d+)/)?.[1] ?? '0', 10);
    const totalKeys = await redis.dbSize();

    return {
      connected: true,
      used_memory: usedMemory,
      total_keys: totalKeys,
      evictions,
      keyspace_hits: keyspaceHits,
      keyspace_misses: keyspaceMisses,
    };
  } catch (err) {
    return { connected: false, error: (err as Error).message };
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function closeRedis(): Promise<void> {
  if (redisClient?.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
}
