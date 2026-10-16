import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 0, minWidth: 0 } satisfies CSSProperties,
  label: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 } satisfies CSSProperties,
  list: { display: "flex", gap: 2, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  tab: (on: boolean) =>
    ({
      padding: "8px 12px",
      border: "none",
      background: "transparent",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: on ? 600 : 500,
      color: on ? "var(--text-primary)" : "var(--text-secondary)",
      borderBottom: "2px solid " + (on ? "var(--accent)" : "transparent"),
      marginBottom: -1,
    }) satisfies CSSProperties,
  panel: { paddingTop: 10, minWidth: 0 } satisfies CSSProperties,
  // The diff scrolls inside its panel; the modal keeps its size (NFR-5).
  diff: {
    margin: 0,
    padding: 10,
    maxHeight: 280,
    overflow: "auto",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
  } satisfies CSSProperties,
  files: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  file: {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: 12.5,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  meta: { margin: 0, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "4px 12px", fontSize: 13 } satisfies CSSProperties,
  term: { color: "var(--text-secondary)" } satisfies CSSProperties,
  value: { margin: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  body: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 160, overflow: "auto" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
