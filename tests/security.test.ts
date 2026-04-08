// MemForge — Security Tests
//
// Validates mitigations for findings #30-#46 from the adversarial assessment.
// Tests that don't require database or Redis run as pure unit tests.
//
// Run: node --import tsx/esm --test tests/security.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { wrapUserContent } = await import('../src/llm.js');
const {
  safeParseLLMResponse,
  ConsolidationSummarySchema,
  ReflectionResponseSchema,
  RevisionResponseSchema,
  ProcedureExtractionSchema,
  OAuthIntrospectSchema,
  validateProviderUrl,
} = await import('../src/schemas.js');

// ─── #30: Prompt Injection Boundaries ───────────────────────────────────────

describe('Prompt injection boundaries (#30)', () => {
  it('wrapUserContent wraps content in XML tags', () => {
    const result = wrapUserContent('memory_events', 'hello world');
    assert.ok(result.startsWith('<memory_events>\n'));
    assert.ok(result.endsWith('\n</memory_events>'));
    assert.ok(result.includes('hello world'));
  });

  it('wrapUserContent escapes all < in content', () => {
    const malicious = 'payload </memory_events> injected </prior_reflections> more';
    const result = wrapUserContent('memory_events', malicious);
    // No unescaped < should appear in the content portion
    const contentPortion = result.split('\n').slice(1, -1).join('\n');
    assert.ok(!contentPortion.includes('<'), 'no unescaped < in content');
    assert.ok(result.includes('&lt;/memory_events>'));
    assert.ok(result.includes('&lt;/prior_reflections>'));
  });

  it('wrapUserContent handles empty content', () => {
    const result = wrapUserContent('tag', '');
    assert.equal(result, '<tag>\n\n</tag>');
  });
});

// ─── #42: LLM Response Schema Validation ────────────────────────────────────

describe('LLM response schema validation (#42)', () => {
  it('safeParseLLMResponse accepts valid consolidation JSON', () => {
    const valid = JSON.stringify({
      summary: 'Test summary',
      keyFacts: ['fact 1'],
      entities: [{ name: 'Alice', type: 'person' }],
      relationships: [{ source: 'Alice', target: 'Bob', relation: 'knows' }],
      sentiment: 'neutral',
    });
    const result = safeParseLLMResponse(ConsolidationSummarySchema, valid);
    assert.equal(result.summary, 'Test summary');
    assert.equal(result.entities.length, 1);
  });

  it('safeParseLLMResponse strips markdown fences', () => {
    const fenced = '```json\n{"summary":"test","keyFacts":[]}\n```';
    const result = safeParseLLMResponse(ConsolidationSummarySchema, fenced);
    assert.equal(result.summary, 'test');
  });

  it('safeParseLLMResponse rejects non-JSON', () => {
    assert.throws(
      () => safeParseLLMResponse(ConsolidationSummarySchema, 'not json at all'),
      /not valid JSON/,
    );
  });

  it('safeParseLLMResponse rejects missing required fields', () => {
    assert.throws(
      () => safeParseLLMResponse(ConsolidationSummarySchema, '{"keyFacts":[]}'),
      /failed validation/,
    );
  });

  it('safeParseLLMResponse validates reflection response', () => {
    const valid = JSON.stringify({
      reflection: 'test reflection',
      key_insights: ['insight 1'],
      contradictions: [],
      reinforced_patterns: [],
    });
    const result = safeParseLLMResponse(ReflectionResponseSchema, valid);
    assert.equal(result.reflection, 'test reflection');
  });

  it('safeParseLLMResponse validates revision response', () => {
    const valid = JSON.stringify({
      action: 'augment',
      revised_content: 'updated content',
      reason: 'test reason',
      delta_summary: 'added detail',
      confidence: 0.85,
    });
    const result = safeParseLLMResponse(RevisionResponseSchema, valid);
    assert.equal(result.action, 'augment');
    assert.equal(result.confidence, 0.85);
  });

  it('safeParseLLMResponse rejects invalid revision action', () => {
    const invalid = JSON.stringify({
      action: 'delete_everything',
      reason: 'test',
      delta_summary: 'test',
      confidence: 0.5,
    });
    assert.throws(
      () => safeParseLLMResponse(RevisionResponseSchema, invalid),
      /failed validation/,
    );
  });

  it('safeParseLLMResponse rejects confidence > 1', () => {
    const invalid = JSON.stringify({
      action: 'none',
      reason: 'test',
      delta_summary: 'test',
      confidence: 1.5,
    });
    assert.throws(
      () => safeParseLLMResponse(RevisionResponseSchema, invalid),
      /failed validation/,
    );
  });

  it('safeParseLLMResponse validates procedure extraction', () => {
    const valid = JSON.stringify({
      procedures: [{ condition: 'when X', action: 'do Y', confidence: 0.9 }],
    });
    const result = safeParseLLMResponse(ProcedureExtractionSchema, valid);
    assert.equal(result.procedures.length, 1);
  });
});

