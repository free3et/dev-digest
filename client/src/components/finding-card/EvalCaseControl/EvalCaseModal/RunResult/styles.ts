import type { CSSProperties } from "react";

export const s = {
  box: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 6,
    rowGap: 2,
    fontSize: 12.5,
    lineHeight: 1.5,
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  heading: { fontWeight: 700 } satisfies CSSProperties,
  sep: { color: "var(--text-muted)" } satisfies CSSProperties,
  error: { flexBasis: "100%", color: "var(--crit)", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
