// MemForge — Anthropic Dreams Service-layer client
//
// Optional integration that lets MemForge offload curation to Anthropic's
// "Dreams" feature (Managed Agents beta `dreaming-2026-04-21`). When
// DREAMS_PROVIDER=anthropic and ANTHROPIC_API_KEY is set, sleep cycles can
// run a Phase 3.5 pass that sends a slice of warm memories to Anthropic and
// merges the cleaned response back into MemForge.
//
// Why a separate module:
//   - Keeps `@anthropic-ai/sdk` out of the runtime dep tree (we use plain
//     `fetch`); the integration stays optional.
//   - Wraps the undocumented memory-store payload format in one place so a
//     future schema refit is a single-file change.
//   - Owns the retry / backoff / budget guardrails so the sleep cycle stays
//     deterministic-ish.
//
// What it does NOT do:
//   - Replace MemForge's local sleep cycle. Phase 3.5 is *augment*, not
//     replace; importance / confidence / valid_until from local scoring are
//     preserved (Anthropic wins content + dedup, MemForge wins metadata).
//   - Manage Anthropic Memory Stores end-to-end. The Bridge layer (Layer 4,
//     unimplemented at the time of this comment) covers push/pull sync; this
//     module focuses on the per-cycle delegation.
//
// Failure policy:
//   - 401/403: fail the run, no fallback (security — don't silently degrade
//     when a key is wrong)
//   - 429/5xx: exponential backoff up to 3 retries, then fall back to local
//     cycle and annotate `error='anthropic_unavailable_local_fallback'`
//   - Network errors: same as 5xx

import type { Pool } from 'pg';
import type { WarmRow } from './types.js';
import { getLogger } from './logger.js';

const log = getLogger('dreams-anthropic');

const ANTHROPIC_DREAMS_URL = 'https://api.anthropic.com/v1/dreams';
const ANTHROPIC_BETA_HEADER = 'managed-agents-2026-04-01,dreaming-2026-04-21';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const SESSION_IDS_HARD_CAP = 100;

export interface AnthropicDreamsConfig {
  apiKey?: string;
  model?: string;
  /** Per-agent rolling-24h spend cap in micro-dollars (default 5_000_000 = $5). */
  budgetUsdMicros?: number;
  /** Max sessions to forward in one /v1/dreams call (≤100 enforced). */
  sessionIdsCap?: number;
  /** When true, every call short-circuits to the local fallback. Operational kill-switch. */
  killSwitch?: boolean;
}

export interface AnthropicDreamCallResult {
  externalDreamId: string;
  externalMemoryStoreId: string | null;
  externalOutputStoreId: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsdMicros: number;
  /** Records returned by Anthropic, normalized for merge into warm_tier. */
  outputRecords: AnthropicMemoryRecord[];
}

/**
 * Memory-store record shape. Anthropic's exact wire format for memory stores
 * is undocumented at the time of writing; this module assumes
 *   { records: [{ id?: string, content: string, metadata?: object }] }
 * which is the minimal shape any reasonable curation API would use. If the
 * real format diverges, this is the file to refit — all other layers see
 * `AnthropicMemoryRecord` as the boundary type.
 */
export interface AnthropicMemoryRecord {
  id?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class AnthropicDreamsClient {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly budgetUsdMicros: number;
  private readonly sessionIdsCap: number;
  private readonly killSwitch: boolean;

  constructor(config: AnthropicDreamsConfig = {}) {
    this.apiKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
    this.defaultModel = config.model ?? process.env['DREAMS_MODEL'] ?? DEFAULT_MODEL;
    this.budgetUsdMicros = config.budgetUsdMicros
      ?? parseInt(process.env['DREAMS_BUDGET_USD_MICROS'] ?? '5000000', 10);
    this.sessionIdsCap = Math.min(config.sessionIdsCap ?? SESSION_IDS_HARD_CAP, SESSION_IDS_HARD_CAP);
    this.killSwitch = config.killSwitch ?? process.env['DREAMS_KILL_SWITCH'] === 'true';

    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for AnthropicDreamsClient');
    }
  }

