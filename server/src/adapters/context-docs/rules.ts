import { isSafeRepoPath } from '../git/simple-git.js';

/** Directory segments never walked and never accepted in a document path. */
export const EXCLUDED_SEGMENTS: readonly string[] = ['node_modules', '.git', 'vendor'];

/** The only accepted document suffix. */
export const DOC_SUFFIX = '.md';

/** Pure path rule: safe shape, `.md`, no excluded segment, some folder segment is a root. */
export function isCandidatePath(path: string, roots: readonly string[]): boolean {
  if (!isSafeRepoPath(path)) return false;
  if (!path.endsWith(DOC_SUFFIX)) return false;
  const segments = path.split('/');
  if (segments.some((s) => EXCLUDED_SEGMENTS.includes(s))) return false;
  const folders = segments.slice(0, -1);
  return folders.some((s) => roots.includes(s));
}
