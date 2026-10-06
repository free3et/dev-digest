import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "2px 10px",
    width: "100%",
    padding: "10px 14px",
    textAlign: "left",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-primary)",
    cursor: "pointer",
    font: "inherit",
  } satisfies CSSProperties,
  rowActive: { background: "var(--bg-hover)" } satisfies CSSProperties,
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  folder: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "1px 7px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    alignSelf: "center",
  } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", textAlign: "right" } satisfies CSSProperties,
} as const;
