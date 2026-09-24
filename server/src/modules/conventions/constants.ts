/** Ranked source files added on top of the CONFIG list (`repoIntel.getConventionSamples`). */
export const SAMPLE_FILE_COUNT = 12;

/**
 * Ranked *test* files on top of the source sample (`getConventionTestSamples`).
 * Small on purpose: enough for `category: testing`, not a second prompt.
 */
export const TEST_SAMPLE_FILE_COUNT = 4;

/**
 * Well-known config files, read from the clone by path when they exist. They are
 * NOT ranked or junk-filtered — they are exactly where house rules are written down.
 */
export const CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'tsconfig.json',
  'tsconfig.base.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
  '.editorconfig',
  'package.json',
] as const;

/** Per-file and total caps keep the prompt bounded. */
export const MAX_FILE_CHARS = 6_000;
export const MAX_TOTAL_CHARS = 60_000;

/** Upper bound on candidates taken from one model reply. */
export const MAX_PROPOSED = 30;

/** A snippet shorter than this (trimmed) is not evidence — it would match anywhere. */
export const MIN_SNIPPET_CHARS = 12;

/** Stored snippet is at most this many lines of the file, starting at the evidence line. */
export const MAX_SNIPPET_LINES = 12;

export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

export const CONVENTIONS_SKILL_NAME = 'repo-conventions';
export const CONVENTIONS_SKILL_DESCRIPTION =
  'Use when reviewing code in this repository: enforce the house conventions (naming, structure, errors, testing, imports, typing, API) listed in the body.';