  /**
   * Run an end-to-end dream call: create + poll + fetch output. The caller
   * supplies a ready-built memory-store payload (warmRowsToMemoryStore did
   * the mapping). Returns the cleaned records and usage metrics.
   *
   * Throws on auth failures (401/403). Network/server errors (5xx, 429,
   * fetch failure) are retried up to MAX_RETRY_ATTEMPTS; if they all fail,
   * a `DreamsAnthropicTransientError` is thrown so the caller can fall back
   * to the local cycle.
   */
  async runDream(opts: {
    agentId: string;
    pool: Pool;
    sessionIds: string[] | null;
    instructions: string | null;
    inputRecords: AnthropicMemoryRecord[];
    model?: string;
  }): Promise<AnthropicDreamCallResult> {
    if (this.killSwitch) {
      throw new DreamsAnthropicTransientError('DREAMS_KILL_SWITCH=true — short-circuiting to local fallback');
    }

    await this.assertBudget(opts.agentId, opts.pool);

    const sessionIds = opts.sessionIds?.slice(0, this.sessionIdsCap) ?? null;
    const model = opts.model ?? this.defaultModel;

    // Step 1: create the dream and the input memory store. We keep the
    // upload payload simple and synchronous; if Anthropic's real API
    // requires a separate /v1/memory_stores call, that change lands here.
    const created = await this.createDream({
      memoryStorePayload: { records: opts.inputRecords },
      sessionIds,
      model,
      instructions: opts.instructions,
    });

    // Step 2: poll until terminal.
    const final = await this.pollUntilTerminal(created.id);
    if (final.status === 'failed') {
      throw new Error(`Anthropic dream ${created.id} failed: ${final.error ?? 'unknown'}`);
    }
    if (final.status === 'canceled') {
      throw new Error(`Anthropic dream ${created.id} was canceled`);
    }

    // Step 3: pull the output store contents.
    const outputRecords = final.output_memory_store_id
      ? await this.fetchMemoryStore(final.output_memory_store_id)
      : [];

    const inputTokens = final.usage?.input_tokens ?? 0;
    const outputTokens = final.usage?.output_tokens ?? 0;

    return {
      externalDreamId: created.id,
      externalMemoryStoreId: created.memory_store_id ?? null,
      externalOutputStoreId: final.output_memory_store_id ?? null,
      inputTokens,
      outputTokens,
      costUsdMicros: estimateCostUsdMicros(model, inputTokens, outputTokens),
      outputRecords,
    };
  }

  private async createDream(args: {
    memoryStorePayload: { records: AnthropicMemoryRecord[] };
    sessionIds: string[] | null;
    model: string;
    instructions: string | null;
  }): Promise<{ id: string; memory_store_id?: string; status: string }> {
    const body: Record<string, unknown> = {
      model: args.model,
      memory_store: args.memoryStorePayload,
    };
    if (args.sessionIds) body['session_ids'] = args.sessionIds;
    if (args.instructions) body['instructions'] = args.instructions;

    const json = await this.fetchWithRetry(ANTHROPIC_DREAMS_URL, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return json as { id: string; memory_store_id?: string; status: string };
  }

  private async pollUntilTerminal(dreamId: string): Promise<{
    status: string;
    output_memory_store_id?: string;
    error?: string;
    usage?: { input_tokens: number; output_tokens: number };
  }> {
    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
    let interval = 2_000;
    while (Date.now() < deadline) {
      const json = await this.fetchWithRetry(`${ANTHROPIC_DREAMS_URL}/${encodeURIComponent(dreamId)}`, {
        method: 'GET',
      });
      const status = (json as { status: string }).status;
      if (['completed', 'failed', 'canceled'].includes(status)) {
        return json as { status: string; output_memory_store_id?: string; error?: string; usage?: { input_tokens: number; output_tokens: number } };
      }
      await new Promise((r) => setTimeout(r, interval));
      interval = Math.min(interval * 1.5, 10_000);
    }
    throw new Error(`Anthropic dream ${dreamId} did not reach a terminal state within ${DEFAULT_TIMEOUT_MS}ms`);
  }

  private async fetchMemoryStore(storeId: string): Promise<AnthropicMemoryRecord[]> {
    // Best-effort fetch. Anthropic's exact endpoint shape is undocumented;
    // assumed form: GET /v1/memory_stores/:id → { records: [...] }.
    const url = `https://api.anthropic.com/v1/memory_stores/${encodeURIComponent(storeId)}`;
    const json = await this.fetchWithRetry(url, { method: 'GET' });
    const records = (json as { records?: AnthropicMemoryRecord[] }).records ?? [];
    return records;
  }

  private async fetchWithRetry(url: string, init: { method: string; body?: string }): Promise<unknown> {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          method: init.method,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': ANTHROPIC_BETA_HEADER,
          },
          body: init.body,
          signal: AbortSignal.timeout(60_000),
        });
        if (res.status === 401 || res.status === 403) {
          // Hard-fail on auth — never silently fall back; the caller must
          // see the auth error so a misconfiguration isn't masked.
          const text = await res.text().catch(() => '');
          throw new DreamsAnthropicAuthError(`Anthropic auth failed (${res.status}): ${text.slice(0, 200)}`);
        }
        if (res.status >= 500 || res.status === 429) {
          lastErr = new Error(`Anthropic ${res.status}`);
          await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
          continue;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
        }
        return await res.json();
      } catch (err) {
        if (err instanceof DreamsAnthropicAuthError) throw err;
        lastErr = err as Error;
        // Network errors / timeouts retry with backoff; logical errors above
        // already returned via throw.
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
      }
    }
    throw new DreamsAnthropicTransientError(
      `Anthropic Dreams transient failure after ${MAX_RETRY_ATTEMPTS} attempts: ${lastErr?.message ?? 'unknown'}`,
    );
  }

  /** Throws if the rolling-24h spend for this agent would exceed the budget. */
  private async assertBudget(agentId: string, pool: Pool): Promise<void> {
    if (this.budgetUsdMicros <= 0) return;
    const { rows } = await pool.query<{ spent: string | null }>(
      `SELECT COALESCE(SUM(cost_usd_micros), 0)::text AS spent
         FROM dream_runs
        WHERE agent_id = $1
          AND source = 'anthropic'
          AND created_at > now() - interval '24 hours'`,
      [agentId],
    );
    const spent = parseInt(rows[0]?.spent ?? '0', 10);
    if (spent >= this.budgetUsdMicros) {
      throw new DreamsAnthropicBudgetError(
        `Anthropic Dreams budget exceeded for agent ${agentId}: ${spent} micros spent in last 24h, cap=${this.budgetUsdMicros}`,
      );
    }
  }
}

