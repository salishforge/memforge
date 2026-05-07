// MemForge Standalone — Shared TypeScript types

import type { EmbeddingProvider } from './embedding.js';
import type { LLMProvider } from './llm.js';
import type { AuditChain } from './audit.js';

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
  namespace: string;
  /** Originating session — defaults to 'default' when no caller session is set. */
  session_id: string;
}

export interface AddResult {
  id: bigint;
  agent_id: string;
  created_at: Date;
  deduplicated?: boolean;
}

export type OutcomeType = 'error' | 'success' | 'decision' | 'observation' | 'neutral';

// ─── Warm tier ───────────────────────────────────────────────────────────────

export interface WarmRow {
  id: bigint;
  agent_id: string;
  content: string;
  source_hot_ids: bigint[];
  metadata: Record<string, unknown>;
  consolidated_at: Date;
  time_start: Date | null;
  time_end: Date | null;
  access_count: number;
  last_accessed: Date | null;
  namespace: string;
  /**
   * Originating session of the latest hot row contributing to this warm row.
   * NULL on rows consolidated before per-session tracking existed —
   * distinct from the literal 'default' session.
   */
  session_id: string | null;
  /** Full-text search rank (present only in query results) */
  rank?: number;
}

export interface QueryResult {
  id: bigint;
  content: string;
  /** One-line summary — populated when consolidation mode is LLM. */
  summary?: string;
  metadata: Record<string, unknown>;
  consolidated_at: Date;
  time_start: Date | null;
  time_end: Date | null;
  rank: number;
}

// ─── Query modes ─────────────────────────────────────────────────────────────

/** Search modes — 'code' mode uses a simple tokenizer that preserves symbols. */
export type QueryMode = 'keyword' | 'semantic' | 'hybrid' | 'code';

export interface QueryOptions {
  /** Search text (required for keyword/hybrid, optional for semantic) */
  q: string;
  /** Maximum results (default 10) */
  limit?: number;
  /** Search mode (default: hybrid if embeddings enabled, keyword otherwise) */
  mode?: QueryMode;
  /** Filter: only return memories after this time */
  after?: Date;
  /** Filter: only return memories before this time */
  before?: Date;
  /** Temporal decay rate per hour (0 = no decay, default from config) */
  decayRate?: number;
  /** Token budget — return results fitting within this many tokens (estimate: content.length/4). */
  maxTokens?: number;
  /** Namespace to search within (default: 'default') */
  namespace?: string;
}

// ─── Timeline ────────────────────────────────────────────────────────────────

export interface TimelineEntry {
  id: bigint;
  content: string;
  metadata: Record<string, unknown>;
  time_start: Date | null;
  time_end: Date | null;
  consolidated_at: Date;
  access_count: number;
}

// ─── Consolidation ───────────────────────────────────────────────────────────

export type ConsolidationMode = 'concat' | 'summarize';

export interface ConsolidateResult {
  run_id: bigint;
  agent_id: string;
  hot_rows_processed: number;
  warm_rows_created: number;
  consolidation_mode: ConsolidationMode;
  status: 'complete' | 'failed';
}

/** Options for consolidate() — namespace scopes which hot rows are processed. */
export interface ConsolidateOptions {
  namespace?: string;
  /**
   * Override the warm-tier target namespace. Defaults from config
   * (`WARM_CONSOLIDATION_TARGET`) — typically 'shared' so cross-project
   * lessons propagate, or echo of `namespace` for per-project warm tiers.
   */
  targetNamespace?: string;
}

/** Options for add() */
export interface AddOptions {
  metadata?: Record<string, unknown>;
  outcomeType?: OutcomeType;
  hints?: MemoryHints;
  namespace?: string;
  /**
   * Per-device session identifier. Same regex as namespace; defaults to
   * 'default' when omitted. Two devices writing to the same (agent, namespace)
   * use different session_ids so their in-flight events stay isolated until
   * consolidation aggregates across all sessions of the namespace.
   */
  sessionId?: string;
  /**
   * OAuth2 client_id of the calling device, when introspection is in use.
   * Stored on hot/warm rows under metadata._client_id for audit/forensics.
   */
  clientId?: string;
}

