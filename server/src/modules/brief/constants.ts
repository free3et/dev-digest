import type { SmartDiffRole } from '@devdigest/shared';

/** Model-input budget (AC-6): `ceil(characters / 4)` tokens, same rule as reviewer-core. */
export const INPUT_TOKEN_BUDGET = 8000;
export const CHARS_PER_TOKEN = 4;
export const MAX_OUTPUT_TOKENS = 1500;
export const LLM_TIMEOUT_MS = 30_000;
export const ISSUE_FETCH_TIMEOUT_MS = 8000;

/** Caps on the stored brief (AC-10). */
export const MAX_RISKS = 6;
export const MAX_FOCUS = 8;

export const BRIEF_SCHEMA_NAME = 'pr_brief';
export const BRIEF_FEATURE_ID = 'risk_brief';

/** PR title is capped in the prompt (same cap as the intent classifier). */
export const TITLE_CHARS = 300;

/** Severity order for the stored risks (AC-10). */
export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Removal priority for file stats (AC-6 step 5): these roles go first. */
export const FIRST_CUT_ROLES: readonly SmartDiffRole[] = ['boilerplate', 'docs'];

// ---- Duplicated from reviews/smart-diff/constants.ts (modules never import each other) ----
export const CLASSIFY_ORDER: readonly Exclude<SmartDiffRole, 'core'>[] = [
  'boilerplate',
  'tests',
  'wiring',
  'docs',
];
export const LOCKFILE_BASENAMES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'];
export const BOILERPLATE_ROOT_DIRS = ['dist', 'build'];
export const BOILERPLATE_ANY_SEGMENTS = ['__snapshots__'];
export const TEST_BASENAME_RE = /\.(test|spec)\.[jt]sx?$/;
export const TEST_ANY_SEGMENTS = ['test', 'tests', '__tests__'];
export const TEST_ROOT_DIRS = ['e2e'];
export const WIRING_BASENAMES = ['index.ts', 'index.js'];
export const WIRING_BASENAME_RES = [
  /^tsconfig.*\.json$/,
  /^\.eslintrc/,
  /^\.env/,
  /^docker-compose.*\.ya?ml$/,
];
export const WIRING_ROOT_DIRS = ['.github', '.claude'];
export const DOCS_EXTENSIONS = ['.md', '.mdx'];
export const DOCS_ROOT_DIRS = ['docs'];
export const DOCS_BASENAME_PREFIXES = ['README', 'CHANGELOG', 'LICENSE'];

// ---- Duplicated from project-context/constants.ts ----
export const CONTEXT_ROOT_NAMES: readonly string[] = ['specs', 'docs', 'insights'];

// ---- Duplicated from reviews/intent-constants.ts (issue-reference scan) ----
export const MAX_SCAN_CHARS = 20_000;
export const MAX_LINKED_ISSUES = 3;
