// MemForge Standalone — PostgreSQL connection pool

import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { getLogger } from './logger.js';

const log = getLogger('db');

let _pool: Pool | null = null;
let _healthCheckTimer: ReturnType<typeof setInterval> | null = null;

export function getPool(databaseUrl?: string): Pool {
  if (_pool) return _pool;

  const url = databaseUrl ?? process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is required (set in env or pass to getPool())');
  }

  const config: PoolConfig = {
    connectionString: url,
    max: parseInt(process.env['DB_POOL_MAX'] ?? '10', 10),
    min: parseInt(process.env['DB_POOL_MIN'] ?? '2', 10),
    idleTimeoutMillis: parseInt(process.env['DB_POOL_IDLE_TIMEOUT_MS'] ?? '30000', 10),
    connectionTimeoutMillis: parseInt(process.env['DB_POOL_CONNECTION_TIMEOUT_MS'] ?? '5000', 10),
  };

  _pool = new Pool(config);

  _pool.on('error', (err) => {
    log.error({ err }, 'pool error');
  });

  // Health check — runs SELECT 1 every 60 seconds to keep connections alive.
  // .unref() ensures this timer does not prevent the process from exiting.
  _healthCheckTimer = setInterval(() => {
    if (_pool) {
      void _pool.query('SELECT 1').catch((err: Error) => {
        log.error({ err }, 'pool health check failed');
      });
    }
  }, 60_000);
  _healthCheckTimer.unref();

  return _pool;
}

/** Returns current pool connection counts. */
export function poolStats(): { totalCount: number; idleCount: number; waitingCount: number } {
  if (!_pool) return { totalCount: 0, idleCount: 0, waitingCount: 0 };
  return {
    totalCount: _pool.totalCount,
    idleCount: _pool.idleCount,
    waitingCount: _pool.waitingCount,
  };
}

/** Call once on shutdown to drain the pool cleanly. */
export async function closePool(): Promise<void> {
  if (_healthCheckTimer) {
    clearInterval(_healthCheckTimer);
    _healthCheckTimer = null;
  }
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
