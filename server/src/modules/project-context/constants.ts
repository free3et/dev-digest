import type { ContextDocType } from '@devdigest/shared';

// Path rules live in the adapter-side pure file so adapters never import a module.
export { EXCLUDED_SEGMENTS, DOC_SUFFIX } from '../../adapters/context-docs/rules.js';

/** Search-root folder names (the `doc_type` enum) used when DEVDIGEST_CONTEXT_ROOTS is unset. */
export const DEFAULT_CONTEXT_ROOTS: readonly ContextDocType[] = ['specs', 'docs', 'insights'];

/** Allowed root names: exactly the `doc_type` enum values. */
export const CONTEXT_ROOT_NAMES: readonly string[] = ['specs', 'docs', 'insights'];

/** Single message for every path rule: callers must not learn which rule failed. */
export const NOT_LISTED_MESSAGE = 'path not in the document list';

export const CONFLICT_MESSAGE = 'content changed since loaded';