/**
 * Three-tuple identity carried by every memory operation. The two latter
 * fields are optional — clients that don't supply them get backward-
 * compatible single-device behavior.
 */
export interface MultiDeviceContext {
  agentId: string;
  namespace?: string;
  sessionId?: string;
  clientId?: string;
}

// ─── Knowledge Graph ─────────────────────────────────────────────────────────

export interface Entity {
  id: bigint;
  agent_id: string;
  name: string;
  entity_type: string;
  metadata: Record<string, unknown>;
  first_seen: Date;
  last_seen: Date;
  mention_count: number;
}

export interface Relationship {
  id: bigint;
  agent_id: string;
  source_entity_id: bigint;
  target_entity_id: bigint;
  relation_type: string;
  weight: number;
  metadata: Record<string, unknown>;
  first_seen: Date;
  last_seen: Date;
  valid_from: Date;
  valid_until: Date | null;
}

export interface GraphNode {
  id: bigint;
  name: string;
  entity_type: string;
  mention_count: number;
  first_seen: Date;
  last_seen: Date;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation_type: string;
  weight: number;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface EntitySearchResult {
  id: bigint;
  name: string;
  entity_type: string;
  mention_count: number;
  first_seen: Date;
  last_seen: Date;
  /** Warm-tier memory IDs that mention this entity */
  memory_ids: bigint[];
}

// ─── Reflection & Self-Learning ──────────────────────────────────────────────

export type ReflectionTrigger = 'manual' | 'threshold' | 'scheduled';

export interface Reflection {
  id: bigint;
  agent_id: string;
  content: string;
  key_insights: string[];
  contradictions: string[];
  source_warm_ids: bigint[];
  trigger_type: ReflectionTrigger;
  reflection_level: number;
  source_reflection_ids: bigint[];
  metadata: Record<string, unknown>;
  created_at: Date;
  namespace: string;
}

export interface ReflectionResult {
  id: bigint;
  agent_id: string;
  insights_count: number;
  contradictions_count: number;
  source_memories_reviewed: number;
  trigger_type: ReflectionTrigger;
  reflection_level: number;
}

export interface MetaReflectionResult {
  id: bigint;
  agent_id: string;
  insights_count: number;
  contradictions_count: number;
  source_reflections_reviewed: number;
  reflection_level: number;
}

// ─── Procedural Memory ───────────────────────────────────────────────────────

export type ProcedureOutcome = 'positive' | 'negative' | 'neutral';

export interface Procedure {
  id: bigint;
  agent_id: string;
  condition: string;
  action: string;
  source_reflection_id: bigint | null;
  confidence: number;
  access_count: number;
  last_accessed: Date | null;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  namespace: string;
  success_count: number;
  failure_count: number;
  last_outcome: ProcedureOutcome | null;
  last_outcome_at: Date | null;
}

// ─── Memory Revision Engine ──────────────────────────────────────────────────

export type RevisionType = 'augment' | 'correct' | 'merge' | 'compress';

export type FeedbackOutcome = 'positive' | 'negative' | 'neutral';

export interface RetrievalEvent {
  id: bigint;
  agent_id: string;
  warm_tier_id: bigint;
  query_text: string;
  query_mode: string;
  rank_position: number;
  outcome: FeedbackOutcome | null;
  feedback_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface FeedbackResult {
  agent_id: string;
  updated: number;
  outcome: FeedbackOutcome;
}

export interface ActiveMemoryResult {
  agent_id: string;
  memories: Array<{ id: bigint; content: string; relevance: string }>;
  procedures: Array<{ condition: string; action: string; confidence: number }>;
}

export interface MemoryRevision {
  id: bigint;
  agent_id: string;
  warm_tier_id: bigint;
  revision_number: number;
  previous_content: string;
  new_content: string;
  revision_type: RevisionType;
  reason: string;
  delta_summary: string;
  confidence: number;
  model_used: string;
  created_at: Date;
  namespace: string;
}

export interface SleepCycleResult {
  agent_id: string;
  phase1_scores_updated: number;
  phase2_evicted: number;
  phase2_flagged_for_revision: number;
  phase3_revised: number;
  phase3_skipped: number;
  phase4_edges_invalidated: number;
  phase4_entities_merged: number;
  phase5_reflection: boolean;
  phase5b_cold_purged: number;
  /** Repeated temporal patterns crystallized as schema entities */
  schemas_detected: number;
  /** Memory conflicts resolved via heuristic multi-factor scoring */
  conflicts_resolved: number;
  audit_records_archived: number;
  tokens_used: number;
  duration_ms: number;
  /** Rows evicted by capacity budgeting (optional — absent when cap is disabled) */
  capacity_evicted?: number;
  /** Warm-tier rows whose valid_until has passed and were confidence-penalized */
  temporal_expired?: number;
  /** Procedures whose confidence was adjusted based on outcome history */
  procedures_evolved?: number;
  /** Warm-tier rows re-embedded under the current provider.modelId this cycle */
  embeddings_migrated?: number;
  /** Remaining rows with stale embedding_model after this cycle's batch */
  embeddings_migration_backlog?: number;
  /** Warm-tier rows in deprecated namespaces decayed by Phase 5.10 */
  deprecated_decayed?: number;
}

export interface SleepCycleConfig {
  /** Max tokens to spend on LLM calls per cycle (default 100000) */
  tokenBudget: number;
  /** Importance threshold below which memories are evicted (default 0.1) */
  evictionThreshold: number;
  /** Confidence threshold below which memories are flagged for revision (default 0.4) */
  revisionThreshold: number;
  /** Whether to run Phase 5 (reflection) in this cycle (default true) */
  includeReflection: boolean;
  /** Number of days to retain cold tier records; older records are deleted (optional) */
  coldRetentionDays?: number;
  /** Max revisions per sleep cycle — caps LLM spending per run. */
  maxRevisionsPerCycle?: number;
  /**
   * Hard cap on warm_tier rows per agent. When set, capacity-based eviction runs
   * after threshold eviction: the bottom (count - cap) rows by importance are
   * archived to cold_tier until exactly cap rows remain. Unset or 0 disables the
   * cap entirely so existing deployments are unaffected.
   */
  warmTierMaxPerAgent?: number;
  /** Importance score weights */
  weights: {
    recency: number;
    frequency: number;
    centrality: number;
    reflection: number;
    stability: number;
  };
  /**
   * Free-text guidance plumbed into Phase 3 (Revision) and Phase 5 (Reflection)
   * system-prompt suffixes. Originates from `instructions` on a dream run —
   * used so an external orchestrator can steer curation per cycle without
   * altering provider config. Capped at 4096 chars at the boundary.
   */
  instructions?: string;
  /**
   * Where revised memories land. 'in_place' overwrites the source warm rows
   * (the legacy /sleep behavior). 'new_namespace' writes revisions into a
   * derived namespace `<original>__dream__<runId>`, leaving the input
   * untouched — mirrors Anthropic Dreams' immutable-input semantics.
   */
  outputMode?: 'in_place' | 'new_namespace';
}

// ─── Dream Runs (Claude Dreaming compatibility) ──────────────────────────────
//
// A dream run is the persistent record of an async sleep cycle. Lifecycle:
// pending → running → (completed | failed | canceled). One row per run in
// the dream_runs table. Distinct from SleepCycleResult: that is the engine's
// per-run summary; DreamRun is the externally-visible job object.

export type DreamStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

/**
 * Where the curation work happens.
 *  - `local` runs MemForge's own sleep cycle (no Anthropic dep).
 *  - `anthropic` delegates Phase 3.5 to Anthropic Dreams.
 *  - `bridge_pull` / `bridge_push` mark runs that were initiated by a
 *    bidirectional sync rather than a user dream-create call.
 */
export type DreamSource = 'local' | 'anthropic' | 'bridge_pull' | 'bridge_push';

export type DreamOutputMode = 'in_place' | 'new_namespace';

export interface DreamRun {
  id: string;
  agent_id: string;
  namespace: string;
  session_ids: string[] | null;
  model: string;
  instructions: string | null;
  status: DreamStatus;
  source: DreamSource;
  output_mode: DreamOutputMode;
  output_namespace: string | null;
  /**
   * Warm-row ids snapshotted at run-start. Stored as strings (pg returns
   * int8 as text by default, matching MemForge's wire convention so
   * JSON.stringify works without a BigInt toJSON polyfill).
   */
  input_warm_ids: string[] | null;
  external_dream_id: string | null;
  external_memory_store_id: string | null;
  external_output_store_id: string | null;
  usage_in_tokens: number;
  usage_out_tokens: number;
  cost_usd_micros: number;
  sleep_cycle_result: SleepCycleResult | null;
  error: string | null;
  cancel_requested_at: Date | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface CreateDreamRunOptions {
  /** Default 'default'; selects which warm-tier namespace is the input. */
  namespace?: string;
  /** Subset of session_ids to scope the run to. Hard-capped at 100 (Anthropic limit). */
  sessionIds?: string[];
  /** Model identifier — pass-through for `anthropic` source; advisory for `local`. */
  model?: string;
  /** Free-text guidance plumbed into revision and reflection prompts. ≤4096 chars. */
  instructions?: string;
  /** Default 'local'; forces engine selection irrespective of env defaults. */
  source?: DreamSource;
  /**
   * 'in_place' (default) writes revisions over the input warm rows.
   * 'new_namespace' clones changes into `<namespace>__dream__<runId>`.
   */
  outputMode?: DreamOutputMode;
  /** Override per-cycle sleep config (token budget, thresholds, etc.). */
  sleepConfigOverrides?: Partial<SleepCycleConfig>;
}

export interface ListDreamRunsOptions {
  status?: DreamStatus;
  source?: DreamSource;
  /** Default 50, max 500. */
  limit?: number;
  offset?: number;
}

// ─── Anthropic Memory Store Bridge (Layer 4) ────────────────────────────────

export type SyncStrategy = 'memforge-wins' | 'anthropic-wins' | 'merge';

/** Persistent linkage between a (agent_id, namespace) and an Anthropic Memory Store. */
export interface AnthropicMemoryStoreLink {
  id: string;
  agent_id: string;
  namespace: string;
  external_store_id: string;
  direction: 'push' | 'pull' | 'bidirectional';
  warm_row_count: number;
  last_pushed_at: Date | null;
  last_pulled_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface AnthropicSyncState {
  agent_id: string;
  namespace: string;
  links: AnthropicMemoryStoreLink[];
  /** True when warm_tier has rows newer than the last push for any link. */
  drift_detected: boolean;
}

export interface MemoryHealth {
  agent_id: string;
  total_memories: number;
  avg_importance: number;
  avg_confidence: number;
  memories_below_eviction: number;
  memories_below_revision: number;
  revision_velocity_24h: number;
  knowledge_stability_pct: number;
  retrieval_count_24h: number;
  contradiction_rate: number;
  /** Number of memories with staleness_score > 0.5 */
  stale_memory_count: number;
  /** Average staleness score across all warm-tier memories */
  avg_staleness: number;
  /** Zero-result queries recorded in the last 7 days */
  knowledge_gap_count_7d: number;
}

// ─── Cold tier ───────────────────────────────────────────────────────────────

export interface ClearResult {
  agent_id: string;
  hot_archived: number;
  warm_archived: number;
}

export interface ColdTierRow {
  id: bigint;
  agent_id: string;
  source_table: 'hot_tier' | 'warm_tier';
  source_id: bigint;
  content: string;
  metadata: Record<string, unknown>;
  archived_at: Date;
  original_created_at: Date;
  namespace: string;
}

export interface ColdTierSearchOptions {
  /** Substring match on content (ILIKE '%q%') */
  q?: string;
  /** Filter to a specific namespace (default: 'default') */
  namespace?: string;
  /** Filter archived_at >= from */
  from?: Date;
  /** Filter archived_at <= to */
  to?: Date;
  /** Filter by source table */
  sourceTable?: 'hot_tier' | 'warm_tier';
  /** Max rows to return (default 50, max 500) */
  limit?: number;
  /** Rows to skip for pagination */
  offset?: number;
}

export interface ColdTierSearchResult {
  rows: ColdTierRow[];
  /** Total matching rows without limit/offset — use for pagination */
  total: number;
}

export interface RestoreColdTierResult {
  /** New warm_tier row id */
  warm_tier_id: bigint;
  /** Cold tier row that was the source */
  cold_tier_id: bigint;
  content: string;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface AgentStats {
  agent_id: string;
  hot_count: number;
  warm_count: number;
  cold_count: number;
  entity_count: number;
  relationship_count: number;
  reflection_count: number;
  last_consolidation: Date | null;
  last_seen: Date;
  /**
   * Warm-tier rows whose embedding_model differs from the current provider
   * (or is NULL). The next sleep cycle's Phase 5.9 will re-embed up to
   * EMBEDDING_MIGRATION_BATCH of these. Absent when embeddings are disabled.
   */
  stale_embedding_count?: number;
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
  /** Embedding provider instance (default: NoOpEmbeddingProvider) */
  embeddingProvider?: EmbeddingProvider;
  /** LLM provider instance for intelligent consolidation (default: null = concat mode) */
  llmProvider?: LLMProvider | null;
  /** Consolidation mode: 'concat' (fast, no LLM) or 'summarize' (LLM-driven distillation) */
  consolidationMode: ConsolidationMode;
  /** Temporal decay rate per hour for query ranking (default 0 = no decay) */
  temporalDecayRate: number;
  /** Inner batch size for consolidation grouping (default 50, set to 1 for verbatim mode) */
  consolidationInnerBatchSize: number;
  /** Keyword overlap boost factor for hybrid search (default 0.3, 0 = disabled). */
  keywordOverlapBoost: number;
  /** Temporal proximity window in days for time-aware scoring (default 7, 0 = disabled). */
  temporalProximityDays: number;
  /** Enable LLM post-retrieval reranking (default false — opt-in, adds ~2K tokens/query) */
  enableLlmRerank: boolean;
  /** Enable LLM-assisted ingest analysis (default false — opt-in, adds ~500 tokens/add) */
  enableLlmIngest: boolean;
  /** LLM provider for sleep cycle revision (can differ from consolidation LLM) */
  revisionLlmProvider?: LLMProvider | null;
  /** Sleep cycle configuration */
  sleepCycle: SleepCycleConfig;
  /** Audit chain instance for recording mutations (optional) */
  auditChain?: AuditChain | null;
  /** Thresholds for the sleepAdvisory() recommendation engine (optional — defaults apply) */
  sleepAdvisoryThresholds?: Partial<SleepAdvisoryThresholds>;
}

/** Agent-provided memory hints for active ingest participation */
export interface MemoryHints {
  /** Agent's importance assessment (0-1) */
  importance?: number;
  /** Topic/category this memory relates to */
  topic?: string;
  /** Warm-tier memory ID that this content updates/corrects */
  supersedes?: string;
  /** Pre-extracted entity names */
  entities?: string[];
  /** Retention policy hint */
  retention?: 'normal' | 'important' | 'permanent';
  /** Memory classification */
  type?: 'fact' | 'event' | 'decision' | 'preference' | 'correction' | 'error';
}


// ─── Sleep Advisory (Adaptive Scheduling) ────────────────────────────────────

export type SleepUrgency = 'none' | 'low' | 'medium' | 'high';

export interface SleepAdvisorySignal {
  name: string;
  value: number;
  threshold: number;
  urgency: SleepUrgency;
  description: string;
}

export interface SleepAdvisory {
  agent_id: string;
  recommended: boolean;
  urgency: SleepUrgency;
  reason: string;
  signals: SleepAdvisorySignal[];
  last_sleep_at: Date | null;
  hot_tier_count: number;
  warm_tier_count: number;
  time_since_last_sleep_ms: number | null;
}

/** Thresholds for the sleep advisory signals. Overridable via config or env vars. */
export interface SleepAdvisoryThresholds {
  hotBacklogLow: number;
  hotBacklogMedium: number;
  hotBacklogHigh: number;
  contradictionHigh: number;
  revisionDebtMedium: number;
  maxAgeHours: number;
  stabilityCeiling: number;
}

// ─── Shared Procedures ───────────────────────────────────────────────────────

export interface SharedProcedure {
  id: bigint;
  pool_id: string;
  source_agent_id: string;
  condition: string;
  action: string;
  confidence: number;
  hop_count: number;
  corroboration_count: number;
  active: boolean;
  metadata: Record<string, unknown>;
  published_at: Date;
}

// ─── Expertise Discovery ─────────────────────────────────────────────────────

export interface ExpertiseResult {
  agent_id: string;
  score: number;
  match_count: number;
  top_memories: Array<{ id: bigint; content: string; importance: number }>;
}

// ─── Agent Roles ─────────────────────────────────────────────────────────────

export interface AgentRole {
  agent_id: string;
  domain: string;
  confidence: number;
  description: string | null;
  auto_detected: boolean;
  evidence_count: number;
  created_at: Date;
  updated_at: Date;
}

// ─── Drift Detection ─────────────────────────────────────────────────────────

export interface DriftSnapshot {
  id: bigint;
  agent_id: string;
  measured_at: Date;
  contradiction_rate: number;
  staleness_p90: number;
  revision_velocity: number;
  stale_cluster_count: number;
  expired_count: number;
}

export interface DriftReport {
  agent_id: string;
  drift_detected: boolean;
  trend: 'stable' | 'degrading' | 'recovering' | 'insufficient_data';
  latest: DriftSnapshot | null;
  signals: {
    contradiction_rate_trend: number;
    staleness_trend: number;
    revision_velocity_trend: number;
  };
}

// ─── (continued) ─────────────────────────────────────────────────────────────

/** PostgreSQL query parameter — union of types accepted by the `pg` driver's parameterized queries. */
export type SqlParam = string | number | bigint | boolean | Date | null | string[] | number[] | bigint[];

/** JSON Schema property descriptor — used in tool definitions and MCP schemas. */
export interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  format?: string;
  additionalProperties?: boolean;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

// ─── Entity Deduplication Result ─────────────────────────────────────────────

export interface EntityDeduplicationResult {
  agent_id: string;
  entities_merged: number;
  threshold: number;
}

// ─── Shared Pool Sleep Cycle ─────────────────────────────────────────────────

export interface SharedPoolSleepCycleResult {
  deduplicated: number;
  conflicts_resolved: number;
  reputation_updated: number;
  evicted: number;
}

// ─── Health Status ────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: string;
  ts: string;
  embeddings: boolean;
  summarization: boolean;
}

// ─── Resume Context ───────────────────────────────────────────────────────────

export interface ResumeContext {
  agent_id: string;
  time_since_last_activity_ms: number | null;
  top_memories: Array<{
    id: bigint;
    content: string;
    importance: number;
    consolidated_at: Date;
  }>;
  active_procedures: Array<{
    condition: string;
    action: string;
    confidence: number;
  }>;
  open_contradictions: string[];
  memory_health: {
    total_memories: number;
    avg_importance: number;
    avg_confidence: number;
  };
}

