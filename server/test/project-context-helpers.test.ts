/**
 * Project Context pure helpers (ring 1) — AC-1, AC-2 and the roots config rule.
 * Hermetic: no DB, no filesystem.
 */
import { describe, it, expect } from 'vitest';
import {
  docTypeFor,
  approxTokens,
  isCandidatePath,
  parseContextRoots,
  toFile,
  toListItem,
} from '../src/modules/project-context/helpers.js';

const ALL = ['specs', 'docs', 'insights'];

describe('docTypeFor', () => {
  it('uses the deepest path segment that is a doc type', () => {
    expect(docTypeFor('docs/a.md')).toBe('docs');
    expect(docTypeFor('specs/b.md')).toBe('specs');
    expect(docTypeFor('insights/c.md')).toBe('insights');
    expect(docTypeFor('docs/specs/x.md')).toBe('specs');
    expect(docTypeFor('specs/docs/x.md')).toBe('docs');
    expect(docTypeFor('.devdigest/specs/deep/er/d.md')).toBe('specs');
    expect(docTypeFor('a/insights/docs/specs/x.md')).toBe('specs');
  });

  it('ignores the file name itself', () => {
    expect(docTypeFor('docs/specs.md')).toBe('docs');
  });
});

describe('approxTokens', () => {
  it('is ceil(UTF-16 code units / 4), not bytes', () => {
    expect(approxTokens('')).toBe(0);
    expect(approxTokens('abcd')).toBe(1);
    expect(approxTokens('abcde')).toBe(2);
    expect(approxTokens('日本語€')).toBe(1); // 4 units, 12 bytes
    expect(approxTokens('日本語€x')).toBe(2);
    expect(approxTokens('😀')).toBe(1); // 2 units (surrogate pair), 4 bytes
    expect(approxTokens('😀😀😀')).toBe(2); // 6 units
  });
});

describe('isCandidatePath', () => {
  it('accepts .md files under a root folder segment, including nested and dot-folders', () => {
    for (const p of [
      'docs/a.md',
      'specs/b.md',
      'insights/i.md',
      'docs/specs/c.md',
      '.devdigest/specs/d.md',
      'src/docs/deep/er/e.md',
    ]) {
      expect(isCandidatePath(p, ALL), p).toBe(true);
    }
  });

  it('rejects paths without a root segment, non-md files and a root-named file', () => {
    for (const p of ['src/readme.md', 'README.md', 'docs/a.txt', 'docs/a.markdown', 'docs.md', 'a/docs']) {
      expect(isCandidatePath(p, ALL), p).toBe(false);
    }
  });

  it('rejects any path with a node_modules, .git or vendor segment', () => {
    for (const p of [
      'node_modules/docs/x.md',
      'docs/node_modules/x.md',
      'vendor/docs/y.md',
      'docs/vendor/y.md',
      '.git/docs/z.md',
      'docs/.git/z.md',
    ]) {
      expect(isCandidatePath(p, ALL), p).toBe(false);
    }
  });

  it('rejects unsafe shapes: absolute, "..", backslash, NUL, empty', () => {
    for (const p of [
      '/docs/a.md',
      '../docs/a.md',
      'docs/../docs/a.md',
      'docs\\a.md',
      'docs/a.md\u0000',
      'docs/\u0000/a.md',
      '',
    ]) {
      expect(isCandidatePath(p, ALL), JSON.stringify(p)).toBe(false);
    }
  });

  it('honours a subset of roots', () => {
    expect(isCandidatePath('docs/a.md', ['docs'])).toBe(true);
    expect(isCandidatePath('specs/b.md', ['docs'])).toBe(false);
    expect(isCandidatePath('docs/specs/c.md', ['docs'])).toBe(true);
  });
});

describe('parseContextRoots', () => {
  it('defaults to specs,docs,insights when unset', () => {
    expect(parseContextRoots(undefined)).toEqual(ALL);
  });

  it('accepts a comma list that is a subset, trimming spaces', () => {
    expect(parseContextRoots('docs')).toEqual(['docs']);
    expect(parseContextRoots('specs, docs')).toEqual(['specs', 'docs']);
  });

  it('rejects an unknown name and an empty list', () => {
    expect(() => parseContextRoots('docs,notes')).toThrow();
    expect(() => parseContextRoots('**/docs/**')).toThrow();
    expect(() => parseContextRoots('')).toThrow();
    expect(() => parseContextRoots(' , ')).toThrow();
  });
});

describe('used_by_agents mapping', () => {
  it('toListItem and toFile carry the count they are given', () => {
    const item = toListItem({ path: 'docs/a.md', size: 4, mtime: 0, text: 'abcd' } as never, 3);
    expect(item.used_by_agents).toBe(3);
    expect(toFile('docs/a.md', Buffer.from('abcd'), 0).used_by_agents).toBe(0);
  });
});
