// MemForge — Temporal Audit Chain with Integrity Verification
//
// Every warm-tier mutation produces a hash-chained audit record.
// Records are immutable during a configurable retention period,
// then archived or pruned.
//
// Integrity model:
//   content_hash  = HMAC-SHA256(key, content)
//   chain_hash    = HMAC-SHA256(key, previous_hash + content_hash + operation + valid_from)
//
// Verification: walk the chain for a target and verify each link.
// A broken link means a record was tampered with, deleted, or reordered.

import { createHmac } from 'crypto';
import type { Pool } from 'pg';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type AuditOperation = 'create' | 'update' | 'delete' | 'revise' | 'merge' | 'evict' | 'score' | 'feedback';
export type AuditTrigger = 'api' | 'sleep_cycle' | 'consolidation' | 'reflection' | 'dedup' | 'feedback';

export interface AuditEntry {
  id: bigint;
  agent_id: string;
  target_table: string;
  target_id: bigint;
  operation: AuditOperation;
  valid_from: Date;
  valid_until: Date | null;
  content_before: string | null;
  content_after: string | null;
  metadata_delta: Record<string, unknown>;
  content_hash: string;
  previous_hash: string;
  chain_hash: string;
  triggered_by: AuditTrigger;
  model_used: string | null;
  created_at: Date;
}

export interface VerificationResult {
  agent_id: string;
  target_table: string;
  target_id: bigint;
  chain_length: number;
  valid: boolean;
  broken_at: number | null;      // index of first broken link (null if valid)
  broken_reason: string | null;
  checked_at: Date;
}

export interface AuditConfig {
  /** HMAC key for content and chain hashes. MUST be set in production. */
  hmacKey: string;
  /** Days to keep audit records immutable (default 90) */
  retentionDays: number;
  /** Whether to archive expired records to cold_audit (true) or delete them (false) */
  archiveOnExpiry: boolean;
}

const DEFAULT_CONFIG: AuditConfig = {
  hmacKey: process.env['AUDIT_HMAC_KEY'] ?? '',
  retentionDays: parseInt(process.env['AUDIT_RETENTION_DAYS'] ?? '90', 10),
  archiveOnExpiry: process.env['AUDIT_ARCHIVE_ON_EXPIRY'] !== 'false',
};

// ─── HMAC Helpers ───────────────────────────────────────────────────────────────

function hmac(key: string, data: string): string {
  if (!key) {
    // No key configured — use SHA-256 (detects accidental DB edits, but not targeted attacks)
    return createHmac('sha256', 'memforge-default-key').update(data).digest('hex');
  }
  return createHmac('sha256', key).update(data).digest('hex');
}

export function contentHash(key: string, content: string): string {
  return hmac(key, content);
}

function chainHash(key: string, previousHash: string, contentHashVal: string, operation: string, validFrom: string): string {
  return hmac(key, `${previousHash}|${contentHashVal}|${operation}|${validFrom}`);
}

// ─── Audit Chain Engine ─────────────────────────────────────────────────────────

export class AuditChain {
  private readonly pool: Pool;
  private readonly config: AuditConfig;

