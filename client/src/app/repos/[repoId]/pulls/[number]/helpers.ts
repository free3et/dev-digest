/**
 * Query string (no leading `?`) for opening a file in the Diff tab: sets
 * `tab=diff` and `file`, sets `line` only when known (a stale one is removed),
 * and keeps every other param. The line goes into the URL only; nothing
 * scrolls to it (C-27).
 */
export function diffFocusQuery(search: string | URLSearchParams, file: string, line: number | null): string {
  const sp = new URLSearchParams(typeof search === "string" ? search : search.toString());
  sp.set("tab", "diff");
  sp.set("file", file);
  if (line != null) sp.set("line", String(line));
  else sp.delete("line");
  return sp.toString();
}
