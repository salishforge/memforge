// MemForge — Zod schemas for runtime validation
//
// Single source of truth for validating:
//   - LLM response JSON (consolidation, reflection, revision, procedures)
//   - OAuth2 introspect responses
//   - Cache values
//
// Usage:
//   import { safeParseLLMResponse, ConsolidationSummarySchema } from './schemas.js';
//   const result = safeParseLLMResponse(ConsolidationSummarySchema, rawText);

import { z } from 'zod';
import { getLogger } from './logger.js';

const log = getLogger('schemas');

// ─── Namespace Validator ────────────────────────────────────────────────────
// Safe-URL-ish token: lowercase letters, digits, underscore, hyphen.
// Min length 1, max 128. Leading character must be alphanumeric.
// Examples: 'default', 'frontend', 'ops-team', 'project_x42'
export const NamespaceSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'namespace must start with a letter or digit and contain only letters, digits, underscores, or hyphens');

// ─── Session ID Validator ───────────────────────────────────────────────────
// Same character class as namespace, slightly longer max to accommodate UUIDs
// or composite ids like 'claude-desktop-<uuid>'. Used for per-device hot-tier
// isolation when the same agent writes from multiple devices simultaneously.
export const SessionIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'session_id must start with a letter or digit and contain only letters, digits, underscores, or hyphens');

// Request schema helpers for methods that accept an optional namespace
export const NamespacedRequestSchema = z.object({
  namespace: NamespaceSchema.optional(),
});

// Per-route request schemas — each extends the base namespace holder.

export const AddMemorySchema = z.object({
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  outcome_type: z.string().optional(),
  hints: z.record(z.string(), z.unknown()).optional(),
  namespace: NamespaceSchema.optional(),
  session_id: SessionIdSchema.optional(),
});

export const ConsolidateSchema = z.object({
  mode: z.enum(['concat', 'summarize']).optional(),
  namespace: NamespaceSchema.optional(),
  /** Override the warm-tier target namespace; defaults from config. */
  target_namespace: NamespaceSchema.optional(),
});

// ─── Admin Config Reload ────────────────────────────────────────────────────
// Reloadable keys are intentionally a small allowlist of operational knobs.
// Static infrastructure (DATABASE_URL, port, ADMIN_TOKEN, RLS policies) is
// NOT reloadable — changing those mid-flight is unsafe and tools that need
// to do so should restart the process.
export const RELOADABLE_CONFIG_KEYS = [
  'WARM_CONSOLIDATION_TARGET',
  'CONSOLIDATION_MODE',
  'ENABLE_LLM_RERANK',
  'ENABLE_LLM_INGEST',
  'CONSOLIDATION_THRESHOLD',
  'CONSOLIDATION_BATCH_SIZE',
  'CONSOLIDATION_INNER_BATCH_SIZE',
  'TEMPORAL_DECAY_RATE',
  'KEYWORD_OVERLAP_BOOST',
  'TEMPORAL_PROXIMITY_DAYS',
] as const;

// Per-key value validators for the reload allowlist. Each shape constrains
// the value at the boundary so a compromised admin token cannot push a
// malformed value that would only be caught (or — worse — only crash) at
// the downstream use-site. Defense in depth: every consumer also re-validates
// at use-time.
const BoolStringSchema = z.enum(['true', 'false']);
const NonNegIntStringSchema = z.string().regex(/^\d+$/, 'must be a non-negative integer string');
const NonNegFloatStringSchema = z.string().regex(/^(\d+(\.\d+)?|\.\d+)$/, 'must be a non-negative number string');

const ConfigOverridesSchema = z.object({
  WARM_CONSOLIDATION_TARGET: NamespaceSchema.optional(),
  CONSOLIDATION_MODE: z.enum(['concat', 'summarize']).optional(),
  ENABLE_LLM_RERANK: BoolStringSchema.optional(),
  ENABLE_LLM_INGEST: BoolStringSchema.optional(),
  CONSOLIDATION_THRESHOLD: NonNegIntStringSchema.optional(),
  CONSOLIDATION_BATCH_SIZE: NonNegIntStringSchema.optional(),
  CONSOLIDATION_INNER_BATCH_SIZE: NonNegIntStringSchema.optional(),
  TEMPORAL_DECAY_RATE: NonNegFloatStringSchema.optional(),
  KEYWORD_OVERLAP_BOOST: NonNegFloatStringSchema.optional(),
  TEMPORAL_PROXIMITY_DAYS: NonNegFloatStringSchema.optional(),
}).strict();

