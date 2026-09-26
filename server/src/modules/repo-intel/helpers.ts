/**
 * Rank-sample path filters. `isJunkPath` is shared with onboarding /
 * review-context and must keep dropping tests. Conventions extract adds a
 * *separate* test-file sample so `category: testing` can have evidence.
 */

/** Paths that look like tests (substring match, repo-relative, lowercased). */
export const TEST_PATH_PATTERNS = [
  '.test.',
  '.spec.',
  '__tests__/',
  '/test/',
  '/tests/',
] as const;

/** Junk that is not a test file: configs, declarations, migrations, fixtures. */
export const NON_TEST_JUNK_PATTERNS = [
  '.d.ts',
  '__mocks__/',
  '/migrations/',
  '/__fixtures__/',
  '.config.',
  'vitest.',
  'jest.',
  'eslint',
  'prettier',
] as const;

/** Union used by onboarding / `getTopFilesByRank` / `getConventionSamples`. */
export const JUNK_PATH_PATTERNS = [...TEST_PATH_PATTERNS, ...NON_TEST_JUNK_PATTERNS] as const;

function matches(path: string, patterns: readonly string[]): boolean {
  const lower = path.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

/** Tests, configs, declarations, migrations — excluded from rank-driven source samples. */
export function isJunkPath(path: string): boolean {
  return matches(path, JUNK_PATH_PATTERNS);
}

/**
 * Ranked test files for conventions extract only. Still drops configs /
 * migrations so a `vitest.config.ts` or `eslint.test.js` is not evidence.
 */
export function isConventionTestPath(path: string): boolean {
  return matches(path, TEST_PATH_PATTERNS) && !matches(path, NON_TEST_JUNK_PATTERNS);
}