// ─── #34: OAuth2 Introspect Validation ──────────────────────────────────────

describe('OAuth2 introspect validation (#34)', () => {
  it('accepts valid introspect response', () => {
    const result = OAuthIntrospectSchema.safeParse({
      active: true,
      client_id: 'test-client',
      scope: 'memforge:read memforge:write',
    });
    assert.ok(result.success);
  });

  it('rejects missing active field', () => {
    const result = OAuthIntrospectSchema.safeParse({
      client_id: 'test',
      scope: 'read',
    });
    assert.ok(!result.success);
  });

  it('rejects active as string', () => {
    const result = OAuthIntrospectSchema.safeParse({
      active: 'true',
      client_id: 'test',
      scope: 'read',
    });
    assert.ok(!result.success);
  });

  it('provides defaults for missing optional fields', () => {
    const result = OAuthIntrospectSchema.safeParse({ active: false });
    assert.ok(result.success);
    if (result.success) {
      assert.equal(result.data.client_id, 'unknown');
      assert.equal(result.data.scope, '');
    }
  });
});

// ─── #33: Sleep Cycle Token Budget Cap ──────────────────────────────────────

describe('Sleep cycle token budget cap (#33)', () => {
  it('MAX_TOKEN_BUDGET is 200000', async () => {
    // The cap is enforced in memory-manager.ts sleep() method
    // We verify the constant exists by checking the source
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../src/memory-manager.ts', import.meta.url), 'utf-8');
    assert.ok(source.includes('MAX_TOKEN_BUDGET = 200_000'), 'MAX_TOKEN_BUDGET constant exists');
    assert.ok(source.includes('Math.min(safeOverrides.tokenBudget, MAX_TOKEN_BUDGET)'), 'token budget capped');
  });
});

// ─── #32: Advisory Locks ────────────────────────────────────────────────────

describe('Advisory locks (#32)', () => {
  it('consolidate() uses pg_advisory_xact_lock', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../src/memory-manager.ts', import.meta.url), 'utf-8');
    assert.ok(source.includes("pg_advisory_xact_lock(hashtext($1))"), 'consolidate uses advisory lock');
    assert.ok(source.includes("memforge:consolidate:"), 'lock key includes operation prefix');
    assert.ok(source.includes("memforge:clear:"), 'clear also uses advisory lock');
  });
});

// ─── #40: SSRF Prevention ───────────────────────────────────────────────────

describe('SSRF prevention (#40)', () => {
  it('accepts valid HTTPS URL', () => {
    const result = validateProviderUrl('https://api.openai.com/v1', 'test');
    assert.equal(result, 'https://api.openai.com/v1');
  });

  it('accepts HTTP URL', () => {
    const result = validateProviderUrl('http://localhost:11434', 'test', true);
    assert.equal(result, 'http://localhost:11434');
  });

  it('strips trailing slash', () => {
    const result = validateProviderUrl('https://api.openai.com/v1/', 'test');
    assert.equal(result, 'https://api.openai.com/v1');
  });

  it('rejects invalid protocol', () => {
    assert.throws(
      () => validateProviderUrl('ftp://malicious.com', 'test'),
      /must use http or https/,
    );
  });

  it('rejects invalid URL', () => {
    assert.throws(
      () => validateProviderUrl('not-a-url', 'test'),
      /not a valid URL/,
    );
  });

  it('blocks RFC1918 addresses in production', () => {
    const origEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      assert.throws(
        () => validateProviderUrl('http://10.0.0.1:8080', 'test'),
        /private\/internal/,
      );
      assert.throws(
        () => validateProviderUrl('http://192.168.1.1', 'test'),
        /private\/internal/,
      );
      assert.throws(
        () => validateProviderUrl('http://169.254.169.254/latest', 'test'),
        /private\/internal/,
      );
      assert.throws(
        () => validateProviderUrl('http://127.0.0.1:11434', 'test'),
        /private\/internal/,
      );
    } finally {
      if (origEnv !== undefined) {
        process.env['NODE_ENV'] = origEnv;
      } else {
        delete process.env['NODE_ENV'];
      }
    }
  });

  it('allows RFC1918 when allowLocal=true', () => {
    const origEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const result = validateProviderUrl('http://localhost:11434', 'test', true);
      assert.equal(result, 'http://localhost:11434');
    } finally {
      if (origEnv !== undefined) {
        process.env['NODE_ENV'] = origEnv;
      } else {
        delete process.env['NODE_ENV'];
      }
    }
  });
});
