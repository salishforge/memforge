// MemForge — benchmark scoring metric tests
//
// These exist because the published "93.2% R@5" was produced by a scorer with
// no test coverage, and it was not R@5: evaluate.ts called
// recallAtK(ids, answers, ids.length), so the slice never truncated and every
// k measured the same full candidate list. Consolidation packs many sessions
// into one warm row, so that list could hold hundreds of sessions.
//
// The guards below pin the distinction that made the old number wrong: a
// session-level metric must respect k, and the row-level metric must be
// reported separately rather than presented as R@k.
//
// Run: node --import tsx/esm --test tests/benchmark-metrics.test.ts
// Requires: no database.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractSessionIds,
  recallAtKSessions,
  recallAtKRows,
  percentile,
  latencyStats,
} from '../benchmarks/lib/metrics.js';

// ─── extractSessionIds ───────────────────────────────────────────────────────

describe('extractSessionIds', () => {
  it('pulls every marker in order of appearance', () => {
    const content = '[SESSION_ID:7] USER: hi\n\n[SESSION_ID:9] USER: bye';

    assert.deepEqual(extractSessionIds(content), ['7', '9']);
  });

  it('returns an empty array when no markers are present', () => {
    assert.deepEqual(extractSessionIds('plain warm-tier content'), []);
  });

  it('is repeatable across calls', () => {
    // The regex is module-level and /g-flagged. Reading it via exec without
    // resetting lastIndex made the second call skip matches; matchAll does
    // not share that state. Pinned because the failure is silent — the
    // scorer would quietly under-count retrieved sessions.
    const content = '[SESSION_ID:1] a [SESSION_ID:2] b';

    const first = extractSessionIds(content);
    const second = extractSessionIds(content);

    assert.deepEqual(first, ['1', '2']);
    assert.deepEqual(second, first, 'a second call must see the same markers');
  });
});

// ─── recallAtKSessions ───────────────────────────────────────────────────────

describe('recallAtKSessions', () => {
  const retrieved = ['10', '11', '12', '13', '14', '15'];

  it('scores a hit when the gold session is inside the first k', () => {
    assert.equal(recallAtKSessions(retrieved, ['12'], 3), 1);
  });

  it('scores a miss when the gold session falls outside the first k', () => {
    // THE REGRESSION GUARD. The previous scorer passed the array's own length
    // as k, so the slice never truncated and this case returned 1 — inflating
    // every reported R@1/R@3/R@5.
    assert.equal(recallAtKSessions(retrieved, ['15'], 3), 0);
  });

  it('respects k=1 strictly', () => {
    assert.equal(recallAtKSessions(retrieved, ['10'], 1), 1);
    assert.equal(recallAtKSessions(retrieved, ['11'], 1), 0);
  });

  it('is monotonic in k', () => {
    // A larger window can only help; a scorer that ignores k would return the
    // same value everywhere, which this would not catch alone — hence the
    // strict miss case above.
    const at1 = recallAtKSessions(retrieved, ['13'], 1);
    const at5 = recallAtKSessions(retrieved, ['13'], 5);

    assert.equal(at1, 0);
    assert.equal(at5, 1);
  });

  it('matches numeric gold ids against string session ids', () => {
    assert.equal(recallAtKSessions(['42'], [42 as unknown as string], 1), 1);
  });

  it('scores a miss with no gold sessions or no retrievals', () => {
    assert.equal(recallAtKSessions(retrieved, [], 5), 0);
    assert.equal(recallAtKSessions([], ['1'], 5), 0);
  });
});

// ─── recallAtKRows ───────────────────────────────────────────────────────────

describe('recallAtKRows', () => {
  // Row 0 packs three sessions — the shape consolidation actually produces.
  const perRow = [['1', '2', '3'], ['4', '5'], ['6']];

  it('scores a hit for any gold session inside the top-k rows', () => {
    assert.equal(recallAtKRows(perRow, ['3'], 1), 1, 'session 3 is packed into row 0');
  });

  it('excludes rows beyond k', () => {
    assert.equal(recallAtKRows(perRow, ['6'], 2), 0, 'session 6 lives in row 2');
    assert.equal(recallAtKRows(perRow, ['6'], 3), 1);
  });

  it('is at least as generous as the session metric under packing', () => {
    // This inequality is the whole reason both numbers are reported: with 3
    // sessions per row, R@1 over rows can hit where R@1 over sessions cannot.
    const flat = perRow.flat();

    assert.equal(recallAtKSessions(flat, ['3'], 1), 0);
    assert.equal(recallAtKRows(perRow, ['3'], 1), 1);
  });

  it('converges with the session metric when rows hold one session each', () => {
    const unpacked = [['1'], ['2'], ['3']];

    for (const k of [1, 2, 3]) {
      assert.equal(
        recallAtKRows(unpacked, ['2'], k),
        recallAtKSessions(unpacked.flat(), ['2'], k),
        `metrics must agree at k=${k} when packing is 1:1`,
      );
    }
  });
});

// ─── latency helpers ─────────────────────────────────────────────────────────

describe('percentile', () => {
  it('returns 0 for an empty set', () => {
    assert.equal(percentile([], 95), 0);
  });

  it('picks the expected element of a sorted set', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    assert.equal(percentile(sorted, 50), 5);
    assert.equal(percentile(sorted, 100), 10);
  });
});

describe('latencyStats', () => {
  it('reports zeroes for an empty set rather than NaN', () => {
    const stats = latencyStats([]);

    assert.deepEqual(stats, { p50: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 });
  });

  it('computes mean, min and max over unsorted input', () => {
    const stats = latencyStats([30, 10, 20]);

    assert.equal(stats.mean, 20);
    assert.equal(stats.min, 10);
    assert.equal(stats.max, 30);
  });
});
