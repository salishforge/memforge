// MemForge — TypeScript HTTP Client SDK
//
// Lightweight, zero-dependency client for the MemForge REST API.
// Works in Node.js, Deno, Bun, and browser environments.
//
// Usage:
//   import { MemForgeClient } from '@salishforge/memforge/client';
//   const client = new MemForgeClient({ baseUrl: 'http://localhost:3333' });
//   await client.add('agent-1', 'User logged in');
//
// Multi-device usage (one agent_id, many devices):
//   Set defaults at construction so every call carries them; override
//   per-call when needed.
//     const client = new MemForgeClient({
//       baseUrl, token,
//       defaultNamespace: 'project-memforge',
//       defaultSessionId: process.env.HOSTNAME ?? randomUUID(),
//     });
//   The defaults are sent as X-Memforge-Namespace and X-Memforge-Session-Id
//   headers, which the server treats as fallbacks for body params.

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
  ColdTierSearchResult,
  RestoreColdTierResult,
  SleepAdvisory,
  SharedProcedure,
  ExpertiseResult,
  AgentRole,
  DriftReport,
  ProcedureOutcome,
  DreamRun,
  DreamStatus,
  DreamSource,
  DreamOutputMode,
  AnthropicMemoryStoreLink,
  AnthropicSyncState,
  SyncStrategy,
} from './types.js';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface MemForgeClientConfig {
  /** Base URL of the MemForge server (default: http://localhost:3333) */
  baseUrl?: string;
  /** Bearer token for authentication */
  token?: string;
  /** Custom fetch implementation (default: globalThis.fetch) */
  fetch?: typeof fetch;
  /**
   * Default namespace sent as X-Memforge-Namespace header on every call.
   * Per-call values in body or method args override this.
   */
  defaultNamespace?: string;
  /**
   * Default session_id sent as X-Memforge-Session-Id header on every call.
   * Typical value: a per-process UUID generated at startup so the same
   * device's writes share a session across calls.
   */
  defaultSessionId?: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class MemForgeClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly _fetch: typeof fetch;
  private readonly defaultNamespace: string | undefined;
  private readonly defaultSessionId: string | undefined;

  constructor(config: MemForgeClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? process.env['MEMFORGE_URL'] ?? 'http://localhost:3333').replace(/\/$/, '');
    this.token = config.token ?? process.env['MEMFORGE_TOKEN'];
    this._fetch = config.fetch ?? globalThis.fetch;
    this.defaultNamespace = config.defaultNamespace ?? process.env['MEMFORGE_NAMESPACE'];
    this.defaultSessionId = config.defaultSessionId ?? process.env['MEMFORGE_SESSION_ID'];
  }

  // ─── Memory Operations ──────────────────────────────────────────────────

  /** Add a memory event to the hot tier. */
  async add(agentId: string, content: string, metadata?: Record<string, unknown>, namespace?: string, sessionId?: string): Promise<AddResult> {
    return this.post<AddResult>(`/memory/${enc(agentId)}/add`, {
      content,
      metadata,
      ...(namespace ? { namespace } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
    });
  }

  /** Search warm tier memory. */
  async query(agentId: string, options: {
    q: string;
    limit?: number;
    mode?: QueryMode;
    after?: string;
    before?: string;
    decay?: number;
    namespace?: string;
    /** Restrict results by epistemic confidence level (v3.9). */
    epistemic?: 'only_established' | 'include_provisional' | 'include_contested' | 'all';
  }): Promise<QueryResult[]> {
    const params = new URLSearchParams({ q: options.q });
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.mode) params.set('mode', options.mode);
    if (options.after) params.set('after', options.after);
    if (options.before) params.set('before', options.before);
    if (options.decay !== undefined) params.set('decay', String(options.decay));
    if (options.namespace) params.set('namespace', options.namespace);
    if (options.epistemic) params.set('epistemic', options.epistemic);
    return this.get<QueryResult[]>(`/memory/${enc(agentId)}/query?${params}`);
  }

  /** Retrieve memories in chronological order. */
  async timeline(agentId: string, options?: {
    from?: string;
    to?: string;
    limit?: number;
    namespace?: string;
  }): Promise<TimelineEntry[]> {
    const params = new URLSearchParams();
    if (options?.from) params.set('from', options.from);
    if (options?.to) params.set('to', options.to);
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.namespace) params.set('namespace', options.namespace);
    const qs = params.toString();
    return this.get<TimelineEntry[]>(`/memory/${enc(agentId)}/timeline${qs ? '?' + qs : ''}`);
  }

  /** Trigger hot→warm consolidation. */
  async consolidate(agentId: string, mode?: ConsolidationMode, namespace?: string, targetNamespace?: string): Promise<ConsolidateResult> {
    const body: Record<string, unknown> = {};
    if (mode) body['mode'] = mode;
    if (namespace) body['namespace'] = namespace;
    if (targetNamespace) body['target_namespace'] = targetNamespace;
    return this.post<ConsolidateResult>(`/memory/${enc(agentId)}/consolidate`, body);
  }

  /** Archive and clear all memory for an agent. */
  async clear(agentId: string): Promise<ClearResult> {
    return this.post<ClearResult>(`/memory/${enc(agentId)}/clear`, {});
  }

  /** Get memory tier statistics. */
  async stats(agentId: string, namespace?: string): Promise<AgentStats> {
    const qs = namespace ? `?namespace=${enc(namespace)}` : '';
    return this.get<AgentStats>(`/memory/${enc(agentId)}/stats${qs}`);
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

  /** Trigger a sleep cycle — scores, triages, revises, and maintains memory.
   * Agent-wide: the cycle processes all namespaces for the agent. */
  async sleep(agentId: string, options?: {
    tokenBudget?: number;
    evictionThreshold?: number;
    revisionThreshold?: number;
    includeReflection?: boolean;
  }): Promise<SleepCycleResult> {
    return this.post<SleepCycleResult>(`/memory/${enc(agentId)}/sleep`, options ?? {});
  }

  /**
   * Dream-runs API — async sleep-cycle jobs with run ids, status polling,
   * and cancellation. Mirrors the Anthropic Dreams SDK shape so callers can
   * swap providers with minimal code change.
   */
  readonly dreams = {
    /**
     * Enqueue a dream run. Server returns immediately with a status='pending'
     * record; poll status() (or call waitFor) for completion.
     */
    create: async (agentId: string, options?: {
      namespace?: string;
      sessionIds?: string[];
      model?: string;
      instructions?: string;
      source?: DreamSource;
      outputMode?: DreamOutputMode;
      sleep?: {
        tokenBudget?: number;
        evictionThreshold?: number;
        revisionThreshold?: number;
        includeReflection?: boolean;
      };
    }): Promise<DreamRun> => {
      const body = {
        namespace: options?.namespace,
        session_ids: options?.sessionIds,
        model: options?.model,
        instructions: options?.instructions,
        source: options?.source,
        output_mode: options?.outputMode,
        sleep: options?.sleep,
      };
      return this.post<DreamRun>(`/memory/${enc(agentId)}/dreams`, body);
    },

    /** Fetch a single dream run. Throws on 404 with the server's error message. */
    status: async (agentId: string, runId: string): Promise<DreamRun> => {
      return this.get<DreamRun>(`/memory/${enc(agentId)}/dreams/${enc(runId)}`);
    },

    /** List dream runs for an agent. */
    list: async (agentId: string, options?: {
      status?: DreamStatus;
      source?: DreamSource;
      limit?: number;
      offset?: number;
    }): Promise<{ runs: DreamRun[]; total: number }> => {
      const params = new URLSearchParams();
      if (options?.status) params.set('status', options.status);
      if (options?.source) params.set('source', options.source);
      if (options?.limit !== undefined) params.set('limit', String(options.limit));
      if (options?.offset !== undefined) params.set('offset', String(options.offset));
      const qs = params.toString();
      return this.get<{ runs: DreamRun[]; total: number }>(
        `/memory/${enc(agentId)}/dreams${qs ? `?${qs}` : ''}`,
      );
    },

    /** Request cancellation. Pending runs go to 'canceled'; running runs exit at next phase boundary. */
    cancel: async (agentId: string, runId: string): Promise<DreamRun> => {
      return this.post<DreamRun>(`/memory/${enc(agentId)}/dreams/${enc(runId)}/cancel`, {});
    },

    /**
     * Poll until the run reaches a terminal state. Throws on timeout. The
     * loop is intentionally simple — fixed interval, no exponential backoff.
     * Replace with a webhook subscription when polling cost matters.
     */
    waitFor: async (
      agentId: string,
      runId: string,
      options?: { timeoutMs?: number; intervalMs?: number },
    ): Promise<DreamRun> => {
      const timeoutMs = options?.timeoutMs ?? 5 * 60_000;
      const intervalMs = options?.intervalMs ?? 1_000;
      const start = Date.now();
      while (true) {
        const run = await this.dreams.status(agentId, runId);
        if (run.status === 'completed' || run.status === 'failed' || run.status === 'canceled') {
          return run;
        }
        if (Date.now() - start > timeoutMs) {
          throw new Error(`dream run ${runId} did not terminate within ${timeoutMs}ms (last status=${run.status})`);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    },
  };

  /**
   * Anthropic Memory Store Bridge — bidirectional sync between MemForge
   * namespaces and Anthropic Memory Stores. Requires DREAMS_PROVIDER=
   * anthropic + ANTHROPIC_API_KEY on the server side.
   */
  readonly anthropic = {
    push: (agentId: string, options?: {
      namespace?: string;
      limit?: number;
      externalStoreId?: string;
      metadata?: Record<string, unknown>;
    }): Promise<AnthropicMemoryStoreLink> => {
      return this.post<AnthropicMemoryStoreLink>(`/memory/${enc(agentId)}/anthropic/push`, {
        namespace: options?.namespace,
        limit: options?.limit,
        external_store_id: options?.externalStoreId,
        metadata: options?.metadata,
      });
    },

    pull: (agentId: string, options: {
      externalStoreId: string;
      namespace?: string;
      strategy?: SyncStrategy;
    }): Promise<AnthropicMemoryStoreLink> => {
      return this.post<AnthropicMemoryStoreLink>(`/memory/${enc(agentId)}/anthropic/pull`, {
        external_store_id: options.externalStoreId,
        namespace: options.namespace,
        strategy: options.strategy,
      });
    },

    syncState: (agentId: string, namespace?: string): Promise<AnthropicSyncState> => {
      const qs = namespace ? `?namespace=${enc(namespace)}` : '';
      return this.get<AnthropicSyncState>(`/memory/${enc(agentId)}/anthropic/sync-state${qs}`);
    },
  };

  /** Get memory health metrics. */
  async memoryHealth(agentId: string): Promise<MemoryHealth> {
    return this.get<MemoryHealth>(`/memory/${enc(agentId)}/health`);
  }

  // ─── Epistemic Confidence Model (v3.9) ───────────────────────────────────

  /**
   * Returns the count of warm-tier memories per epistemic_status.
   * All five status values are always present, defaulting to 0 when empty.
   */
  async epistemicProfile(agentId: string): Promise<Record<string, number>> {
    return this.get<Record<string, number>>(`/memory/${enc(agentId)}/epistemic`);
  }

  /** Generate a session resumption context for an agent. */
  async resume(agentId: string, limit?: number, namespace?: string): Promise<ResumeContext> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    if (namespace) params.set('namespace', namespace);
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

  // ─── Cold Tier ────────────────────────────────────────────────────────

  /** Search archived cold tier memories. Use for audit, recovery, and compliance. */
  async searchColdTier(agentId: string, opts: {
    q?: string;
    namespace?: string;
    from?: string;
    to?: string;
    sourceTable?: 'hot_tier' | 'warm_tier';
    limit?: number;
    offset?: number;
  } = {}): Promise<ColdTierSearchResult> {
    const params = new URLSearchParams();
    if (opts.q) params.set('q', opts.q);
    if (opts.namespace) params.set('namespace', opts.namespace);
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    if (opts.sourceTable) params.set('source_table', opts.sourceTable);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.offset !== undefined) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return this.get<ColdTierSearchResult>(`/memory/${enc(agentId)}/cold${qs ? '?' + qs : ''}`);
  }

  /** Restore a cold tier row to warm tier. Non-destructive — the cold row is preserved. */
  async restoreColdTier(agentId: string, coldId: number | bigint | string, opts: { namespace?: string } = {}): Promise<RestoreColdTierResult> {
    const body: Record<string, unknown> = { cold_id: String(coldId) };
    if (opts.namespace) body['namespace'] = opts.namespace;
    return this.post<RestoreColdTierResult>(`/memory/${enc(agentId)}/restore`, body);
  }

  // ─── Sleep Advisory ──────────────────────────────────────────────────

  /** Get adaptive sleep-cycle recommendation. Advisory only — callers decide whether to act. */
  async sleepAdvisory(agentId: string): Promise<SleepAdvisory> {
    return this.get<SleepAdvisory>(`/memory/${enc(agentId)}/sleep/advisory`);
  }

  // ─── Procedure Sharing ───────────────────────────────────────────────

  /** Publish agent's active procedures to a shared pool with first-hand confidence discount. */
  async publishProcedures(agentId: string, poolId: string, opts: { minConfidence?: number; namespace?: string } = {}): Promise<{ published: number }> {
    return this.post<{ published: number }>(`/pool/${enc(poolId)}/procedures/publish/${enc(agentId)}`, opts);
  }

  /** Get active procedures shared in a pool. */
  async getSharedProcedures(poolId: string, opts: { q?: string; limit?: number; offset?: number } = {}): Promise<SharedProcedure[]> {
    const params = new URLSearchParams();
    if (opts.q) params.set('q', opts.q);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.offset !== undefined) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return this.get<SharedProcedure[]>(`/pool/${enc(poolId)}/procedures${qs ? '?' + qs : ''}`);
  }

  // ─── Expertise Discovery ─────────────────────────────────────────────

  /** Rank pool members by expertise for a query topic. */
  async expertiseDiscovery(poolId: string, query: string, opts: { limit?: number } = {}): Promise<ExpertiseResult[]> {
    const params = new URLSearchParams({ q: query });
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    return this.get<ExpertiseResult[]>(`/pool/${enc(poolId)}/expertise?${params.toString()}`);
  }

  // ─── Agent Roles ─────────────────────────────────────────────────────

  /** Declare or update an expertise role for an agent. */
  async declareRole(agentId: string, domain: string, opts: { confidence?: number; description?: string } = {}): Promise<AgentRole> {
    return this.post<AgentRole>(`/memory/${enc(agentId)}/roles`, { domain, ...opts });
  }

  /** Get all declared roles for an agent. */
  async getRoles(agentId: string): Promise<AgentRole[]> {
    return this.get<AgentRole[]>(`/memory/${enc(agentId)}/roles`);
  }

  /** Delete a role from an agent. */
  async deleteRole(agentId: string, domain: string): Promise<{ deleted: boolean }> {
    return this.delete<{ deleted: boolean }>(`/memory/${enc(agentId)}/roles/${enc(domain)}`);
  }

  /** Auto-detect expertise roles from knowledge graph and procedures. */
  async autoDetectRoles(agentId: string): Promise<AgentRole[]> {
    return this.post<AgentRole[]>(`/memory/${enc(agentId)}/roles/detect`, {});
  }

  // ─── Phase 4: Continuous Adaptation ──────────────────────────────────────

  /** Set or clear the validity window on a warm-tier memory. Pass null to remove expiry. */
  async setMemoryValidity(agentId: string, warmId: number | bigint | string, validUntil: Date | string | null): Promise<{ updated: boolean }> {
    const iso = validUntil === null
      ? null
      : validUntil instanceof Date ? validUntil.toISOString() : validUntil;
    return this.post<{ updated: boolean }>(`/memory/${enc(agentId)}/${enc(String(warmId))}/validity`, { valid_until: iso });
  }

  /** Record a procedure outcome. Used to evolve procedure confidence over time. */
  async recordProcedureOutcome(agentId: string, procedureId: number | bigint | string, outcome: ProcedureOutcome): Promise<{ updated: boolean }> {
    return this.post<{ updated: boolean }>(`/memory/${enc(agentId)}/procedures/${enc(String(procedureId))}/outcome`, { outcome });
  }

  /** Fetch drift-detection report based on recent drift_signals snapshots. */
  async detectDrift(agentId: string): Promise<DriftReport> {
    return this.get<DriftReport>(`/memory/${enc(agentId)}/drift`);
  }

  /**
   * Mark a namespace as deprecated. Sleep cycles will decay importance and
   * confidence of memories in this namespace each cycle. Reversible via
   * undeprecateNamespace().
   */
  async deprecateNamespace(agentId: string, namespace: string, reason?: string): Promise<{ deprecated: boolean; namespace: string }> {
    return this.post<{ deprecated: boolean; namespace: string }>(
      `/memory/${enc(agentId)}/namespaces/${enc(namespace)}/deprecate`,
      reason ? { reason } : {},
    );
  }

  /** Reverse a namespace deprecation; future sleep cycles stop decaying its rows. */
  async undeprecateNamespace(agentId: string, namespace: string): Promise<{ restored: boolean; namespace: string }> {
    return this.delete<{ restored: boolean; namespace: string }>(
      `/memory/${enc(agentId)}/namespaces/${enc(namespace)}/deprecate`,
    );
  }

  /** List the agent's deprecated namespaces, newest first. */
  async listDeprecatedNamespaces(agentId: string): Promise<Array<{ namespace: string; deprecated_at: string; reason: string | null }>> {
    return this.get<Array<{ namespace: string; deprecated_at: string; reason: string | null }>>(
      `/memory/${enc(agentId)}/namespaces/deprecated`,
    );
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
    if (this.defaultNamespace) h['X-Memforge-Namespace'] = this.defaultNamespace;
    if (this.defaultSessionId) h['X-Memforge-Session-Id'] = this.defaultSessionId;
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

  private async delete<T>(path: string): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
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
  async add(agentId: string, content: string, metadata?: Record<string, unknown>, namespace?: string, sessionId?: string): Promise<AddResult | null> {
    return this.safe('add', () => this.client.add(agentId, content, metadata, namespace, sessionId), null);
  }

  async query(agentId: string, options: Parameters<MemForgeClient['query']>[1]): Promise<QueryResult[]> {
    return this.safe('query', () => this.client.query(agentId, options), []);
  }

  async timeline(agentId: string, options?: { from?: string; to?: string; limit?: number; namespace?: string }): Promise<TimelineEntry[]> {
    return this.safe('timeline', () => this.client.timeline(agentId, options), []);
  }

  async consolidate(agentId: string, mode?: ConsolidationMode, namespace?: string, targetNamespace?: string): Promise<ConsolidateResult | null> {
    return this.safe('consolidate', () => this.client.consolidate(agentId, mode, namespace, targetNamespace), null);
  }

  async clear(agentId: string): Promise<ClearResult | null> {
    return this.safe('clear', () => this.client.clear(agentId), null);
  }

  async stats(agentId: string, namespace?: string): Promise<AgentStats | null> {
    return this.safe('stats', () => this.client.stats(agentId, namespace), null);
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

  async epistemicProfile(agentId: string): Promise<Record<string, number> | null> {
    return this.safe('epistemicProfile', () => this.client.epistemicProfile(agentId), null);
  }

  async resume(agentId: string, limit?: number, namespace?: string): Promise<ResumeContext | null> {
    return this.safe('resume', () => this.client.resume(agentId, limit, namespace), null);
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

  async searchColdTier(agentId: string, opts: Parameters<MemForgeClient['searchColdTier']>[1] = {}): Promise<ColdTierSearchResult> {
    return this.safe('searchColdTier', () => this.client.searchColdTier(agentId, opts), { rows: [], total: 0 });
  }

  async restoreColdTier(agentId: string, coldId: number | bigint | string, opts: Parameters<MemForgeClient['restoreColdTier']>[2] = {}): Promise<RestoreColdTierResult | null> {
    return this.safe('restoreColdTier', () => this.client.restoreColdTier(agentId, coldId, opts), null);
  }

  async sleepAdvisory(agentId: string): Promise<SleepAdvisory | null> {
    return this.safe('sleepAdvisory', () => this.client.sleepAdvisory(agentId), null);
  }

  async publishProcedures(agentId: string, poolId: string, opts: Parameters<MemForgeClient['publishProcedures']>[2] = {}): Promise<{ published: number } | null> {
    return this.safe('publishProcedures', () => this.client.publishProcedures(agentId, poolId, opts), null);
  }

  async getSharedProcedures(poolId: string, opts: Parameters<MemForgeClient['getSharedProcedures']>[1] = {}): Promise<SharedProcedure[]> {
    return this.safe('getSharedProcedures', () => this.client.getSharedProcedures(poolId, opts), []);
  }

  async expertiseDiscovery(poolId: string, query: string, opts: Parameters<MemForgeClient['expertiseDiscovery']>[2] = {}): Promise<ExpertiseResult[]> {
    return this.safe('expertiseDiscovery', () => this.client.expertiseDiscovery(poolId, query, opts), []);
  }

  async declareRole(agentId: string, domain: string, opts: Parameters<MemForgeClient['declareRole']>[2] = {}): Promise<AgentRole | null> {
    return this.safe('declareRole', () => this.client.declareRole(agentId, domain, opts), null);
  }

  async getRoles(agentId: string): Promise<AgentRole[]> {
    return this.safe('getRoles', () => this.client.getRoles(agentId), []);
  }

  async deleteRole(agentId: string, domain: string): Promise<{ deleted: boolean } | null> {
    return this.safe('deleteRole', () => this.client.deleteRole(agentId, domain), null);
  }

  async autoDetectRoles(agentId: string): Promise<AgentRole[]> {
    return this.safe('autoDetectRoles', () => this.client.autoDetectRoles(agentId), []);
  }

  async setMemoryValidity(agentId: string, warmId: number | bigint | string, validUntil: Date | string | null): Promise<{ updated: boolean } | null> {
    return this.safe('setMemoryValidity', () => this.client.setMemoryValidity(agentId, warmId, validUntil), null);
  }

  async recordProcedureOutcome(agentId: string, procedureId: number | bigint | string, outcome: ProcedureOutcome): Promise<{ updated: boolean } | null> {
    return this.safe('recordProcedureOutcome', () => this.client.recordProcedureOutcome(agentId, procedureId, outcome), null);
  }

  async detectDrift(agentId: string): Promise<DriftReport | null> {
    return this.safe('detectDrift', () => this.client.detectDrift(agentId), null);
  }

  async deprecateNamespace(agentId: string, namespace: string, reason?: string): Promise<{ deprecated: boolean; namespace: string } | null> {
    return this.safe('deprecateNamespace', () => this.client.deprecateNamespace(agentId, namespace, reason), null);
  }

  async undeprecateNamespace(agentId: string, namespace: string): Promise<{ restored: boolean; namespace: string } | null> {
    return this.safe('undeprecateNamespace', () => this.client.undeprecateNamespace(agentId, namespace), null);
  }

  async listDeprecatedNamespaces(agentId: string): Promise<Array<{ namespace: string; deprecated_at: string; reason: string | null }>> {
    return this.safe('listDeprecatedNamespaces', () => this.client.listDeprecatedNamespaces(agentId), []);
  }

  async health(): Promise<HealthStatus | null> {
    return this.safe('health', () => this.client.health(), null);
  }
}
