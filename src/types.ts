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
}

export interface AddResult {
  id: bigint;
  agent_id: string;
  created_at: Date;
  deduplicated?: boolean;
}

/** Outcome type for memory tagging — inspired by MH-FLOCKE (Apache 2.0) + hippo-memory (MIT) */
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
  /** Full-text search rank (present only in query results) */
  rank?: number;
}

export interface QueryResult {
  id: bigint;
  content: string;
  /** One-line summary (populated when consolidation uses LLM mode). Inspired by FABLE/MemPalace closets/drawers. */
  summary?: string;
  metadata: Record<string, unknown>;
  consolidated_at: Date;
  time_start: Date | null;
  time_end: Date | null;
  rank: number;
}

// ─── Query modes ─────────────────────────────────────────────────────────────

/** Search modes — 'code' mode uses simple tokenizer preserving symbols. Inspired by CCRider (MIT). */
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
  /** Token budget — return results fitting within this many tokens (estimate: content.length/4). Inspired by FABLE (arXiv 2601.18116). */
  maxTokens?: number;
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
  /** Max revisions per sleep cycle — caps LLM spending. Inspired by claude-code-toolkit (MIT) auto-dream. */
  maxRevisionsPerCycle?: number;
  /** Importance score weights */
  weights: {
    recency: number;
    frequency: number;
    centrality: number;
    reflection: number;
    stability: number;
  };
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
  /** Keyword overlap boost factor for hybrid search (default 0.3, 0 = disabled). Inspired by MemPalace (MIT). */
  keywordOverlapBoost: number;
  /** Temporal proximity window in days for time-aware scoring (default 7, 0 = disabled). Inspired by MemPalace (MIT). */
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

// ─── Shared Memory Pools ─────────────────────────────────────────────────────

export interface SharedPool {
  id: string;
  name: string;
  description?: string;
  pool_type: 'team' | 'global';
  created_at: Date;
  metadata: Record<string, unknown>;
}

export interface PoolMembership {
  agent_id: string;
  pool_id: string;
  role: 'member' | 'admin';
  joined_at: Date;
}

export interface SharedMemory {
  id: bigint;
  pool_id: string;
  source_agent_id: string;
  content: string;
  summary?: string;
  source_chain: string[];
  hop_count: number;
  base_confidence: number;
  importance: number;
  corroboration_count: number;
  published_at: Date;
  rank?: number;
}

export interface AgentReputation {
  agent_id: string;
  domain: string;
  score: number;
  corroboration_count: number;
  contradiction_count: number;
  contribution_count: number;
}

export interface PublishResult {
  pool_id: string;
  published: number;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};

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

