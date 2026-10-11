import type { SpecFile } from "@devdigest/shared";

export interface FooterTotals {
  count: number;
  tokens: number;
}

/** Document count and the sum of `approx_tokens` over every listed document. */
export function footerTotals(docs: Pick<SpecFile, "approx_tokens">[]): FooterTotals {
  return { count: docs.length, tokens: docs.reduce((sum, d) => sum + d.approx_tokens, 0) };
}

/** Split a repo-relative path into file name and folder ("" for a root-level file). */
export function splitPath(path: string): { name: string; folder: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { name: path, folder: "" } : { name: path.slice(i + 1), folder: path.slice(0, i) };
}

export type RelativeUnit = "now" | "minutes" | "hours" | "days";

/** Coarse age of `iso` at `now` (ms). Unparseable or future timestamps read as "now". */
export function relativeAge(iso: string, now: number = Date.now()): { unit: RelativeUnit; count: number } {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 60_000) return { unit: "now", count: 0 };
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return { unit: "minutes", count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hours", count: hours };
  return { unit: "days", count: Math.floor(hours / 24) };
}
