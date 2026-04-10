// MemForge — LLM-dependent path tests
//
// Tests all code paths that require an LLM or embedding provider:
// summarize consolidation, reflection, meta-reflection, sleep cycle revision,
// procedure extraction, semantic search, and hybrid search.
//
// Requires: DATABASE_URL pointing to a test database with schema applied.
//
// Run: node --import tsx/esm --test tests/llm-paths.test.ts

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { MemoryManager } = await import('../src/memory-manager.js');
const { MockLLMProvider } = await import('./mocks/mock-llm-provider.js');
const { MockEmbeddingProvider } = await import('./mocks/mock-embedding-provider.js');
const { closePool } = await import('../src/db.js');

// ─── Setup ──────────────────────────────────────────────────────────────────

const TEST_AGENT = 'test-agent-llm-paths';
const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const mockLlm = new MockLLMProvider();
const mockEmbedding = new MockEmbeddingProvider();

function createManager(opts?: { llm?: MockLLMProvider | null; embedding?: MockEmbeddingProvider }): InstanceType<typeof MemoryManager> {
  return new MemoryManager({
    databaseUrl: DATABASE_URL,
    consolidationBatchSize: 500,
    consolidationThreshold: 1,
    autoRegisterAgents: true,
    consolidationMode: 'summarize',
    temporalDecayRate: 0,
    embeddingProvider: opts?.embedding ?? mockEmbedding,
    llmProvider: opts?.llm ?? mockLlm,
    sleepCycle: {
      tokenBudget: 100_000,
      evictionThreshold: 0.1,
      revisionThreshold: 0.4,
      includeReflection: false,
      weights: { recency: 0.25, frequency: 0.20, centrality: 0.20, reflection: 0.15, stability: 0.20 },
    },
  });
}

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM audit_chain WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM memory_revisions WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM procedures WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM reflections WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier_entities WHERE warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = $1)`, [TEST_AGENT]);
  await pool.query(`DELETE FROM relationships WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM entities WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM cold_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM consolidation_log WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

// ─── Summarize Consolidation ────────────────────────────────────────────────

describe('Summarize consolidation (LLM)', () => {
  const manager = createManager();

  before(async () => {
    await cleanup();
    mockLlm.reset();
    mockEmbedding.reset();
  });
  after(cleanup);

  it('calls LLM summarize and stores structured output', async () => {
    // Add enough memories to trigger consolidation
    await manager.add(TEST_AGENT, 'Alice deployed ProjectX to staging');
    await manager.add(TEST_AGENT, 'ProjectX passed all integration tests');
    await manager.add(TEST_AGENT, 'Alice approved the release for production');

    const result = await manager.consolidate(TEST_AGENT, 'summarize');

    // LLM was called
    assert.equal(mockLlm.summarizeCalls.length, 1, 'summarize should be called once');
    assert.ok(mockLlm.summarizeCalls[0]!.rawContent.includes('Alice deployed'), 'raw content passed to LLM');

    // Warm tier has the mock summary
    assert.ok(result.warm_rows_created > 0, 'warm tier entries created');
  });

  it('creates entities from LLM-extracted data', async () => {
    const entities = await manager.searchEntities(TEST_AGENT);
    const names = entities.map((e: { name: string }) => e.name);
    assert.ok(names.includes('Alice'), 'Alice entity created from mock summary');
    assert.ok(names.includes('ProjectX'), 'ProjectX entity created from mock summary');
  });

  it('creates relationships from LLM-extracted data', async () => {
    const graph = await manager.graphTraverse(TEST_AGENT, 'Alice', 1);
    assert.ok(graph.edges.length > 0, 'relationships created from mock summary');
  });

  it('generates embeddings for warm tier entries', async () => {
    assert.ok(mockEmbedding.embedCalls.length > 0, 'embedding provider was called during consolidation');
  });
});

// ─── Reflection ─────────────────────────────────────────────────────────────

