// Subset selection for limited benchmark runs.
//
// LongMemEval-S stores its 500 instances in contiguous blocks by question
// type: single-session-user ×70, multi-session ×62, single-session-preference
// ×30, multi-session ×71, temporal-reasoning ×133, knowledge-update ×78,
// single-session-assistant ×56.
//
// A plain `slice(offset, offset + limit)` therefore samples one or two
// categories and nothing else — `BENCHMARK_LIMIT=50` returns 50
// single-session-user questions. Any number produced that way describes one
// question type while looking like an overall score, and tuning retrieval
// against it optimises for whichever category happens to sit at the offset.
//
// Stratified selection round-robins across the types present, so a 50-question
// run covers every category in proportion. It is deterministic — no RNG, and
// original order is preserved within each type — so runs stay comparable
// across code changes, which is the whole point of a regression benchmark.

export type SampleStrategy = 'stratified' | 'sequential';

export function resolveStrategy(raw: string | undefined): SampleStrategy {
  return raw === 'sequential' ? 'sequential' : 'stratified';
}

/**
 * Pick `limit` instances starting at `offset`.
 *
 * `sequential` reproduces the original slice — use it to re-measure an exact
 * historical run, or when evaluating the full dataset where the distinction
 * does not apply.
 *
 * `stratified` (default) takes instances round-robin by `question_type`, which
 * for limit >= number-of-types yields a representative mix. Returned items
 * carry their original dataset index so results stay traceable.
 */
export function selectSubset<T extends { question_type?: string }>(
  dataset: T[],
  limit: number,
  offset: number,
  strategy: SampleStrategy,
): Array<{ instance: T; datasetIndex: number }> {
  const indexed = dataset.map((instance, datasetIndex) => ({ instance, datasetIndex }));

  if (strategy === 'sequential' || limit >= dataset.length) {
    return indexed.slice(offset, offset + limit);
  }

  // Group by type, preserving dataset order within each group.
  const byType = new Map<string, Array<{ instance: T; datasetIndex: number }>>();
  for (const entry of indexed) {
    const type = entry.instance.question_type ?? 'unknown';
    const bucket = byType.get(type) ?? [];
    bucket.push(entry);
    byType.set(type, bucket);
  }

  // Offset advances the starting cursor within every bucket, so successive
  // offsets walk disjoint questions rather than re-drawing the same ones.
  const types = [...byType.keys()].sort();
  const cursors = new Map(types.map((t) => [t, offset]));

  const picked: Array<{ instance: T; datasetIndex: number }> = [];
  let exhausted = false;
  while (picked.length < limit && !exhausted) {
    exhausted = true;
    for (const type of types) {
      if (picked.length >= limit) break;
      const bucket = byType.get(type)!;
      const cursor = cursors.get(type)!;
      if (cursor < bucket.length) {
        picked.push(bucket[cursor]!);
        cursors.set(type, cursor + 1);
        exhausted = false;
      }
    }
  }

  return picked;
}
