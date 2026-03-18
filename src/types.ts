// MemForge Standalone — Shared TypeScript types

export interface Agent {
  id: string;
  created_at: Date;
  last_seen: Date;
  metadata: Record<string, unknown>;
}

// ─── Hot tier ────────────────────────────────────────────────────────────────

export interface HotRow {
  id: bigint;
  agent_id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface AddResult {
  id: bigint;
  agent_id: string;
  created_at: Date;
}

// ─── Warm tier ───────────────────────────────────────────────────────────────

export interface WarmRow {
  id: bigint;
  agent_id: string;
  content: string;
  source_hot_ids: bigint[];
  metadata: Record<string, unknown>;
  consolidated_at: Date;
  /** Full-text search rank (present only in query results) */
  rank?: number;
}

export interface QueryResult {
  id: bigint;
  content: string;
  metadata: Record<string, unknown>;
  consolidated_at: Date;
  rank: number;
}

// ─── Consolidation ───────────────────────────────────────────────────────────

export interface ConsolidateResult {
  run_id: bigint;
  agent_id: string;
  hot_rows_processed: number;
  warm_rows_created: number;
  status: 'complete' | 'failed';
}

// ─── Cold tier ───────────────────────────────────────────────────────────────

export interface ClearResult {
  agent_id: string;
  hot_archived: number;
  warm_archived: number;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface AgentStats {
  agent_id: string;
  hot_count: number;
  warm_count: number;
  cold_count: number;
  last_consolidation: Date | null;
  last_seen: Date;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface MemForgeConfig {
  /** PostgreSQL connection string */
  databaseUrl: string;
  /** Max hot-tier rows to process per consolidation run (default 500) */
  consolidationBatchSize: number;
  /** Minimum hot-tier rows before auto-consolidation triggers (default 50) */
  consolidationThreshold: number;
  /** Whether to auto-register unknown agent IDs on add() (default true) */
  autoRegisterAgents: boolean;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};