describe('Reflection (LLM)', () => {
  const manager = createManager();

  before(async () => {
    await cleanup();
    mockLlm.reset();
    mockEmbedding.reset();

    // Seed warm-tier memories via consolidation
    for (let i = 0; i < 5; i++) {
      await manager.add(TEST_AGENT, `Memory event ${i}: important observation about system behavior`);
    }
    await manager.consolidate(TEST_AGENT, 'summarize');
    mockLlm.reset(); // Reset call counts after consolidation
  });
  after(cleanup);

  it('calls LLM chat with reflection system prompt', async () => {
    const result = await manager.reflect(TEST_AGENT, 'manual', 20);

    assert.equal(mockLlm.chatCalls.length, 2, 'chat called for reflection + procedure extraction');
    const reflectionCall = mockLlm.chatCalls[0]!;
    assert.ok(reflectionCall.systemPrompt.includes('reflection engine'), 'reflection system prompt used');
  });

  it('stores reflection with insights', async () => {
    const reflections = await manager.getReflections(TEST_AGENT, 10);
    assert.ok(reflections.length > 0, 'reflection stored');

    const r = reflections[0] as { content: string; key_insights: string[] };
    assert.ok(r.content.includes('Mock reflection'), 'mock reflection content stored');
    assert.ok(r.key_insights.length >= 1, 'insights stored');
  });
});

// ─── Procedure Extraction ───────────────────────────────────────────────────

describe('Procedure extraction (LLM)', () => {
  const manager = createManager();

  before(async () => {
    await cleanup();
    mockLlm.reset();
    mockEmbedding.reset();

    // Create warm memories and a reflection (which triggers procedure extraction)
    for (let i = 0; i < 5; i++) {
      await manager.add(TEST_AGENT, `Procedure test event ${i}: when condition X then do Y`);
    }
    await manager.consolidate(TEST_AGENT, 'summarize');
    mockLlm.reset();
    await manager.reflect(TEST_AGENT, 'manual', 20);
  });
  after(cleanup);

  it('extracts procedures from reflection', async () => {
    const procedures = await manager.getProcedures(TEST_AGENT);
    assert.ok(procedures.length > 0, 'procedures extracted');

    const p = procedures[0] as { condition: string; action: string; confidence: number };
    assert.ok(p.condition.includes('deploying on Friday'), 'mock procedure condition stored');
    assert.ok(p.action.includes('validation checks'), 'mock procedure action stored');
    assert.ok(p.confidence > 0, 'confidence stored');
  });
});

// ─── Meta-Reflection ────────────────────────────────────────────────────────

describe('Meta-reflection (LLM)', () => {
  const manager = createManager();

  before(async () => {
    await cleanup();
    mockLlm.reset();
    mockEmbedding.reset();

    // Need at least 3 first-order reflections
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 3; i++) {
        await manager.add(TEST_AGENT, `Round ${round} event ${i}: observation about patterns`);
      }
      await manager.consolidate(TEST_AGENT, 'summarize');
      mockLlm.reset();
      await manager.reflect(TEST_AGENT, 'manual', 20);
    }
    mockLlm.reset();
  });
  after(cleanup);

  it('calls LLM chat with meta-reflection prompt', async () => {
    const result = await manager.metaReflect(TEST_AGENT, 10);

    assert.ok(mockLlm.chatCalls.length >= 1, 'chat called for meta-reflection');
    const metaCall = mockLlm.chatCalls[0]!;
    assert.ok(
      metaCall.systemPrompt.includes('meta-reflection') || metaCall.systemPrompt.includes('second-order'),
      'meta-reflection system prompt used',
    );

    assert.ok(result.insights_count > 0, 'meta-reflection has insights');
    assert.equal(result.reflection_level, 2, 'reflection level is 2');
  });

  it('stores meta-reflection in reflections table', async () => {
    const reflections = await manager.getReflections(TEST_AGENT, 20);
    const metaReflections = reflections.filter((r: { reflection_level: number }) => r.reflection_level === 2);
    assert.ok(metaReflections.length > 0, 'meta-reflection stored');
  });
});

// ─── Sleep Cycle Revision ───────────────────────────────────────────────────

