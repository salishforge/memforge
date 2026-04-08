// Benchmark scoring utilities — Recall@k, latency stats, session extraction

import type { QuestionResult, LatencyStats, CategoryResult } from '../longmemeval/types.js';

const SESSION_ID_RE = /\[SESSION_ID:([^\]]+)\]/g;

/** Extract [SESSION_ID:xxx] markers from warm-tier content. */
export function extractSessionIds(content: string): string[] {
  const ids: string[] = [];
  let match;
  while ((match = SESSION_ID_RE.exec(content)) !== null) {
    if (match[1]) ids.push(match[1]);
  }
  SESSION_ID_RE.lastIndex = 0;
  return ids;
}

/**
 * Compute Recall@k: 1 if any answer session appears in the top-k retrieved sessions, 0 otherwise.
 * retrievedSessionIds should be in rank order (from highest to lowest ranked results).
 */
export function recallAtK(retrievedSessionIds: string[], answerSessionIds: string[], k: number): number {
  const topK = new Set(retrievedSessionIds.slice(0, k));
  for (const aid of answerSessionIds) {
    if (topK.has(String(aid))) return 1;
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
): { overall: { recallAt: Record<number, number>; queryLatency: LatencyStats; ingestLatency: LatencyStats }; perCategory: Record<string, CategoryResult> } {
  // Overall
  const overallRecall: Record<number, number> = {};
  for (const k of topKValues) {
    const recalls = results.map((r) => r.recallAt[k] ?? 0);
    overallRecall[k] = recalls.length > 0 ? recalls.reduce((a, b) => a + b, 0) / recalls.length : 0;
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
    const catRecall: Record<number, number> = {};
    for (const k of topKValues) {
      const recalls = catResults.map((r) => r.recallAt[k] ?? 0);
      catRecall[k] = recalls.reduce((a, b) => a + b, 0) / recalls.length;
    }
    perCategory[cat] = {
      count: catResults.length,
      recallAt: catRecall,
      latency: latencyStats(catResults.map((r) => r.latency.queryMs)),
    };
  }

  return {
    overall: {
      recallAt: overallRecall,
      queryLatency: latencyStats(queryLatencies),
      ingestLatency: latencyStats(ingestLatencies),
    },
    perCategory,
  };
}
