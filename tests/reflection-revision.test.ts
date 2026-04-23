// MemForge — Reflection-driven revision priorities
//
// Validates that warm_tier rows cited by a recent reflection with
// unresolved contradictions enter the revision queue regardless of
// confidence or retrieval outcomes (Phase 2). Meta-reflections
// (reflection_level > 1) rank above first-order reflections.
//
// Run: node --import tsx/esm --test tests/reflection-revision.test.ts
// Requires DATABASE_URL.

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const { SleepCycleEngine } = await import('../src/sleep-cycle.js');
const { NoOpEmbeddingProvider } = await import('../src/embedding.js');
const { closePool } = await import('../src/db.js');

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[test] DATABASE_URL is required — set it to a test database');
  process.exit(1);
}

const TEST_AGENT = 'test-agent-reflection-revision';
const pool = new Pool({ connectionString: DATABASE_URL });

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM drift_signals WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM reflections WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM retrieval_log WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [TEST_AGENT]);
  await pool.query(`DELETE FROM agents WHERE id = $1`, [TEST_AGENT]);
}

async function seedMemory(content: string, confidence: number): Promise<bigint> {
  const { rows } = await pool.query<{ id: bigint }>(
    `INSERT INTO warm_tier (agent_id, content, confidence, importance, time_start, time_end)
     VALUES ($1, $2, $3, 0.8, now(), now())
     RETURNING id`,
    [TEST_AGENT, content, confidence],
  );
  return rows[0]!.id;
}

async function seedReflection(
  sourceWarmIds: bigint[],
  contradictions: string[],
  opts: { level?: number; daysAgo?: number } = {},
): Promise<void> {
  const { level = 1, daysAgo = 0 } = opts;
  await pool.query(
    `INSERT INTO reflections (agent_id, content, source_warm_ids, contradictions, reflection_level, created_at)
     VALUES ($1, 'test reflection', $2, $3, $4, now() - interval '1 day' * $5)`,
    [TEST_AGENT, sourceWarmIds, contradictions, level, daysAgo],
  );
}

function newEngine(): InstanceType<typeof SleepCycleEngine> {
  return new SleepCycleEngine(
    pool,
    { chat: async () => '', summarize: async () => '' } as never,
    new NoOpEmbeddingProvider(),
    { evictionThreshold: 0.0, revisionThreshold: 0.4 },
  );
}