/** Auth error — never falls back. */
export class DreamsAnthropicAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DreamsAnthropicAuthError';
  }
}

/** Transient error (5xx/429/network) — caller may fall back to local cycle. */
export class DreamsAnthropicTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DreamsAnthropicTransientError';
  }
}

/** Budget guardrail — fails the run rather than overspending. */
export class DreamsAnthropicBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DreamsAnthropicBudgetError';
  }
}

// ─── Memory-store mapper ───────────────────────────────────────────────────
//
// Convert a slice of warm rows into the shape Anthropic Dreams expects, and
// merge the curated output back into MemForge. The mapper is intentionally
// minimal — content + a small metadata envelope — so neither side leaks
// implementation detail.

export function warmRowsToMemoryStore(rows: WarmRow[]): AnthropicMemoryRecord[] {
  return rows.map((r) => ({
    id: String(r.id),
    content: r.content,
    metadata: {
      importance: (r.metadata as { importance?: number } | null)?.importance ?? null,
      confidence: (r.metadata as { confidence?: number } | null)?.confidence ?? null,
      consolidated_at: r.consolidated_at instanceof Date
        ? r.consolidated_at.toISOString()
        : r.consolidated_at,
      namespace: r.namespace,
      session_id: r.session_id,
    },
  }));
}

/**
 * Apply Anthropic's curated output back to warm_tier. Reconciliation policy:
 *   - Anthropic wins `content` (and dedup status — rows missing from output
 *     are NOT auto-deleted; the local triage phase still owns eviction)
 *   - MemForge wins `importance`, `confidence`, `valid_until`, and graph
 *     metadata (Anthropic's curation is general; MemForge's scoring is
 *     domain-specific)
 *
 * Returns the count of warm rows whose content was updated.
 */
export async function applyAnthropicOutput(
  pool: Pool,
  agentId: string,
  records: AnthropicMemoryRecord[],
  dreamRunId: string,
): Promise<{ updated: number }> {
  let updated = 0;
  for (const rec of records) {
    if (!rec.id) continue;
    let warmId: bigint;
    try {
      warmId = BigInt(rec.id);
    } catch {
      continue;
    }
    const result = await pool.query(
      `UPDATE warm_tier
          SET content = $3,
              metadata = COALESCE(metadata, '{}'::jsonb)
                       || jsonb_build_object('_anthropic_curated_at', now(),
                                             '_anthropic_dream_run', $4::text)
        WHERE id = $1 AND agent_id = $2
          AND content IS DISTINCT FROM $3`,
      [warmId, agentId, rec.content, dreamRunId],
    );
    updated += result.rowCount ?? 0;
  }
  if (updated > 0) {
    log.info({ agentId, dreamRunId, updated }, 'applied Anthropic Dreams curation');
  }
  return { updated };
}

// ─── Pricing estimate ──────────────────────────────────────────────────────
//
// Cost is approximate — we don't have authoritative Anthropic Dreams pricing
// at the time of writing, so we use Claude Sonnet messages-API rates as a
// proxy. The figure goes into `dream_runs.cost_usd_micros` for budget
// enforcement; refine when Anthropic publishes per-dream pricing.

const PRICE_PER_M_TOKENS_USD_MICROS: Record<string, { in: number; out: number }> = {
  // $3/M input, $15/M output → micros: 3_000_000, 15_000_000
  'claude-sonnet-4-6': { in: 3_000_000, out: 15_000_000 },
  // Opus rates — $15/M in, $75/M out
  'claude-opus-4-7': { in: 15_000_000, out: 75_000_000 },
};

function estimateCostUsdMicros(model: string, inTokens: number, outTokens: number): number {
  const rates = PRICE_PER_M_TOKENS_USD_MICROS[model]
    ?? PRICE_PER_M_TOKENS_USD_MICROS['claude-sonnet-4-6']!;
  const inMicros = Math.floor((inTokens / 1_000_000) * rates.in);
  const outMicros = Math.floor((outTokens / 1_000_000) * rates.out);
  return inMicros + outMicros;
}
