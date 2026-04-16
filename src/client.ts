// MemForge — TypeScript HTTP Client SDK
//
// Lightweight, zero-dependency client for the MemForge REST API.
// Works in Node.js, Deno, Bun, and browser environments.
//
// Usage:
//   import { MemForgeClient } from '@salishforge/memforge/client';
//   const client = new MemForgeClient({ baseUrl: 'http://localhost:3333' });
//   await client.add('agent-1', 'User logged in');

import type {
  AddResult,
  QueryResult,
  QueryMode,
  TimelineEntry,
  ConsolidateResult,
  ConsolidationMode,
  ClearResult,
  AgentStats,
  EntitySearchResult,
  GraphQueryResult,
  ReflectionResult,
  Reflection,
  ReflectionTrigger,
  Procedure,
  SleepCycleResult,
  MemoryHealth,
  FeedbackOutcome,
  FeedbackResult,
  MetaReflectionResult,
  ActiveMemoryResult,
  ResumeContext,
  EntityDeduplicationResult,
  HealthStatus,
} from './types.js';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface MemForgeClientConfig {
  /** Base URL of the MemForge server (default: http://localhost:3333) */
  baseUrl?: string;
  /** Bearer token for authentication */
  token?: string;
  /** Custom fetch implementation (default: globalThis.fetch) */
  fetch?: typeof fetch;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class MemForgeClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly _fetch: typeof fetch;

  constructor(config: MemForgeClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? process.env['MEMFORGE_URL'] ?? 'http://localhost:3333').replace(/\/$/, '');
    this.token = config.token ?? process.env['MEMFORGE_TOKEN'];
    this._fetch = config.fetch ?? globalThis.fetch;
  }

  // ─── Memory Operations ──────────────────────────────────────────────────

  /** Add a memory event to the hot tier. */
  async add(agentId: string, content: string, metadata?: Record<string, unknown>): Promise<AddResult> {
    return this.post<AddResult>(`/memory/${enc(agentId)}/add`, { content, metadata });
  }

  /** Search warm tier memory. */
  async query(agentId: string, options: {
    q: string;
    limit?: number;
    mode?: QueryMode;
    after?: string;
    before?: string;
    decay?: number;
  }): Promise<QueryResult[]> {
    const params = new URLSearchParams({ q: options.q });
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.mode) params.set('mode', options.mode);
    if (options.after) params.set('after', options.after);
    if (options.before) params.set('before', options.before);
    if (options.decay !== undefined) params.set('decay', String(options.decay));
    return this.get<QueryResult[]>(`/memory/${enc(agentId)}/query?${params}`);
  }

  /** Retrieve memories in chronological order. */
  async timeline(agentId: string, options?: {
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<TimelineEntry[]> {
    const params = new URLSearchParams();
    if (options?.from) params.set('from', options.from);
    if (options?.to) params.set('to', options.to);
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    const qs = params.toString();
    return this.get<TimelineEntry[]>(`/memory/${enc(agentId)}/timeline${qs ? '?' + qs : ''}`);
  }

  /** Trigger hot→warm consolidation. */
  async consolidate(agentId: string, mode?: ConsolidationMode): Promise<ConsolidateResult> {
    return this.post<ConsolidateResult>(`/memory/${enc(agentId)}/consolidate`, mode ? { mode } : {});
  }

  /** Archive and clear all memory for an agent. */
  async clear(agentId: string): Promise<ClearResult> {
    return this.post<ClearResult>(`/memory/${enc(agentId)}/clear`, {});
  }

  /** Get memory tier statistics. */
  async stats(agentId: string): Promise<AgentStats> {
    return this.get<AgentStats>(`/memory/${enc(agentId)}/stats`);
  }

  // ─── Knowledge Graph ────────────────────────────────────────────────────

  /** Search entities in the knowledge graph. */
  async searchEntities(agentId: string, options?: {
    q?: string;
    type?: string;
    limit?: number;
  }): Promise<EntitySearchResult[]> {
    const params = new URLSearchParams();
    if (options?.q) params.set('q', options.q);
    if (options?.type) params.set('type', options.type);
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    const qs = params.toString();
    return this.get<EntitySearchResult[]>(`/memory/${enc(agentId)}/entities${qs ? '?' + qs : ''}`);
  }

  /** Traverse the knowledge graph from an entity. */
  async graphTraverse(agentId: string, entity: string, depth?: number): Promise<GraphQueryResult> {
    const params = new URLSearchParams({ entity });
    if (depth !== undefined) params.set('depth', String(depth));
    return this.get<GraphQueryResult>(`/memory/${enc(agentId)}/graph?${params}`);
  }

  // ─── Reflection ─────────────────────────────────────────────────────────

  /** Trigger an LLM reflection over recent memories. */
  async reflect(agentId: string, options?: {
    trigger?: ReflectionTrigger;
    limit?: number;
  }): Promise<ReflectionResult> {
    return this.post<ReflectionResult>(`/memory/${enc(agentId)}/reflect`, options ?? {});
  }

  /** Retrieve stored reflections. */
  async getReflections(agentId: string, limit?: number): Promise<Reflection[]> {
    const qs = limit !== undefined ? `?limit=${limit}` : '';
    return this.get<Reflection[]>(`/memory/${enc(agentId)}/reflections${qs}`);
  }

  // ─── Procedural Memory ──────────────────────────────────────────────────

  /** Retrieve learned procedures (condition→action rules). */
  async getProcedures(agentId: string, options?: { q?: string; limit?: number }): Promise<Procedure[]> {
    const params = new URLSearchParams();
    if (options?.q) params.set('q', options.q);
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    const qs = params.toString();
    return this.get<Procedure[]>(`/memory/${enc(agentId)}/procedures${qs ? '?' + qs : ''}`);
  }

  // ─── Sleep Cycle ───────────────────────────────────────────────────────────

  /** Trigger a sleep cycle — scores, triages, revises, and maintains memory. */
  async sleep(agentId: string, options?: {
    tokenBudget?: number;
    evictionThreshold?: number;
    revisionThreshold?: number;
    includeReflection?: boolean;
  }): Promise<SleepCycleResult> {
    return this.post<SleepCycleResult>(`/memory/${enc(agentId)}/sleep`, options ?? {});
  }

  /** Get memory health metrics. */
  async memoryHealth(agentId: string): Promise<MemoryHealth> {
    return this.get<MemoryHealth>(`/memory/${enc(agentId)}/health`);
  }

  /** Generate a session resumption context for an agent. */
  async resume(agentId: string, limit?: number): Promise<ResumeContext> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    const qs = params.toString();
    return this.get<ResumeContext>(`/memory/${enc(agentId)}/resume${qs ? `?${qs}` : ''}`);
  }

  // ─── Feedback ──────────────────────────────────────────────────────────

  /** Record outcome feedback for retrieved memories. */
  async feedback(agentId: string, retrievalIds: Array<number | bigint>, outcome: FeedbackOutcome, metadata?: Record<string, unknown>): Promise<FeedbackResult> {
    return this.post<FeedbackResult>(`/memory/${enc(agentId)}/feedback`, { retrieval_ids: retrievalIds, outcome, metadata });
  }

  // ─── Meta-Reflection ──────────────────────────────────────────────────

  /** Trigger a meta-reflection — synthesizes higher-order insights from existing reflections. */
  async metaReflect(agentId: string, limit?: number): Promise<MetaReflectionResult> {
    return this.post<MetaReflectionResult>(`/memory/${enc(agentId)}/meta-reflect`, limit ? { limit } : {});
  }

  // ─── Entity Deduplication ─────────────────────────────────────────────

  /** Trigger entity deduplication for the knowledge graph. */
  async deduplicateEntities(agentId: string, threshold?: number): Promise<EntityDeduplicationResult> {
    return this.post(`/memory/${enc(agentId)}/dedup-entities`, threshold ? { threshold } : {});
  }

  // ─── Active Recall ────────────────────────────────────────────────────

  /** Proactively surface relevant memories and procedures for a given action context. */
  async activeRecall(agentId: string, context: string, limit?: number): Promise<ActiveMemoryResult> {
    return this.post<ActiveMemoryResult>(`/memory/${enc(agentId)}/active-recall`, { context, limit });
  }

  // ─── System ─────────────────────────────────────────────────────────────

  /** Health check. */
  async health(): Promise<HealthStatus> {
    const res = await this._fetch(`${this.baseUrl}/health`, { headers: this.headers() });
    if (!res.ok) throw new Error(`MemForge health check failed: ${res.status}`);
    return res.json() as Promise<HealthStatus>;
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}${path}`, { headers: this.headers() });
    return this.unwrap<T>(res);
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return this.unwrap<T>(res);
  }

  private async unwrap<T>(res: Response): Promise<T> {
    const json = (await res.json()) as { ok: boolean; data?: T; error?: string };
    if (!json.ok || !res.ok) {
      throw new Error(json.error ?? `MemForge API error: ${res.status}`);
    }
    return json.data as T;
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

// ─── Resilient Client ───────────────────────────────────────────────────────

/**
 * A wrapper around MemForgeClient that catches all errors and returns
 * safe defaults. Use this when MemForge is optional and the agent must
 * keep running even if memory is unavailable.
 *
 * Every method returns a default value on failure instead of throwing.
 * Errors are logged to an optional callback for monitoring.
 *
 * Usage:
 *   const memory = new ResilientMemForgeClient({ baseUrl: '...' });
 *   const results = await memory.query('agent-1', { q: 'test' });
 *   // Returns [] if MemForge is down — never throws
 */
export class ResilientMemForgeClient {
  private readonly client: MemForgeClient;
  private readonly onError: (method: string, err: Error) => void;

  constructor(
    config: MemForgeClientConfig = {},
    onError?: (method: string, err: Error) => void,
  ) {
    this.client = new MemForgeClient(config);
    this.onError = onError ?? ((method, err) => {
      console.error(`[memforge] ${method} failed (graceful degradation):`, err.message);
    });
  }

  private async safe<T>(method: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.onError(method, err as Error);
      return fallback;
    }
  }

  // Memory operations — return empty results on failure
  async add(agentId: string, content: string, metadata?: Record<string, unknown>): Promise<AddResult | null> {
    return this.safe('add', () => this.client.add(agentId, content, metadata), null);
  }

  async query(agentId: string, options: { q: string; limit?: number; mode?: QueryMode; after?: string; before?: string; decay?: number }): Promise<QueryResult[]> {
    return this.safe('query', () => this.client.query(agentId, options), []);
  }

  async timeline(agentId: string, options?: { from?: string; to?: string; limit?: number }): Promise<TimelineEntry[]> {
    return this.safe('timeline', () => this.client.timeline(agentId, options), []);
  }

  async consolidate(agentId: string, mode?: ConsolidationMode): Promise<ConsolidateResult | null> {
    return this.safe('consolidate', () => this.client.consolidate(agentId, mode), null);
  }

  async clear(agentId: string): Promise<ClearResult | null> {
    return this.safe('clear', () => this.client.clear(agentId), null);
  }

  async stats(agentId: string): Promise<AgentStats | null> {
    return this.safe('stats', () => this.client.stats(agentId), null);
  }

  async searchEntities(agentId: string, options?: { q?: string; type?: string; limit?: number }): Promise<EntitySearchResult[]> {
    return this.safe('searchEntities', () => this.client.searchEntities(agentId, options), []);
  }

  async graphTraverse(agentId: string, entity: string, depth?: number): Promise<GraphQueryResult> {
    return this.safe('graphTraverse', () => this.client.graphTraverse(agentId, entity, depth), { nodes: [], edges: [] });
  }

  async reflect(agentId: string, options?: { trigger?: ReflectionTrigger; limit?: number }): Promise<ReflectionResult | null> {
    return this.safe('reflect', () => this.client.reflect(agentId, options), null);
  }

  async getReflections(agentId: string, limit?: number): Promise<Reflection[]> {
    return this.safe('getReflections', () => this.client.getReflections(agentId, limit), []);
  }

  async getProcedures(agentId: string, options?: { q?: string; limit?: number }): Promise<Procedure[]> {
    return this.safe('getProcedures', () => this.client.getProcedures(agentId, options), []);
  }

  async sleep(agentId: string, options?: { tokenBudget?: number; evictionThreshold?: number; revisionThreshold?: number; includeReflection?: boolean }): Promise<SleepCycleResult | null> {
    return this.safe('sleep', () => this.client.sleep(agentId, options), null);
  }

  async memoryHealth(agentId: string): Promise<MemoryHealth | null> {
    return this.safe('memoryHealth', () => this.client.memoryHealth(agentId), null);
  }

  async resume(agentId: string, limit?: number): Promise<ResumeContext | null> {
    return this.safe('resume', () => this.client.resume(agentId, limit), null);
  }

  async feedback(agentId: string, retrievalIds: Array<number | bigint>, outcome: FeedbackOutcome, metadata?: Record<string, unknown>): Promise<FeedbackResult | null> {
    return this.safe('feedback', () => this.client.feedback(agentId, retrievalIds, outcome, metadata), null);
  }

  async metaReflect(agentId: string, limit?: number): Promise<MetaReflectionResult | null> {
    return this.safe('metaReflect', () => this.client.metaReflect(agentId, limit), null);
  }

  async deduplicateEntities(agentId: string, threshold?: number): Promise<EntityDeduplicationResult | null> {
    return this.safe('deduplicateEntities', () => this.client.deduplicateEntities(agentId, threshold), null);
  }

  async activeRecall(agentId: string, context: string, limit?: number): Promise<ActiveMemoryResult> {
    return this.safe('activeRecall', () => this.client.activeRecall(agentId, context, limit), { agent_id: agentId, memories: [], procedures: [] });
  }

  async health(): Promise<HealthStatus | null> {
    return this.safe('health', () => this.client.health(), null);
  }
}
