// MemForge — Launch context auto-derivation tests
//
// Pure-logic tests for the slugifier and best-effort namespace derivation.
// No DB required. Run: node --import tsx/esm --test tests/launch-context.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { toNamespaceSlug, deriveLaunchNamespace } from '../src/launch-context.js';
import { NamespaceSchema } from '../src/schemas.js';

describe('toNamespaceSlug', () => {
  it('preserves valid tokens', () => {
    assert.equal(toNamespaceSlug('project-memforge'), 'project-memforge');
    assert.equal(toNamespaceSlug('project_callscreen'), 'project_callscreen');
  });

  it('lowercases mixed case', () => {
    assert.equal(toNamespaceSlug('Project-MemForge'), 'project-memforge');
  });

  it('replaces spaces and special chars with hyphens', () => {
    assert.equal(toNamespaceSlug('My Cool Project!'), 'my-cool-project');
    assert.equal(toNamespaceSlug('foo@bar/baz'), 'foo-bar-baz');
  });

  it('collapses runs of hyphens', () => {
    assert.equal(toNamespaceSlug('foo  --  bar'), 'foo-bar');
  });

  it('trims leading/trailing hyphens', () => {
    assert.equal(toNamespaceSlug('---foo---'), 'foo');
  });

  it('returns null for input with no alphanumerics', () => {
    assert.equal(toNamespaceSlug('!!!'), null);
    assert.equal(toNamespaceSlug(''), null);
  });

  it('caps at 64 chars', () => {
    const long = 'a'.repeat(200);
    const slug = toNamespaceSlug(long);
    assert.ok(slug);
    assert.ok(slug!.length <= 64);
  });

  it('every produced slug passes server-side NamespaceSchema', () => {
    for (const input of [
      'project-memforge',
      'My Cool Project',
      'CamelCaseRepo',
      'with.dots.and-dashes',
      'unicode-café',
      'numeric123',
    ]) {
      const slug = toNamespaceSlug(input);
      if (slug !== null) {
        assert.equal(
          NamespaceSchema.safeParse(slug).success,
          true,
          `slug "${slug}" from "${input}" must pass NamespaceSchema`,
        );
      }
    }
  });
});

describe('deriveLaunchNamespace', () => {
  it('returns project-<basename> for non-git cwd', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'memforge-launch-test-'));
    try {
      const sub = join(tmp, 'my-project');
      mkdirSync(sub);
      const result = deriveLaunchNamespace(sub);
      assert.equal(result, 'project-my-project');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('slugifies awkward directory names', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'memforge-launch-test-'));
    try {
      const sub = join(tmp, 'My Wild!! Repo');
      mkdirSync(sub);
      const result = deriveLaunchNamespace(sub);
      assert.equal(result, 'project-my-wild-repo');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('produces a slug that passes server-side validation', () => {
    const result = deriveLaunchNamespace(process.cwd());
    if (result !== null) {
      assert.equal(NamespaceSchema.safeParse(result).success, true);
    }
  });
});
