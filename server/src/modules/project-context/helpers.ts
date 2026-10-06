import { createHash } from 'node:crypto';
import type { ContextDocEntry, ContextDocType, SpecFile } from '@devdigest/shared';
import { isCandidatePath } from '../../adapters/context-docs/rules.js';
import { CONTEXT_ROOT_NAMES, DEFAULT_CONTEXT_ROOTS } from './constants.js';

/**
 * Parse DEVDIGEST_CONTEXT_ROOTS: comma list of folder-segment names from the
 * `doc_type` enum. Unset → default. Empty, unknown names and globs throw.
 */
export function parseContextRoots(raw: string | undefined): string[] {
  if (raw === undefined) return [...DEFAULT_CONTEXT_ROOTS];
  const names = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (names.length === 0) throw new Error('DEVDIGEST_CONTEXT_ROOTS must list at least one root');
  const unknown = names.filter((n) => !CONTEXT_ROOT_NAMES.includes(n));
  if (unknown.length > 0) {
    throw new Error(
      `DEVDIGEST_CONTEXT_ROOTS: unknown root(s) ${unknown.join(', ')} (allowed: ${CONTEXT_ROOT_NAMES.join(', ')})`,
    );
  }
  return [...new Set(names)];
}

export { isCandidatePath };

/** The deepest folder segment that is a `doc_type` name (the file name is ignored). */
export function docTypeFor(path: string): ContextDocType {
  const folders = path.split('/').slice(0, -1);
  for (let i = folders.length - 1; i >= 0; i--) {
    const seg = folders[i]!;
    if (CONTEXT_ROOT_NAMES.includes(seg)) return seg as ContextDocType;
  }
  // Unreachable for paths that passed isCandidatePath with the default roots.
  return 'docs';
}

/** Same rule as reviewer-core / estimateTokens: UTF-16 code units / 4, rounded up. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function contentHash(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Plain code-unit comparison (not locale-aware) so order is stable everywhere. */
export function byPath(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/** List entries carry no content and no hash. */
export function toListItem(entry: ContextDocEntry): SpecFile {
  return {
    path: entry.path,
    size: entry.size,
    updated_at: new Date(entry.mtime).toISOString(),
    doc_type: docTypeFor(entry.path),
    approx_tokens: approxTokens(entry.text),
  };
}

/** A single document with content and the hash the editor sends back as `base_hash`. */
export function toFile(path: string, bytes: Buffer): SpecFile {
  const text = bytes.toString('utf8');
  return {
    path,
    content: text,
    size: bytes.length,
    doc_type: docTypeFor(path),
    approx_tokens: approxTokens(text),
    content_hash: contentHash(bytes),
  };
}

/** True for the fs errors that mean "the clone directory is not there". */
export function isMissingDirError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}
