import type { CSSProperties } from "react";

export const s = {
  head: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  filter: {
    display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 7,
    border: "1px solid var(--border)", background: "var(--bg-surface)", width: 240,
  } satisfies CSSProperties,
  filterInput: { flex: 1, fontSize: 13, background: "transparent", border: "none", outline: "none", color: "var(--text-primary)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  row: {
    display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowOver: { border: "1px solid var(--accent)" } satisfies CSSProperties,
  handle: { cursor: "grab", color: "var(--text-muted)", userSelect: "none", fontSize: 16, lineHeight: 1, width: 16, textAlign: "center" } satisfies CSSProperties,
  handleMuted: { width: 16, flexShrink: 0 } satisfies CSSProperties,
  names: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  name: { fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  folder: { fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  via: { fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", minWidth: 72, textAlign: "right" } satisfies CSSProperties,
  warn: { fontSize: 12, color: "var(--warn, var(--text-secondary))", whiteSpace: "nowrap", textAlign: "right" } satisfies CSSProperties,
  detach: {
    fontSize: 12, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)",
    background: "transparent", color: "var(--text-primary)", cursor: "pointer",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)", padding: "12px 0" } satisfies CSSProperties,
} as const;
