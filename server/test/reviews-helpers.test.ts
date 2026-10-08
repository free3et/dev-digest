import { describe, it, expect } from 'vitest';
import { approxContextTokens, dedupeContextPaths, formatProjectContextLog, formatSpecsAttachedLog, taskLine } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

describe('project context helpers (reviews)', () => {
  it('dedupe keeps the first occurrence, own before inherited', () => {
    expect(dedupeContextPaths(['b.md', 'a.md'], ['a.md', 'c.md', 'c.md', 'b.md'])).toEqual(['b.md', 'a.md', 'c.md']);
  });

  it('approxContextTokens is ceil(chars / 4)', () => {
    expect(approxContextTokens('')).toBe(0);
    expect(approxContextTokens('abcd')).toBe(1);
    expect(approxContextTokens('abcde')).toBe(2);
  });

  it('0-doc line', () => {
    expect(formatProjectContextLog(0, 0, 0)).toBe('project context: 0 docs, +~0 tokens');
  });

  it('skipped suffix only when M > 0', () => {
    expect(formatProjectContextLog(2, 10, 0)).not.toContain('skipped');
    expect(formatProjectContextLog(2, 10, 1)).toBe('project context: 2 docs, +~10 tokens, 1 skipped');
  });
});

describe('formatSpecsAttachedLog', () => {
  it('names the number of injected context docs', () => {
    expect(formatSpecsAttachedLog(1)).toBe('Specs: 1 context doc(s) attached to prompt');
  });
});