export const ConfigReloadSchema = z.object({
  /**
   * Optional explicit overrides. When omitted, reload re-reads process.env
   * for every allowlisted key. When provided, only the listed keys are
   * updated (the remainder keep their current value). Values are validated
   * per-key (e.g. WARM_CONSOLIDATION_TARGET must be a valid namespace token).
   */
  overrides: ConfigOverridesSchema.optional(),
});

// Sleep is agent-wide — it runs the 10-phase cycle across all namespaces for
// the agent. Namespace-scoped sleep would require extending every sleep phase
// to filter by namespace; tracked as a future enhancement. The schema
// intentionally does NOT accept a namespace field so the API doesn't claim
// behavior it cannot deliver.
//
// `instructions` and `output_mode` were added in v3.6 (Claude Dreaming) and
// only take effect when the route plumbs them through; legacy callers still
// see identical behavior.
export const SleepSchema = z.object({
  tokenBudget: z.number().optional(),
  evictionThreshold: z.number().optional(),
  revisionThreshold: z.number().optional(),
  includeReflection: z.boolean().optional(),
  instructions: z.string().max(4096).optional(),
  output_mode: z.enum(['in_place', 'new_namespace']).optional(),
});

// ─── Dream Runs (Claude Dreaming compatibility, v3.6) ───────────────────────
// Native MemForge async-job shape. The Drop-in `/v1/dreams` schema in v3.7
// remaps Anthropic's snake_case fields onto these.

export const DreamStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'canceled']);
export const DreamSourceSchema = z.enum(['local', 'anthropic', 'bridge_pull', 'bridge_push']);
export const DreamOutputModeSchema = z.enum(['in_place', 'new_namespace']);

export const CreateDreamRunSchema = z.object({
  namespace: NamespaceSchema.optional(),
  /** Hard-capped at 100 to match Anthropic Dreams' session_ids[] cap. */
  session_ids: z.array(SessionIdSchema).max(100).optional(),
  model: z.string().min(1).max(128).optional(),
  instructions: z.string().max(4096).optional(),
  source: DreamSourceSchema.optional(),
  output_mode: DreamOutputModeSchema.optional(),
  /** Per-run sleep config overrides — same shape as SleepSchema sans output_mode/instructions. */
  sleep: z.object({
    tokenBudget: z.number().int().positive().optional(),
    evictionThreshold: z.number().min(0).max(1).optional(),
    revisionThreshold: z.number().min(0).max(1).optional(),
    includeReflection: z.boolean().optional(),
  }).optional(),
});

