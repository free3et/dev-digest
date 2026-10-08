import { CONTEXT_DOC_MAX_BYTES } from "@devdigest/shared";
import type { ContextAttachment, ContextDocType, InheritedContextAttachment, SpecFile } from "@devdigest/shared";
import { PROJECT_CONTEXT_HEADING } from "./constants";

export type RowKind = "own" | "inherited" | "repo";

export interface PickerRow {
  path: string;
  /** File name (last path segment). */
  name: string;
  /** Folder part of the path ("" at the repo root). */
  folder: string;
  kind: RowKind;
  docType: ContextDocType | null;
  approxTokens: number | null;
  missing: boolean;
  tooLarge: boolean;
  /** Set on inherited rows: the skill the document comes from. */
  skillName?: string;
}

export function splitPath(path: string): { name: string; folder: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { name: path, folder: "" } : { name: path.slice(i + 1), folder: path.slice(0, i) };
}

function fromAttachment(a: ContextAttachment, kind: RowKind, skillName?: string): PickerRow {
  return {
    path: a.path,
    ...splitPath(a.path),
    kind,
    docType: a.doc_type,
    approxTokens: a.approx_tokens,
    missing: a.missing,
    tooLarge: a.too_large,
    ...(skillName === undefined ? null : { skillName }),
  };
}

function fromDocument(d: SpecFile): PickerRow {
  return {
    path: d.path,
    ...splitPath(d.path),
    kind: "repo",
    docType: d.doc_type,
    approxTokens: d.approx_tokens,
    missing: false,
    tooLarge: (d.size ?? 0) > CONTEXT_DOC_MAX_BYTES,
  };
}

/**
 * Resolves the own attached paths (in their current local order) to attachments: server data wins,
 * then the repo's document list; a path found in neither is `missing`.
 */
export function resolveOwn(
  paths: readonly string[],
  serverOwn: readonly ContextAttachment[],
  documents: readonly SpecFile[],
): ContextAttachment[] {
  const known = new Map(serverOwn.map((a) => [a.path, a]));
  const docs = new Map(documents.map((d) => [d.path, d]));
  return paths.map((path): ContextAttachment => {
    const a = known.get(path);
    if (a) return a;
    const d = docs.get(path);
    if (!d) return { path, doc_type: "docs", approx_tokens: null, missing: true, too_large: false };
    const tooLarge = (d.size ?? 0) > CONTEXT_DOC_MAX_BYTES;
    return {
      path,
      doc_type: d.doc_type,
      approx_tokens: tooLarge ? null : d.approx_tokens,
      missing: false,
      too_large: tooLarge,
    };
  });
}

/**
 * Every path once: own attached (attach order), inherited (prompt order, labelled by skill),
 * then the remaining repo documents by path. An inherited path is not repeated in the rest.
 */
export function buildRows(
  own: readonly ContextAttachment[],
  inherited: readonly InheritedContextAttachment[],
  documents: readonly SpecFile[],
): PickerRow[] {
  const seen = new Set<string>();
  const rows: PickerRow[] = [];
  for (const a of own) {
    if (seen.has(a.path)) continue;
    seen.add(a.path);
    rows.push(fromAttachment(a, "own"));
  }
  for (const a of inherited) {
    if (seen.has(a.path)) continue;
    seen.add(a.path);
    rows.push(fromAttachment(a, "inherited", a.skill_name));
  }
  const rest = documents.filter((d) => !seen.has(d.path)).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const d of rest) rows.push(fromDocument(d));
  return rows;
}

/** Case-insensitive path substring filter; blank query keeps every row. */
export function filterRows(rows: readonly PickerRow[], query: string): PickerRow[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => r.path.toLowerCase().includes(q)) : [...rows];
}

/** Tokens a row adds to the prompt: `missing` and `too_large` documents add nothing. */
export function rowTokens(a: Pick<ContextAttachment, "approx_tokens" | "missing" | "too_large">): number {
  return a.missing || a.too_large ? 0 : (a.approx_tokens ?? 0);
}

export interface Totals {
  own: number;
  inherited: number;
  total: number;
}

/** A = own attached tokens, S = inherited attached tokens, T = A + S. */
export function totals(
  own: readonly ContextAttachment[],
  inherited: readonly InheritedContextAttachment[],
): Totals {
  const sum = (list: readonly ContextAttachment[]) => list.reduce((n, a) => n + rowTokens(a), 0);
  const ownTokens = sum(own);
  const ownPaths = new Set(own.map((a) => a.path));
  const inheritedTokens = sum(inherited.filter((a) => !ownPaths.has(a.path)));
  return { own: ownTokens, inherited: inheritedTokens, total: ownTokens + inheritedTokens };
}

/** K = own attached count, N = the repo's document count. */
export function attachedCount(own: readonly ContextAttachment[], documents: readonly SpecFile[]): { attached: number; total: number } {
  return { attached: own.length, total: documents.length };
}

/** Appends a path (no-op when already attached). */
export function attach(paths: readonly string[], path: string): string[] {
  return paths.includes(path) ? [...paths] : [...paths, path];
}

/** Removes a path from the own list. */
export function detach(paths: readonly string[], path: string): string[] {
  return paths.filter((p) => p !== path);
}

/** Moves `path` one step up (-1) or down (+1); out-of-range moves return the same order. */
export function move(paths: readonly string[], path: string, dir: -1 | 1): string[] {
  const from = paths.indexOf(path);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= paths.length) return [...paths];
  const next = [...paths];
  next.splice(from, 1);
  next.splice(to, 0, path);
  return next;
}

/** Drag-and-drop: places `path` at the position held by `targetPath`. */
export function moveToTarget(paths: readonly string[], path: string, targetPath: string): string[] {
  const from = paths.indexOf(path);
  const to = paths.indexOf(targetPath);
  if (from < 0 || to < 0 || from === to) return [...paths];
  const next = [...paths];
  next.splice(from, 1);
  next.splice(to, 0, path);
  return next;
}

/** The "Serializes as" block: the heading, then one `- <path>` line per document in own order. */
export function serializeLines(paths: readonly string[]): string[] {
  return [PROJECT_CONTEXT_HEADING, ...paths.map((p) => `- ${p}`)];
}
