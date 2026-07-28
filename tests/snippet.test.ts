// MemForge — query-relevant passage extraction
//
// Pure function, no database: everything here is about the selection contract
// callers depend on. The measured problem it exists to solve is that a warm row
// is a whole conversation (~10,000 chars median) while the answer is one turn,
// so agents pay for ~25,000 tokens of reader context to use a few hundred.
//
// Run: node --import tsx/esm --test tests/snippet.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { extractRelevantPassages } = await import('../src/snippet.js');

const HEADER = '[SESSION_ID:abc123]\n';
const turn = (role: string, body: string) => `[${role}]: ${body}\n`;

/** A conversation whose answer-bearing turn sits in the middle. */
function conversation(): string {
  return (
    HEADER +
    turn('user', 'Can you recommend a good pasta recipe for a weeknight dinner?') +
    turn('assistant', 'Certainly, here is a quick carbonara that takes twenty minutes.') +
    turn('user', 'I graduated with a degree in Business Administration back in 2019.') +
    turn('assistant', 'Congratulations on your Business Administration degree.') +
    turn('user', 'Also, what is the weather like for hiking this weekend in the mountains?') +
    turn('assistant', 'Expect clear skies and mild temperatures, ideal for hiking trails.')
  );
}

describe('extractRelevantPassages', () => {
  it('returns content untouched when it already fits the budget', () => {
    const content = conversation();

    const out = extractRelevantPassages(content, 'degree', 10_000);

    assert.equal(out, content, 'a caller may set a budget unconditionally');
  });

  it('keeps the answer-bearing turn and drops unrelated ones', () => {
    const content = conversation();

    const out = extractRelevantPassages(content, 'What degree did I graduate with?', 40);

    assert.match(out, /Business Administration/, 'the passage answering the query must survive');
    assert.doesNotMatch(out, /carbonara/, 'an unrelated turn must be dropped');
    assert.ok(out.length < content.length, 'output must actually be smaller');
  });

  it('always preserves the session header', () => {
    // Benchmark scoring and any caller-side provenance read the SESSION_ID
    // marker off the content; dropping it silently breaks attribution.
    const content = conversation();

    const out = extractRelevantPassages(content, 'degree graduate', 40);

    assert.match(out, /\[SESSION_ID:abc123\]/);
  });

  it('emits selected passages in their original order, not by score', () => {
    // The stronger match deliberately sits last, so a naive implementation
    // that emits in score order would fail this and pass a weaker fixture.
    const content =
      HEADER +
      turn('user', 'EARLYMARK I once mentioned a degree.') +
      turn('assistant', 'Noted, about pasta instead.') +
      turn('user', 'LATEMARK my Business Administration degree was completed.');

    const out = extractRelevantPassages(content, 'degree Business Administration', 60);

    assert.match(out, /EARLYMARK/, 'the weaker but still-matching passage should fit this budget');
    assert.match(out, /LATEMARK/, 'the strongest passage must always survive');
    assert.ok(
      out.indexOf('EARLYMARK') < out.indexOf('LATEMARK'),
      'a conversation read out of order is harder to follow',
    );
  });

  it('marks where turns were dropped', () => {
    const content = conversation();

    const out = extractRelevantPassages(content, 'degree Business Administration', 40);

    assert.match(out, /\[\.\.\.\]/, 'a gap marker prevents inferring false adjacency');
  });

  it('falls back to truncation when no query term appears anywhere', () => {
    // A semantic-only hit: the vector arm matched but no lexical overlap
    // exists, so there is no basis for preferring one passage over another.
    const content = conversation();

    const out = extractRelevantPassages(content, 'zzzzz qqqqq', 40);

    assert.ok(out.length <= 40 * 4, 'must still respect the budget');
    assert.ok(out.length > 0);
  });

  it('respects the budget even when many passages match', () => {
    const content =
      HEADER + Array.from({ length: 40 }, (_, i) => turn('user', `degree number ${i} discussed here`)).join('');

    const out = extractRelevantPassages(content, 'degree', 50);

    assert.ok(out.length <= 50 * 4 + HEADER.length + 40, `budget overshot: ${out.length} chars`);
  });

  it('keeps at least one passage even when the budget is smaller than any turn', () => {
    const content = HEADER + turn('user', 'a'.repeat(500) + ' degree ' + 'b'.repeat(500));

    const out = extractRelevantPassages(content, 'degree', 5);

    assert.ok(out.length > 0, 'returning nothing would be worse than overshooting');
  });

  it('is deterministic across repeated calls', () => {
    const content = conversation();

    const runs = Array.from({ length: 5 }, () =>
      extractRelevantPassages(content, 'degree Business', 40),
    );

    for (const r of runs) assert.equal(r, runs[0]);
  });

  it('leaves content without turn markers alone apart from truncation', () => {
    const content = 'x'.repeat(5000);

    const out = extractRelevantPassages(content, 'degree', 100);

    assert.equal(out.length, 400);
  });
});

describe('session attribution in packed memories', () => {
  // Consolidation packs up to CONSOLIDATION_INNER_BATCH_SIZE sessions into one
  // warm row (default 50), so a memory routinely spans several sessions and
  // only the first marker sits in the preamble. Dropping the segment that
  // carried a later marker would silently reattribute that passage.
  const packed =
    '[SESSION_ID:sess-one]\n' +
    turn('user', 'Talking about pasta recipes and nothing else here.') +
    '\n---\n[SESSION_ID:sess-two]\n' +
    turn('user', 'This is where I mention my Business Administration degree.') +
    '\n---\n[SESSION_ID:sess-three]\n' +
    turn('user', 'And here we discuss hiking trails in the mountains.');

  it('attributes a surviving passage to its own session, not the first', () => {
    const out = extractRelevantPassages(packed, 'Business Administration degree', 40);

    assert.match(out, /Business Administration/, 'the answer passage must survive');
    assert.match(out, /\[SESSION_ID:sess-two\]/, 'it must carry its own session marker');
  });

  it('does not attribute a passage to a session it did not come from', () => {
    const out = extractRelevantPassages(packed, 'hiking trails mountains', 40);

    assert.match(out, /hiking trails/);
    assert.match(out, /\[SESSION_ID:sess-three\]/);
    assert.doesNotMatch(
      out.slice(out.indexOf('hiking trails')),
      /sess-one/,
      'the surviving passage must not be labelled with an unrelated session',
    );
  });
});