export const ListDreamRunsQuerySchema = z.object({
  status: DreamStatusSchema.optional(),
  source: DreamSourceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Drop-in: Anthropic Dreams API shape (Layer 2) ──────────────────────────
//
// Mirrors POST /v1/dreams from the Anthropic Managed Agents API
// (beta `dreaming-2026-04-21`) so SDK callers can swap base URLs and
// keep their request/response code unchanged. `memory_store_id` is
// treated as the MemForge `agent_id` directly — see the /v1/dreams
// route handler in app.ts for the mapping rationale.
//
// strict() so a typo in field names produces an explicit 400 rather
// than a silent default.
export const AnthropicDreamCreateSchema = z.object({
  memory_store_id: z.string().min(1).max(256),
  session_ids: z.array(z.string().min(1).max(256)).max(100).optional(),
  model: z.string().min(1).max(128),
  instructions: z.string().max(4096).optional(),
}).strict();

export const ImportSchema = z.object({
  lines: z.array(z.string()).optional(),
  namespace: NamespaceSchema.optional(),
});

export const ColdTierSearchSchema = z.object({
  q: z.string().max(10_000).optional(),
  namespace: NamespaceSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  source_table: z.enum(['hot_tier', 'warm_tier']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ColdTierRestoreSchema = z.object({
  cold_id: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
  namespace: NamespaceSchema.optional(),
});

export const PublishProceduresSchema = z.object({
  min_confidence: z.number().min(0).max(1).default(0),
  namespace: NamespaceSchema.optional(),
});

export const DeclareRoleSchema = z.object({
  domain: z.string().min(1).max(128),
  confidence: z.number().min(0).max(1).optional(),
  description: z.string().max(1_000).optional(),
});

// ─── LLM Response Schemas ───────────────────────────────────────────────────

export const ConsolidationSummarySchema = z.object({
  summary: z.string().min(1).max(10_000),
  keyFacts: z.array(z.string()).max(50).default([]),
  entities: z.array(z.object({
    name: z.string().min(1).max(500),
    type: z.string().min(1).max(100),
  })).max(100).default([]),
  relationships: z.array(z.object({
    source: z.string().min(1).max(500),
    target: z.string().min(1).max(500),
    relation: z.string().min(1).max(500),
  })).max(100).default([]),
  sentiment: z.enum(['neutral', 'positive', 'negative', 'mixed', 'urgent']).default('neutral'),
});


export const ReflectionResponseSchema = z.object({
  reflection: z.string().min(1).max(10_000),
  key_insights: z.array(z.string()).max(20).default([]),
  contradictions: z.array(z.string()).max(20).default([]),
  reinforced_patterns: z.array(z.string()).max(20).default([]),
});


export const RevisionResponseSchema = z.object({
  action: z.enum(['none', 'augment', 'correct', 'merge', 'compress']),
  revised_content: z.string().max(50_000).optional(),
  reason: z.string().min(1).max(2_000),
  delta_summary: z.string().max(1_000),
  confidence: z.number().min(0).max(1),
});


export const ProcedureExtractionSchema = z.object({
  procedures: z.array(z.object({
    condition: z.string().min(1).max(2_000),
    action: z.string().min(1).max(2_000),
    confidence: z.number().min(0).max(1),
  })).max(10).default([]),
});


// ─── OAuth2 Introspect Schema ───────────────────────────────────────────────

export const OAuthIntrospectSchema = z.object({
  active: z.boolean(),
  client_id: z.string().default('unknown'),
  scope: z.string().default(''),
});

export type ValidatedOAuthIntrospect = z.infer<typeof OAuthIntrospectSchema>;

// ─── Helper: Parse and validate LLM response ───────────────────────────────

/**
 * Strips markdown fences from LLM output, parses JSON, and validates
 * against the provided Zod schema. Throws a descriptive error on failure.
 */
export function safeParseLLMResponse<T>(schema: z.ZodType<T>, raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const preview = cleaned.slice(0, 200);
    throw new Error(`LLM response is not valid JSON: ${preview}...`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    log.warn({ issues: result.error.issues, preview: cleaned.slice(0, 200) }, 'LLM response failed schema validation');
    throw new Error(`LLM response failed validation: ${issues}`);
  }

  return result.data;
}

// ─── Provider URL Validation ────────────────────────────────────────────────

// IPv4 private/loopback/link-local ranges
const PRIVATE_IPV4_PATTERN = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|169\.254\.)/;
// IPv6 private (fc00::/7), link-local (fe80::/10), loopback (::1)
const PRIVATE_IPV6_PATTERN = /^(fc|fd|fe[89ab]|::1$|\[?(fc|fd|fe[89ab]))/i;

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') return true;
  if (PRIVATE_IPV4_PATTERN.test(hostname)) return true;
  if (PRIVATE_IPV6_PATTERN.test(hostname)) return true;
  // Block decimal/hex IP shorthand (e.g., 2130706433 = 127.0.0.1, 0x7f000001)
  if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) return true;
  return false;
}

/**
 * Validates a provider base URL. In production, blocks RFC1918/link-local/IPv6 private addresses.
 * Always requires http or https protocol.
 */
export function validateProviderUrl(url: string, providerName: string, allowLocal = false): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${providerName} baseUrl is not a valid URL: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${providerName} baseUrl must use http or https`);
  }

  if (process.env['NODE_ENV'] === 'production' && !allowLocal) {
    const hostname = parsed.hostname;
    if (isPrivateHost(hostname)) {
      throw new Error(`${providerName} baseUrl must not point to private/internal networks in production (got ${hostname})`);
    }
  }

  return url.replace(/\/$/, '');
}
