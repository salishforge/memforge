// MemForge — Prometheus metrics registry
//
// Exposes:
//   http_requests_total          counter   (method, route, status_code)
//   http_request_duration_seconds histogram (method, route, status_code)
//   process_memory_bytes          gauge     (via collectDefaultMetrics)
//   process_uptime_seconds        gauge     (via collectDefaultMetrics)
//   database_pool_connections     gauge     (state: total|idle|waiting)

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { getPool } from './db.js';

export const registry = new Registry();

// Default Node.js process metrics (memory, CPU, uptime, GC, etc.)
collectDefaultMetrics({ register: registry, prefix: 'memforge_' });

// ── HTTP metrics ──────────────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests received',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// ── Database pool metrics ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const dbPoolConnections = new Gauge({
  name: 'database_pool_connections',
  help: 'PostgreSQL connection pool state',
  labelNames: ['state'] as const,
  registers: [registry],
  collect() {
    try {
      const pool = getPool();
      this.set({ state: 'total' }, pool.totalCount);
      this.set({ state: 'idle' }, pool.idleCount);
      this.set({ state: 'waiting' }, pool.waitingCount);
    } catch {
      // pool not yet initialised
    }
  },
});