  constructor(pool: Pool, config: Partial<AuditConfig> = {}) {
    this.pool = pool;
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!this.config.hmacKey) {
      console.warn(
        '[memforge:audit] WARNING: AUDIT_HMAC_KEY not set. Audit chain uses a default key — ' +
        'this detects accidental modifications but NOT targeted tampering. ' +
        'Set AUDIT_HMAC_KEY to a strong random value in production.',
      );
    }
  }

  /**
   * Record a mutation in the audit chain.
   * Returns the content hash (also written to the target row).
   */
  async record(
    agentId: string,
    targetTable: string,
    targetId: bigint,
    operation: AuditOperation,
    contentBefore: string | null,
    contentAfter: string | null,
    metadataDelta: Record<string, unknown> = {},
    triggeredBy: AuditTrigger = 'api',
    modelUsed: string | null = null,
  ): Promise<string> {
    const now = new Date().toISOString();

    // Compute content hash
    const hashContent = contentAfter ?? contentBefore ?? '';
    const cHash = contentHash(this.config.hmacKey, hashContent);

    // Get previous chain hash for this target
    const prev = await this.pool.query<{ chain_hash: string }>(
      `SELECT chain_hash FROM audit_chain
       WHERE agent_id = $1 AND target_table = $2 AND target_id = $3
       ORDER BY id DESC LIMIT 1`,
      [agentId, targetTable, targetId],
    );
    const previousHash = prev.rows[0]?.chain_hash ?? '';

    // Close the previous record's valid_until
    if (prev.rows.length > 0) {
      await this.pool.query(
        `UPDATE audit_chain SET valid_until = $4
         WHERE agent_id = $1 AND target_table = $2 AND target_id = $3
         AND valid_until IS NULL`,
        [agentId, targetTable, targetId, now],
      );
    }

    // Compute chain hash
    const cChain = chainHash(this.config.hmacKey, previousHash, cHash, operation, now);

    // Insert audit record
    await this.pool.query(
      `INSERT INTO audit_chain
         (agent_id, target_table, target_id, operation, valid_from,
          content_before, content_after, metadata_delta,
          content_hash, previous_hash, chain_hash,
          triggered_by, model_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        agentId, targetTable, targetId, operation, now,
        contentBefore, contentAfter, JSON.stringify(metadataDelta),
        cHash, previousHash, cChain,
        triggeredBy, modelUsed,
      ],
    );

    return cHash;
  }

  /**
   * Verify the integrity of the audit chain for a specific target.
   * Walks the chain from oldest to newest and checks every link.
   */
  async verify(
    agentId: string,
    targetTable: string,
    targetId: bigint,
  ): Promise<VerificationResult> {
    const { rows } = await this.pool.query<AuditEntry>(
      `SELECT * FROM audit_chain
       WHERE agent_id = $1 AND target_table = $2 AND target_id = $3
       ORDER BY id ASC`,
      [agentId, targetTable, targetId],
    );

    if (rows.length === 0) {
      return {
        agent_id: agentId,
        target_table: targetTable,
        target_id: targetId,
        chain_length: 0,
        valid: true,
        broken_at: null,
        broken_reason: null,
        checked_at: new Date(),
      };
    }

    for (let i = 0; i < rows.length; i++) {
      const record = rows[i]!;

      // Verify content hash
      const expectedContentHash = contentHash(
        this.config.hmacKey,
        record.content_after ?? record.content_before ?? '',
      );
      if (record.content_hash !== expectedContentHash) {
        return {
          agent_id: agentId, target_table: targetTable, target_id: targetId,
          chain_length: rows.length, valid: false, broken_at: i,
          broken_reason: `Content hash mismatch at record ${record.id}: content was modified outside MemForge`,
          checked_at: new Date(),
        };
      }

      // Verify chain link
      const expectedPrevious = i === 0 ? '' : rows[i - 1]!.chain_hash;
      if (record.previous_hash !== expectedPrevious) {
        return {
          agent_id: agentId, target_table: targetTable, target_id: targetId,
          chain_length: rows.length, valid: false, broken_at: i,
          broken_reason: `Chain link broken at record ${record.id}: previous record was deleted or reordered`,
          checked_at: new Date(),
        };
      }

      const expectedChain = chainHash(
        this.config.hmacKey,
        record.previous_hash,
        record.content_hash,
        record.operation,
        new Date(record.valid_from).toISOString(),
      );
      if (record.chain_hash !== expectedChain) {
        return {
          agent_id: agentId, target_table: targetTable, target_id: targetId,
          chain_length: rows.length, valid: false, broken_at: i,
          broken_reason: `Chain hash mismatch at record ${record.id}: record metadata was tampered with`,
          checked_at: new Date(),
        };
      }
    }

    return {
      agent_id: agentId, target_table: targetTable, target_id: targetId,
      chain_length: rows.length, valid: true, broken_at: null, broken_reason: null,
      checked_at: new Date(),
    };
  }

  /**
   * Verify ALL audit chains for an agent. Returns summary.
   */
  async verifyAgent(agentId: string): Promise<{
    agent_id: string;
    chains_checked: number;
    chains_valid: number;
    chains_broken: number;
    broken_details: VerificationResult[];
    checked_at: Date;
  }> {
    // Get all unique targets
    const targets = await this.pool.query<{ target_table: string; target_id: bigint }>(
      `SELECT DISTINCT target_table, target_id FROM audit_chain WHERE agent_id = $1`,
      [agentId],
    );

    const broken: VerificationResult[] = [];
    let valid = 0;

    for (const t of targets.rows) {
      const result = await this.verify(agentId, t.target_table, t.target_id);
      if (result.valid) {
        valid++;
      } else {
        broken.push(result);
      }
    }

    return {
      agent_id: agentId,
      chains_checked: targets.rows.length,
      chains_valid: valid,
      chains_broken: broken.length,
      broken_details: broken,
      checked_at: new Date(),
    };
  }

  /**
   * Get the temporal history of a specific memory — every version with timestamps.
   */
  async history(
    agentId: string,
    targetTable: string,
    targetId: bigint,
  ): Promise<AuditEntry[]> {
    const { rows } = await this.pool.query<AuditEntry>(
      `SELECT * FROM audit_chain
       WHERE agent_id = $1 AND target_table = $2 AND target_id = $3
       ORDER BY valid_from ASC`,
      [agentId, targetTable, targetId],
    );
    return rows;
  }

  /**
   * Get the state of a memory at a specific point in time.
   */
  async stateAt(
    agentId: string,
    targetTable: string,
    targetId: bigint,
    asOf: Date,
  ): Promise<AuditEntry | null> {
    const { rows } = await this.pool.query<AuditEntry>(
      `SELECT * FROM audit_chain
       WHERE agent_id = $1 AND target_table = $2 AND target_id = $3
         AND valid_from <= $4
         AND (valid_until IS NULL OR valid_until > $4)
       ORDER BY valid_from DESC
       LIMIT 1`,
      [agentId, targetTable, targetId, asOf],
    );
    return rows[0] ?? null;
  }

  /**
   * Archive expired audit records (past retention period).
   * Called during sleep cycle or by cron.
   */
  async archiveExpired(agentId: string): Promise<{ archived: number; pruned: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);

    if (this.config.archiveOnExpiry) {
      // Move to cold_audit (preserving hashes for historical verification)
      const { rowCount: archived } = await this.pool.query(
        `WITH expired AS (
           SELECT * FROM audit_chain
           WHERE agent_id = $1 AND created_at < $2
           AND valid_until IS NOT NULL  -- only archive closed records
         ),
         moved AS (
           INSERT INTO cold_audit
             (agent_id, target_table, target_id, operation, valid_from, valid_until,
              content_hash, chain_hash, triggered_by, original_created_at)
           SELECT agent_id, target_table, target_id, operation, valid_from, valid_until,
                  content_hash, chain_hash, triggered_by, created_at
           FROM expired
           RETURNING id
         )
         DELETE FROM audit_chain
         WHERE agent_id = $1 AND created_at < $2
         AND valid_until IS NOT NULL`,
        [agentId, cutoff],
      );
      return { archived: archived ?? 0, pruned: 0 };
    } else {
      // Just delete expired closed records
      const { rowCount: pruned } = await this.pool.query(
        `DELETE FROM audit_chain
         WHERE agent_id = $1 AND created_at < $2
         AND valid_until IS NOT NULL`,
        [agentId, cutoff],
      );
      return { archived: 0, pruned: pruned ?? 0 };
    }
  }
}
