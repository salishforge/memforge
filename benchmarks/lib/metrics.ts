// Benchmark scoring utilities — Recall@k, latency stats, session extraction
//
// Two Recall@k definitions live here, and the distinction is the whole
// ballgame for comparability.
//
// LongMemEval's corpus unit is the *session*: retrieve k sessions, score a hit
// if a gold session is among them. MemForge's retrieval unit is the warm-tier
// *row*, and consolidation packs many sessions into one row — up to
// CONSOLIDATION_INNER_BATCH_SIZE of them. So "top 5 rows" can contain
// hundreds of sessions, and scoring that as R@5 measures something far more
// generous than the paper does.
//
// Both numbers are therefore computed and reported under distinct names:
//
//   recallAtKSessions — first k distinct sessions in rank order. This is the
//                       paper-comparable definition and the headline metric.
//   recallAtKRows     — any gold session anywhere inside the top-k rows. This
//                       is MemForge's native retrieval behaviour and is
//                       strictly >= the session number; the gap is the packing
//                       advantage, quantified by sessionsPerRow.
//
// Run with CONSOLIDATION_INNER_BATCH_SIZE=1 to make rows and sessions 1:1, at
// which point the two metrics converge.

import type { QuestionResult, LatencyStats, CategoryResult } from '../longmemeval/types.js';

const SESSION_ID_RE = /\[SESSION_ID:([^\]]+)\]/g;

/** Extract [SESSION_ID:xxx] markers from warm-tier content, in order of appearance. */
export function extractSessionIds(content: string): string[] {
  // matchAll rather than exec-with-lastIndex-reset: the shared /g regex
  // carries mutable state between calls, and an early return would leave
  // lastIndex dangling for the next caller.
  return [...content.matchAll(SESSION_ID_RE)]
    .map((m) => m[1])
    .filter((id): id is string => id !== undefined);
}

/**
 * Recall@k over sessions — 1 if any gold session is among the first k distinct
 * sessions in rank order, else 0. This is LongMemEval's definition.
 *
 * `retrievedSessionIds` must be rank-ordered and already de-duplicated.
 */
export function recallAtKSessions(
  retrievedSessionIds: string[],
  answerSessionIds: string[],
  k: number,
): number {
  const topK = new Set(retrievedSessionIds.slice(0, k));
  return answerSessionIds.some((aid) => topK.has(String(aid))) ? 1 : 0;
}

/**
 * Recall@k over rows — 1 if any gold session appears anywhere inside the top-k
 * retrieved rows, else 0. Generous relative to the session metric whenever
 * consolidation packs multiple sessions per row; reported so the packing
 * advantage is visible rather than baked silently into a headline number.
 *
 * `perRowSessionIds[i]` holds the sessions found in the i-th ranked row.
 */
export function recallAtKRows(
  perRowSessionIds: string[][],
  answerSessionIds: string[],
  k: number,
): number {
  const gold = new Set(answerSessionIds.map(String));
  for (const row of perRowSessionIds.slice(0, k)) {
    if (row.some((sid) => gold.has(sid))) return 1;
  }
  return 0;
}

/** Compute p-th percentile from a sorted array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

/** Compute latency statistics from an unsorted array of millisecond values. */
export function latencyStats(values: number[]): LatencyStats {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean: sum / sorted.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

/** Aggregate per-question results into overall + per-category report. */
export function aggregateScores(
  results: QuestionResult[],
  topKValues: number[],
): {
  overall: {
    recallAtSessions: Record<number, number>;
    recallAtRows: Record<number, number>;
    sessionsPerRow: number;
    queryLatency: LatencyStats;
    ingestLatency: LatencyStats;
  };
  perCategory: Record<string, CategoryResult>;
} {
  const mean = (xs: number[]): number =>
    xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  // Overall
  const overallSessions: Record<number, number> = {};
  const overallRows: Record<number, number> = {};
  for (const k of topKValues) {
    overallSessions[k] = mean(results.map((r) => r.recallAtSessions[k] ?? 0));
    overallRows[k] = mean(results.map((r) => r.recallAtRows[k] ?? 0));
  }

  const queryLatencies = results.map((r) => r.latency.queryMs);
  const ingestLatencies = results.map((r) => r.latency.ingestMs);

  // Per category
  const categories = new Map<string, QuestionResult[]>();
  for (const r of results) {
    const cat = r.questionType;
    const arr = categories.get(cat) ?? [];
    arr.push(r);
    categories.set(cat, arr);
  }

  const perCategory: Record<string, CategoryResult> = {};
  for (const [cat, catResults] of categories) {
    const catSessions: Record<number, number> = {};
    const catRows: Record<number, number> = {};
    for (const k of topKValues) {
      catSessions[k] = mean(catResults.map((r) => r.recallAtSessions[k] ?? 0));
      catRows[k] = mean(catResults.map((r) => r.recallAtRows[k] ?? 0));
    }
    perCategory[cat] = {
      count: catResults.length,
      recallAtSessions: catSessions,
      recallAtRows: catRows,
      latency: latencyStats(catResults.map((r) => r.latency.queryMs)),
    };
  }

  return {
    overall: {
      recallAtSessions: overallSessions,
      recallAtRows: overallRows,
      sessionsPerRow: mean(results.map((r) => r.sessionsPerRow)),
      queryLatency: latencyStats(queryLatencies),
      ingestLatency: latencyStats(ingestLatencies),
    },
    perCategory,
  };
}
