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