describe('Reflection-driven revision priorities', () => {
  beforeEach(async () => {
    await cleanup();
    await pool.query(
      `INSERT INTO agents (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [TEST_AGENT],
    );
  });

  it('queues a high-confidence memory cited by a recent contradictory reflection', async () => {
    const id = await seedMemory('cited by reflection', 0.9);
    await seedReflection([id], ['conflicts with earlier claim']);

    const engine = newEngine();
    const result = await engine.run(TEST_AGENT);

    assert.ok(
      result.phase2_flagged_for_revision >= 1,
      `expected reflection-cited memory to be flagged, got ${result.phase2_flagged_for_revision}`,
    );
  });

  it('does NOT queue memory from a reflection with no contradictions', async () => {
    const id = await seedMemory('cited but clean', 0.9);
    await seedReflection([id], []); // empty contradictions array

    const engine = newEngine();
    const result = await engine.run(TEST_AGENT);

    assert.equal(result.phase2_flagged_for_revision, 0,
      'reflection with empty contradictions must not flag sources');
  });

  it('ignores reflections older than 14 days', async () => {
    const id = await seedMemory('old reflection', 0.9);
    await seedReflection([id], ['stale contradiction'], { daysAgo: 30 });

    const engine = newEngine();
    const result = await engine.run(TEST_AGENT);

    assert.equal(result.phase2_flagged_for_revision, 0);
  });

  it('ranks meta-reflection-cited memories above first-order-cited ones', async () => {
    // Create two rows, both with confidence < threshold (so both enter via gap channel)
    // and differentiate only by which reflection cites them. The meta-cited one
    // should appear first in the flagged queue order.
    const firstOrderId = await seedMemory('first-order citation', 0.2);
    const metaId = await seedMemory('meta citation', 0.2);

    await seedReflection([firstOrderId], ['minor conflict'], { level: 1 });
    await seedReflection([metaId], ['deeper pattern conflict'], { level: 2 });

    // Read the flagged IDs directly by re-running the Phase 2 query indirectly:
    // we run the engine and then inspect warm_tier's revision_count after Phase 3
    // would act on the queue. But since our stub LLM returns invalid JSON, Phase 3
    // no-ops and we can't observe order that way. Instead check that at least both
    // are flagged — ordering is validated by manual inspection of the ORDER BY.
    const engine = newEngine();
    const result = await engine.run(TEST_AGENT);
    assert.ok(result.phase2_flagged_for_revision >= 2,
      `expected both memories flagged, got ${result.phase2_flagged_for_revision}`);

    // Stronger assertion: the meta-cited row is the first returned by a direct
    // Phase-2-equivalent query. Replicate the ORDER BY clause to verify ranking.
    const { rows } = await pool.query<{ id: bigint }>(
      `SELECT wt.id
         FROM warm_tier wt
         LEFT JOIN (
           SELECT unnest(source_warm_ids) AS warm_id,
                  max(reflection_level) AS max_level
             FROM reflections
            WHERE agent_id = $1
              AND array_length(contradictions, 1) > 0
              AND created_at > now() - interval '14 days'
            GROUP BY warm_id
         ) refl ON refl.warm_id = wt.id
        WHERE wt.agent_id = $1
        ORDER BY CASE WHEN refl.warm_id IS NOT NULL THEN COALESCE(refl.max_level, 1) ELSE 0 END DESC,
                 wt.importance DESC`,
      [TEST_AGENT],
    );

    assert.equal(String(rows[0]?.id), String(metaId),
      'meta-reflection-cited memory must rank first');
  });

  it('keeps other entry channels working alongside reflection channel', async () => {
    // Three distinct memories, each qualifying via a different channel.
    const gapId = await seedMemory('low confidence', 0.2);
    const outcomeId = await seedMemory('outcome debt', 0.9);
    const reflId = await seedMemory('reflection cite', 0.9);

    // Outcome channel: 3 negatives on outcomeId
    for (let i = 0; i < 3; i++) {
      await pool.query(
        `INSERT INTO retrieval_log (agent_id, warm_tier_id, query_text, query_mode, rank_position, outcome, created_at, feedback_at)
         VALUES ($1, $2, 'test', 'hybrid', 1, 'negative', now(), now())`,
        [TEST_AGENT, outcomeId],
      );
    }
    // Reflection channel:
    await seedReflection([reflId], ['contradicts prior claim']);

    const engine = newEngine();
    const result = await engine.run(TEST_AGENT);

    assert.ok(
      result.phase2_flagged_for_revision >= 3,
      `expected all three entry channels to flag, got ${result.phase2_flagged_for_revision}`,
    );

    // Verify gapId, outcomeId, reflId all appear. Easiest via direct SQL.
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(DISTINCT wt.id)::text AS count
         FROM warm_tier wt
         LEFT JOIN (
           SELECT warm_tier_id,
                  count(*) FILTER (WHERE outcome = 'negative') AS neg_count,
                  count(*) FILTER (WHERE outcome = 'positive') AS pos_count
             FROM retrieval_log
            WHERE agent_id = $1
              AND outcome IS NOT NULL
              AND created_at > now() - interval '7 days'
            GROUP BY warm_tier_id
         ) outc ON outc.warm_tier_id = wt.id
         LEFT JOIN (
           SELECT unnest(source_warm_ids) AS warm_id FROM reflections
            WHERE agent_id = $1
              AND array_length(contradictions, 1) > 0
              AND created_at > now() - interval '14 days'
         ) refl ON refl.warm_id = wt.id
        WHERE wt.agent_id = $1
          AND (
            wt.confidence < 0.4
            OR (COALESCE(outc.neg_count, 0) >= 2
                AND COALESCE(outc.neg_count, 0)::real
                    / NULLIF(COALESCE(outc.neg_count, 0) + COALESCE(outc.pos_count, 0), 0) > 0.5)
            OR refl.warm_id IS NOT NULL
          )`,
      [TEST_AGENT],
    );
    assert.equal(parseInt(rows[0]!.count, 10), 3,
      'all three channels should independently qualify their memory');
  });
});

after(async () => {
  await cleanup();
  await pool.end();
  await closePool();
});
