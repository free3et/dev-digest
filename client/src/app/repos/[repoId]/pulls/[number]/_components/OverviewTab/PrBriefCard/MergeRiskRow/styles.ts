import type { CSSProperties } from "react";

export const s = {
  row: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  title: {
    fontWeight: 600,
    fontSize: 13,
    flex: "1 1 0",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  explanation: {
    margin: 0,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  refs: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  ref: {
    fontSize: 12,
    color: "var(--accent-text)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