describe('Sleep cycle revision (LLM)', () => {
  const manager = createManager();

  before(async () => {
    await cleanup();
    mockLlm.reset();
    mockEmbedding.reset();

    // Create warm memories, then lower their confidence to trigger revision
    for (let i = 0; i < 3; i++) {
      await manager.add(TEST_AGENT, `Low confidence memory ${i}: uncertain information`);
    }
    await manager.consolidate(TEST_AGENT, 'summarize');

    // Set low confidence on warm-tier rows to trigger Phase 3 revision
    await pool.query(
      `UPDATE warm_tier SET confidence = 0.2 WHERE agent_id = $1`,
      [TEST_AGENT],
    );
    mockLlm.reset();
    mockEmbedding.reset();
  });
  after(cleanup);

  it('revises low-confidence memories during sleep cycle', async () => {
    const result = await manager.sleep(TEST_AGENT, {
      revisionThreshold: 0.4,
      includeReflection: false,
    });

    assert.ok(result.phase3_revised > 0, 'at least one memory revised');
    assert.ok(mockLlm.chatCalls.length > 0, 'LLM called for revision');

    const revisionCall = mockLlm.chatCalls[0]!;
    assert.ok(revisionCall.systemPrompt.includes('memory revision engine'), 'revision system prompt used');
  });

  it('creates revision history records', async () => {
    const revisions = await pool.query(
      `SELECT * FROM memory_revisions WHERE agent_id = $1 ORDER BY created_at`,
      [TEST_AGENT],
    );
    assert.ok(revisions.rows.length > 0, 'revision history recorded');

    const rev = revisions.rows[0] as { revision_type: string; new_content: string };
    assert.equal(rev.revision_type, 'augment', 'revision type from mock response');
    assert.ok(rev.new_content.includes('Augmented mock memory'), 'revised content from mock response');
  });

  it('updates warm-tier content after revision', async () => {
    const warm = await pool.query(
      `SELECT content, confidence FROM warm_tier WHERE agent_id = $1`,
      [TEST_AGENT],
    );
    assert.ok(warm.rows.length > 0);

    // At least one memory should have the revised content
    const hasRevised = warm.rows.some((r: { content: string }) =>
      r.content.includes('Augmented mock memory'),
    );
    assert.ok(hasRevised, 'warm tier has revised content');
  });

  it('re-embeds revised memories', async () => {
    assert.ok(mockEmbedding.embedCalls.length > 0, 'embedding provider called for re-embedding after revision');
  });
});

// ─── Semantic Search ────────────────────────────────────────────────────────

describe('Semantic search (embedding)', () => {
  const manager = createManager();

  before(async () => {
    await cleanup();
    mockLlm.reset();
    mockEmbedding.reset();

    // Create memories with embeddings
    await manager.add(TEST_AGENT, 'The deployment pipeline uses GitHub Actions');
    await manager.add(TEST_AGENT, 'Database backups run every 6 hours');
    await manager.add(TEST_AGENT, 'Alice manages the infrastructure team');
    await manager.consolidate(TEST_AGENT, 'summarize');
    mockEmbedding.reset(); // Reset so we can count query-time calls
  });
  after(cleanup);

  it('uses embedding provider for semantic queries', async () => {
    const results = await manager.query(TEST_AGENT, {
      q: 'deployment process',
      mode: 'semantic',
      limit: 5,
    });

    assert.ok(mockEmbedding.embedCalls.length > 0, 'embed called for query vector');
    assert.equal(mockEmbedding.embedCalls[0], 'deployment process', 'query text embedded');
    assert.ok(Array.isArray(results), 'results returned');
  });
});

// ─── Hybrid Search ──────────────────────────────────────────────────────────

describe('Hybrid search (keyword + embedding)', () => {
  const manager = createManager();

  before(async () => {
    await cleanup();
    mockLlm.reset();
    mockEmbedding.reset();

    await manager.add(TEST_AGENT, 'Redis caching improves query performance');
    await manager.add(TEST_AGENT, 'PostgreSQL handles full-text search natively');
    await manager.consolidate(TEST_AGENT, 'summarize');
    mockEmbedding.reset();
  });
  after(cleanup);

  it('uses both keyword and semantic paths', async () => {
    const results = await manager.query(TEST_AGENT, {
      q: 'query performance',
      mode: 'hybrid',
      limit: 5,
    });

    assert.ok(mockEmbedding.embedCalls.length > 0, 'embed called for hybrid query');
    assert.ok(Array.isArray(results), 'results returned');
  });
});

// ─── Cleanup ────────────────────────────────────────────────────────────────

after(async () => {
  await pool.end();
  await closePool();
});
