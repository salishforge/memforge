// MemForge — Dream-runs worker loop
//
// The worker turns dream_runs rows into executed sleep cycles. It owns no
// business logic — every state transition goes through MemoryManager — but
// holds the dedicated PostgreSQL listener and the single-flight scheduling
// that the manager itself doesn't (the manager is request-scoped; the worker
// runs for the lifetime of the process).
//
// Why a separate module:
//   The worker's lifecycle is timer/notification-driven, not request-driven.
//   It owns a dedicated `pg` client (LISTEN sticks to a single connection),
//   wakes on `dream_runs_inserted` notifications from the trigger in
//   migration-v3.6.sql, and falls back to a poll every POLL_INTERVAL_MS so a
//   replica without LISTEN support still makes progress. Multi-instance
//   correctness is via `FOR UPDATE SKIP LOCKED` in
//   MemoryManager._claimNextPendingDreamRun — two memforge processes won't
//   double-claim the same row.
//
// What it does NOT do:
//   - Run multiple cycles in parallel for the same agent (that's enforced by
//     MemoryManager.sleepLocks downstream)
//   - Schedule cycles itself — sleep cycles are still triggered externally,
//     either by a /dreams POST or (post-Layer 3) by an external scheduler
//   - Retry failed runs — a failed run stays failed; callers create a new run
//
// Cancellation lands inside the cycle via SleepCycleEngine.throwIfCanceled()
// which polls dream_runs.cancel_requested_at at every phase boundary.

import type { Client, Pool } from 'pg';
import pg from 'pg';
import type { MemoryManager } from './memory-manager.js';
import { getLogger } from './logger.js';

const log = getLogger('dream-runs-worker');

const POLL_INTERVAL_MS = 250;
const NOTIFICATION_CHANNEL = 'dream_runs_inserted';

export interface DreamRunsWorkerOptions {
  /**
   * Override the LISTEN/NOTIFY connection string. Defaults to
   * process.env.DATABASE_URL — the same connection the MemoryManager pool
   * uses. Tests use the same value so notifications propagate.
   */
  databaseUrl?: string;
  /** Disable the poll fallback (for tests that want strictly-LISTEN behavior). */
  disablePolling?: boolean;
}

export class DreamRunsWorker {
  private readonly manager: MemoryManager;
  private readonly pool: Pool;
  private readonly options: DreamRunsWorkerOptions;
  private listenClient: Client | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private running = false;
  /** Set when stop() is called to short-circuit the run loop. */
  private stopRequested = false;

  constructor(manager: MemoryManager, pool: Pool, options: DreamRunsWorkerOptions = {}) {
    this.manager = manager;
    this.pool = pool;
    this.options = options;
  }

  /**
   * Start the worker. Opens a dedicated LISTEN connection, kicks off an
   * initial drain (in case rows were inserted while the worker was down),
   * and arms the poll fallback. Idempotent — safe to call twice.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopRequested = false;

    try {
      const databaseUrl = this.options.databaseUrl ?? process.env['DATABASE_URL'];
      if (!databaseUrl) {
        log.warn('DATABASE_URL not set — dream-runs worker disabled (LISTEN unavailable)');
        return;
      }

      // Dedicated client: LISTEN sticks to a connection, so it cannot share
      // the pool. The pool stays in MemoryManager for normal queries.
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      await client.query(`LISTEN ${NOTIFICATION_CHANNEL}`);

      client.on('notification', (msg) => {
        if (msg.channel === NOTIFICATION_CHANNEL) {
          void this.drainPending();
        }
      });

      client.on('error', (err) => {
        log.error({ err }, 'dream-runs LISTEN client error — relying on poll fallback');
      });

      this.listenClient = client;

      if (!this.options.disablePolling) {
        this.pollTimer = setInterval(() => {
          void this.drainPending();
        }, POLL_INTERVAL_MS);
      }

      // Initial drain: catch up on any pending rows that landed while the
      // process was down.
      void this.drainPending();
      log.info({ channel: NOTIFICATION_CHANNEL }, 'dream-runs worker started');
    } catch (err) {
      this.running = false;
      log.error({ err }, 'dream-runs worker failed to start');
      throw err;
    }
  }

  /** Stop the worker — releases the dedicated client, clears the poll timer. */
  async stop(): Promise<void> {
    this.stopRequested = true;
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.inFlight) {
      try {
        await this.inFlight;
      } catch {
        // Errors already logged via _executeDreamRun.
      }
    }

    if (this.listenClient) {
      try {
        await this.listenClient.query(`UNLISTEN ${NOTIFICATION_CHANNEL}`);
      } catch {
        // Best-effort.
      }
      try {
        await this.listenClient.end();
      } catch {
        // Best-effort.
      }
      this.listenClient = null;
    }

    log.info('dream-runs worker stopped');
  }

  /**
   * Drain pending rows: claim and execute until none remain. Single-flight —
   * concurrent calls coalesce on the same in-flight promise so each tick
   * does at most one drain pass.
   */
  drainPending(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runDrainLoop().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runDrainLoop(): Promise<void> {
    if (this.stopRequested) return;
    while (this.running && !this.stopRequested) {
      let claimed;
      try {
        claimed = await this.manager._claimNextPendingDreamRun();
      } catch (err) {
        log.error({ err }, 'dream-runs claim failed');
        return;
      }
      if (!claimed) return;

      try {
        await this.manager._executeDreamRun(claimed);
      } catch (err) {
        // _executeDreamRun already persisted the failure state and logged;
        // we swallow here to keep draining other rows.
        log.error({ err, runId: claimed.id }, 'dream-runs execute swallowed (already persisted)');
      }
    }
  }
}

// Suppress unused-pool warning — kept on the type for future Service-layer
// use that may need direct pool access from inside the worker.
void Symbol.for('memforge-dream-runs-worker-pool-placeholder');
