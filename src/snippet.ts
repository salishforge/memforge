// Query-relevant passage extraction.
//
// A consolidated memory is a whole conversation — measured on a real corpus the
// median warm row is ~10,000 characters, and ten of them is ~25,000 tokens of
// reader context. The answer to a question is usually one exchange inside that,
// so most of what an agent pays for is noise.
//
// Measured consequence: on a 500-question benchmark, halving how many memories
// reach the reader gained 4.4pp for one reader and 6.4pp for another — but cost
// 2.2pp for a third, stronger one, because narrowing throws away evidence along
// with the noise. Reducing each memory to its relevant passages is the version
// of that trade with no evidence thrown away: same memories, less noise.
//
// Deliberately lexical — no LLM call, no embedding, no extra round trip. It
// runs on every result of every query, so it has to be cheap and deterministic.
// A model-based extractor would score better and would belong behind the
// existing ENABLE_LLM_RERANK-style opt-in, not here.

/** Words carrying no retrieval signal; scoring them rewards long segments for nothing. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'should', 'could', 'may', 'might', 'must', 'can', 'to', 'of', 'in',
  'on', 'at', 'by', 'for', 'with', 'about', 'from', 'as', 'into', 'that', 'this',
  'these', 'those', 'it', 'its', 'i', 'me', 'my', 'you', 'your', 'we', 'our',
  'what', 'when', 'where', 'who', 'how', 'why', 'which', 'did', 'am',
]);

/**
 * A conversational turn, or the header that precedes the first one.
 *
 * Splitting on the turn marker rather than on sentences keeps a question and
 * its answer together, which is what makes a passage answerable on its own.
 */
interface Segment {
  text: string;
  /** Position in the original content — selections are re-sorted by this so passages read in order. */
  index: number;
  /** True for the `[SESSION_ID:...]` preamble, which is always kept: downstream scoring reads it. */
  isHeader: boolean;
  /**
   * The session this passage belongs to, or null if the content carries no
   * markers. Consolidation packs up to CONSOLIDATION_INNER_BATCH_SIZE sessions
   * into one row (default 50), so a memory routinely spans several — and the
   * marker for the second and later ones sits mid-content, not in the preamble.
   * Tracking it per passage is what lets attribution survive dropped segments.
   */
  sessionId: string | null;
}

const TURN_BOUNDARY = /(?=\[(?:user|assistant)\]:)/;
const SESSION_MARKER = /\[SESSION_ID:([^\]]+)\]/g;

function lastSessionIdIn(text: string): string | null {
  const matches = [...text.matchAll(SESSION_MARKER)];
  return matches.length > 0 ? matches[matches.length - 1]![1]! : null;
}

function segment(content: string): Segment[] {
  const parts = content.split(TURN_BOUNDARY).filter((p) => p.length > 0);
  // Splitting on a lookahead at the turn marker means a session marker that
  // precedes a turn lands at the END of the previous chunk. So a marker found
  // inside a chunk introduces the session of the chunks that FOLLOW it, while
  // this chunk belongs to whatever was already in effect.
  let current: string | null = null;
  return parts.map((text, index) => {
    const isHeader = index === 0 && !/^\[(?:user|assistant)\]:/.test(text);
    const owner = current;
    const introduced = lastSessionIdIn(text);
    if (introduced) current = introduced;
    return { text, index, isHeader, sessionId: isHeader ? introduced : owner };
  });
}

/**
 * Strip session markers and the separators that surround them from a passage.
 *
 * The marker trailing a passage announces the next session, not this one, so
 * carrying it along would attribute the passage to a session it did not come
 * from. Attribution is re-emitted explicitly per passage instead, which makes
 * it exact regardless of which segments were dropped.
 */
function stripMarkers(text: string): string {
  return text
    .replace(SESSION_MARKER, '')
    .replace(/\n\s*-{3,}\s*\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

/** Distinct, lowercased, stopword-free terms of length >= 2. */
function termsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 2 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

/**
 * Reduce `content` to the passages most relevant to `query`, within `maxTokens`.
 *
 * Returns the content unchanged when it already fits, so a caller can set a
 * budget unconditionally without special-casing short memories.
 *
 * Selection is by distinct query-term coverage, with match density breaking
 * ties so a short on-point turn outranks a long rambling one that happens to
 * mention the same words. Selected passages are emitted in their original order
 * — a conversation read out of order is harder to follow, not easier — and a
 * gap marker is inserted where turns were dropped so the reader can tell that
 * something is missing rather than inferring a false adjacency.
 */
export function extractRelevantPassages(content: string, query: string, maxTokens: number): string {
  if (maxTokens <= 0) return content;
  const budgetChars = maxTokens * 4;
  if (content.length <= budgetChars) return content;

  const queryTerms = termsOf(query);
  const segments = segment(content);
  if (segments.length <= 1) return content.slice(0, budgetChars);

  const header = segments.find((s) => s.isHeader);
  const candidates = segments.filter((s) => !s.isHeader);

  const scored = candidates.map((s) => {
    const terms = termsOf(s.text);
    let hits = 0;
    for (const t of queryTerms) if (terms.has(t)) hits++;
    return { segment: s, hits, density: hits / Math.max(terms.size, 1) };
  });

  scored.sort((a, b) => b.hits - a.hits || b.density - a.density || a.segment.index - b.segment.index);

  // No lexical overlap at all — a semantic-only hit. Truncating to the head is
  // the honest fallback: we have no basis for preferring any passage, and
  // silently returning the first N characters is what the caller would do.
  if (scored[0]!.hits === 0) return content.slice(0, budgetChars);

  let used = header ? header.text.length : 0;
  const picked: Segment[] = [];
  for (const { segment: s } of scored) {
    if (used + s.text.length > budgetChars && picked.length > 0) continue;
    picked.push(s);
    used += s.text.length;
  }
  if (picked.length === 0) return content.slice(0, budgetChars);

  picked.sort((a, b) => a.index - b.index);

  const out: string[] = [];
  let emittedSession: string | null = null;
  if (header) {
    const text = stripMarkers(header.text);
    if (header.sessionId) {
      out.push(`[SESSION_ID:${header.sessionId}]`);
      emittedSession = header.sessionId;
    }
    if (text.length > 0) out.push(text);
  }
  let previous = -1;
  for (const s of picked) {
    if (previous !== -1 && s.index !== previous + 1) out.push('[...]');
    // Re-state the marker whenever the session changes. A passage from the
    // third session of a packed row would otherwise inherit the first row's
    // marker, or none at all if the segment carrying it was dropped.
    if (s.sessionId && s.sessionId !== emittedSession) {
      out.push(`[SESSION_ID:${s.sessionId}]`);
      emittedSession = s.sessionId;
    }
    out.push(stripMarkers(s.text));
    previous = s.index;
  }
  return out.join('\n');
}
